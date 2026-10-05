import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import {
  assertOrganizationAccess,
  hasGlobalAccess,
  userOrganizationIds,
} from "../common/access-scope";
import { listResponse, paginationMeta } from "../common/pagination";
import { RequestUser } from "../common/current-user";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CertificatesService } from "../certificates/certificates.service";

export type UploadedInspectionFile = {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
};

@Injectable()
export class InspectionsService implements OnModuleInit, OnModuleDestroy {
  private autoPublishTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificates: CertificatesService,
  ) {}

  onModuleInit() {
    this.autoPublishTimer = setInterval(() => {
      // Publication is manual: only the organization leader confirms to registry.
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.autoPublishTimer) clearInterval(this.autoPublishTimer);
  }

  async list(
    user: RequestUser | undefined,
    page?: string,
    limit?: string,
    q?: string,
    filters: {
      status?: string;
      organizationId?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    const query = q?.trim();
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const requestedOrganizationId = filters.organizationId?.trim();
    const scopedOrganizationIds =
      requestedOrganizationId && requestedOrganizationId !== "all"
        ? organizationIds?.includes(requestedOrganizationId) || hasGlobalAccess(user)
          ? [requestedOrganizationId]
          : []
        : organizationIds;
    const status = filters.status?.trim();
    const createdAt = this.dateRange(filters.dateFrom, filters.dateTo);
    const where = {
      ...(scopedOrganizationIds
        ? { organizationId: { in: scopedOrganizationIds } }
        : {}),
      ...(status && status !== "all" ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query
        ? {
            OR: [
              { status: { contains: query, mode: "insensitive" as const } },
              { vehicle: { vin: { contains: query, mode: "insensitive" as const } } },
              {
                vehicle: {
                  plateNumber: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                organization: {
                  name: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                certificate: {
                  number: { contains: query, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.inspection.findMany({
        where,
        include: {
          organization: true,
          vehicle: { include: { owners: true, cylinders: true } },
          certificate: true,
          photos: true,
          createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
          submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
          approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.inspection.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  private dateRange(dateFrom?: string, dateTo?: string) {
    const range: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) range.gte = from;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(to.getTime())) range.lte = to;
    }
    return range.gte || range.lte ? range : undefined;
  }

  async create(
    user: RequestUser | undefined,
    input: {
      organizationId: string;
      vehicleId: string;
      certificateNumber?: string;
      lat?: number | string;
      lng?: number | string;
      address?: string;
    },
  ) {
    const organizationId = input.organizationId;
    const vehicleId = input.vehicleId;
    const certificateNumber = this.normalizeCertificateNumber(
      input.certificateNumber,
    );
    if (!certificateNumber) {
      throw new BadRequestException("Введите номер свидетельства");
    }
    await assertOrganizationAccess(this.prisma, organizationId, user);
    const existingCertificate = await this.prisma.certificate.findUnique({
      where: { number: certificateNumber },
    });
    const existingDraft = await this.prisma.inspection.findUnique({
      where: { certificateNumber },
    });
    if (existingCertificate || existingDraft) {
      throw new BadRequestException(
        "Свидетельство с таким номером уже есть в системе",
      );
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { address: true },
    });
    const lat = this.coordinate(input.lat, -90, 90);
    const lng = this.coordinate(input.lng, -180, 180);
    const address = organization?.address?.trim() || undefined;
    const inspection = await this.prisma.inspection.create({
      data: {
        organizationId,
        vehicleId,
        certificateNumber,
        lat,
        lng,
        address,
        createdById: user?.sub,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "inspection.create",
        entity: "inspection",
        entityId: inspection.id,
        metadata: { organizationId, vehicleId, certificateNumber },
      },
    });
    return inspection;
  }

  async setStatus(user: RequestUser | undefined, id: string, status: string) {
    if (!["draft", "submitted", "approved", "rejected", "blocked"].includes(status)) {
      throw new BadRequestException("Некорректный статус инспекции");
    }
    const existing = await this.assertInspectionAccess(id, user);
    if (status === "approved") {
      await this.assertOrganizationManager(existing.organizationId, user);
      if (existing.status !== "submitted") {
        throw new BadRequestException(
          "Отправить в реестр можно только инспекцию в статусе submitted",
        );
      }
      const readiness = await this.readiness(id, user);
      if (!readiness.ready) {
        throw new BadRequestException({
          message: "Inspection is not ready for approval",
          missing: readiness.missing,
        });
      }
    }

    const now = new Date();
    const inspection = await this.prisma.inspection.update({
      where: { id },
      data: {
        status,
        submittedAt: status === "submitted" ? now : undefined,
        approvedAt: status === "approved" ? now : undefined,
        submittedById: status === "submitted" ? user?.sub : undefined,
        approvedById: status === "approved" ? user?.sub : undefined,
        autoPublishAt: null,
      },
      include: {
        organization: true,
        vehicle: { include: { owners: true, cylinders: true } },
        certificate: true,
        photos: true,
        createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "inspection.status.update",
        entity: "inspection",
        entityId: inspection.id,
        metadata: {
          previousStatus: existing.status,
          status: inspection.status,
          organizationId: inspection.organizationId,
          certificateNumber: inspection.certificateNumber,
        },
      },
    });
    if (status !== "approved") return inspection;

    const certificate = await this.certificates.issueForInspection(id);
    return { ...inspection, certificate };
  }

  async updateData(
    user: RequestUser | undefined,
    id: string,
    input: { vehicleId: string; certificateNumber?: string },
  ) {
    const existing = await this.assertInspectionAccess(id, user);
    if (existing.status === "approved" || existing.status === "blocked") {
      throw new BadRequestException("Нельзя изменить опубликованную или заблокированную инспекцию");
    }
    const vehicleId = input.vehicleId?.trim();
    if (!vehicleId) throw new BadRequestException("Vehicle is required");
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new BadRequestException("Vehicle not found");
    const certificateNumber = this.normalizeCertificateNumber(
      input.certificateNumber,
    );
    if (!certificateNumber) {
      throw new BadRequestException("Введите номер свидетельства");
    }
    const [certificate, inspectionWithNumber] = await Promise.all([
      this.prisma.certificate.findUnique({
        where: { number: certificateNumber },
      }),
      this.prisma.inspection.findUnique({ where: { certificateNumber } }),
    ]);
    if (
      (certificate?.inspectionId && certificate.inspectionId !== id) ||
      (inspectionWithNumber && inspectionWithNumber.id !== id)
    ) {
      throw new BadRequestException(
        "Свидетельство с таким номером уже есть в системе",
      );
    }
    const inspection = await this.prisma.inspection.update({
      where: { id },
      data: { vehicleId, certificateNumber },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "inspection.data.update",
        entity: "inspection",
        entityId: id,
        metadata: {
          organizationId: inspection.organizationId,
          vehicleId,
          certificateNumber,
        },
      },
    });
    return this.detail(id, user);
  }

  async readiness(id: string, user?: RequestUser) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        photos: true,
        vehicle: { include: { cylinders: true, owners: true } },
      },
    });
    if (!inspection) {
      throw new BadRequestException("Inspection not found");
    }
    await assertOrganizationAccess(
      this.prisma,
      inspection.organizationId,
      user,
    );
    const photoTypes = new Set(inspection.photos.map((photo) => photo.type));
    const required = [
      "cylinder_label",
      "vehicle_photo",
      "tech_passport",
      "gas_work_record",
      "cylinder_work_record",
      "gas_inspection_report",
      "cylinder_inspection_report",
      "certificate_document",
    ];
    const missing = [
      ...required.filter((type) => !photoTypes.has(type)),
      ...(inspection.vehicle.cylinders.length ? [] : ["gas_cylinder"]),
      ...(inspection.vehicle.owners.length ? [] : ["vehicle_owner"]),
    ];
    return {
      ready: missing.length === 0,
      missing,
      photoTypes: [...photoTypes],
    };
  }

  async certificateNumberAvailability(number: string) {
    const certificateNumber = this.normalizeCertificateNumber(number);
    if (!certificateNumber) {
      throw new BadRequestException("Введите номер свидетельства");
    }
    const [certificate, inspection] = await Promise.all([
      this.prisma.certificate.findUnique({
        where: { number: certificateNumber },
      }),
      this.prisma.inspection.findUnique({ where: { certificateNumber } }),
    ]);
    return { available: !certificate && !inspection };
  }

  async detail(id: string, user?: RequestUser) {
    await this.assertInspectionAccess(id, user);
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        organization: true,
        certificate: true,
        photos: { orderBy: { createdAt: "desc" } },
        vehicle: { include: { owners: true, cylinders: true } },
        createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      },
    });
    if (!inspection) throw new BadRequestException("Inspection not found");
    return {
      ...inspection,
      photos: inspection.photos.map((photo) => ({
        ...photo,
        viewUrl: this.storage.objectUrl(photo.objectKey).url,
      })),
    };
  }

  async photos(id: string, user?: RequestUser) {
    await this.assertInspectionAccess(id, user);
    const photos = await this.prisma.inspectionPhoto.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "desc" },
    });
    return photos.map((photo) => ({
      ...photo,
      viewUrl: this.storage.objectUrl(photo.objectKey).url,
    }));
  }

  async uploadPhoto(
    id: string,
    type: string,
    file: UploadedInspectionFile,
    user?: RequestUser,
    location: { lat?: number | string; lng?: number | string } = {},
  ) {
    await this.assertInspectionAccess(id, user);
    const lat = this.coordinate(location.lat, -90, 90);
    const lng = this.coordinate(location.lng, -180, 180);
    const extension =
      file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
    const objectKey = `inspections/${id}/${type}-${randomUUID()}.${extension}`;
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    await this.storage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: file.mimetype,
    });
    const photo = await this.prisma.inspectionPhoto.create({
      data: {
        inspectionId: id,
        type,
        objectKey,
        checksum,
        lat,
        lng,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "inspection.photo.upload",
        entity: "inspection",
        entityId: id,
        metadata: { photoId: photo.id, type, objectKey, lat, lng },
      },
    });
    return photo;
  }

  private async assertInspectionAccess(id: string, user?: RequestUser) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
    });
    if (!inspection) throw new BadRequestException("Inspection not found");
    await assertOrganizationAccess(
      this.prisma,
      inspection.organizationId,
      user,
    );
    return inspection;
  }

  private async assertOrganizationManager(organizationId: string, user?: RequestUser) {
    if (!user?.sub) throw new ForbiddenException("Only organization leader can approve");
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.sub,
        role: "admin",
      },
    });
    if (!membership) {
      throw new ForbiddenException("Только руководитель ИО может отправить свидетельство в реестр");
    }
  }

  private coordinate(
    value: number | string | undefined,
    min: number,
    max: number,
  ) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max)
      return undefined;
    return parsed;
  }

  private normalizeCertificateNumber(value?: string) {
    return value?.replace(/\s+/g, "").trim().toUpperCase();
  }

  private async reverseGeocode(lat: number, lng: number) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "ERSI-GBO/1.0 inspection location",
            "Accept-Language": "ru,kk,en",
          },
        },
      );
      clearTimeout(timeout);
      if (!response.ok) return undefined;
      const data = (await response.json()) as { display_name?: string };
      return data.display_name?.slice(0, 500);
    } catch {
      return undefined;
    }
  }
}
