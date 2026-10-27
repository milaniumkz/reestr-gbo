import { CylinderPairInput, cylinderPair, secondCylinderDocuments, activeCylinderPhotos } from './cylinder-pair';
import sharp from 'sharp';
import {notifyPhotoReview,notifyPhotoRejection} from './photo-review-notifications';
import { cylinderProducedAt } from '../common/cylinder-date';
import { PhotoModerationService } from '../photo-moderation/photo-moderation.service';
import { ownerPhone as normalizeOwnerPhone } from '../common/owner-phone';
import { QualityReviewData } from './quality-review-data';
import { inspectionPeriod } from '../common/inspection-period';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
    private readonly photoModeration: PhotoModerationService = new PhotoModerationService(),
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
          qualityReviewer: { select: { id: true, fullName: true } },
        qualityConfirmedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
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
      usesTwoCylinders?: boolean;
      secondCylinderSerial?: string | null;
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
    let pair = cylinderPair(input, "");
    if (pair.usesTwoCylinders) {
      const vehicle = await this.prisma.vehicle.findUnique({where:{id:vehicleId},include:{cylinders:true}});
      if (!vehicle) throw new BadRequestException("Автомобиль не найден");
      pair = cylinderPair(input, vehicle.cylinders[0]?.serialNumber ?? "");
    }
    const inspection = await this.prisma.inspection.create({
      data: {
        organizationId,
        vehicleId,
        certificateNumber,
        lat,
        lng,
        address,
        createdById: user?.sub,
        requireApplicantPhotos: true,
        ...pair,
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

  async remove(user: RequestUser | undefined, id: string) {
    if (!user?.roles.includes("super_admin")) {
      throw new ForbiddenException("Удаление инспекций доступно только главному администратору");
    }
    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.inspection.findUnique({
        where: { id }, include: { certificate: true },
      });
      if (!inspection) throw new NotFoundException("Инспекция не найдена");
      await tx.auditLog.create({ data: {
        actorId: user.sub, action: "inspection.delete", entity: "inspection", entityId: id,
        metadata: { organizationId: inspection.organizationId, vehicleId: inspection.vehicleId,
          status: inspection.status, certificateNumber: inspection.certificate?.number ?? inspection.certificateNumber,
          certificateId: inspection.certificate?.id ?? null },
      } });
      if (inspection.certificate) {
        await tx.certificateImportJob.updateMany({ where: { certificateId: inspection.certificate.id }, data: { certificateId: null } });
        await tx.certificate.delete({ where: { id: inspection.certificate.id } });
      }
      await tx.inspection.delete({ where: { id } });
      return { ok: true };
    });
  }

  async setStatus(user: RequestUser | undefined, id: string, status: string, confirmed?: boolean) {
    if (!["draft", "submitted", "quality_approved", "approved", "rejected", "blocked"].includes(status)) {
      throw new BadRequestException("Некорректный статус инспекции");
    }
    const existing = await this.assertInspectionAccess(id, user);
    if (status === "submitted") {
      if (!["draft", "rejected"].includes(existing.status)) {
        throw new BadRequestException("В контроль качества можно отправить только черновик или исправленную инспекцию");
      }
      const readiness = await this.readiness(id, user);
      if (!readiness.ready) throw new BadRequestException({ message: "Не хватает данных инспекции", missing: readiness.missing });
    }
    if (status === "quality_approved") {
      await this.claimQualityReview(user,id);
      if (existing.status !== "submitted") throw new BadRequestException("Инспекция должна находиться в контроле качества");
      if (confirmed !== true) throw new BadRequestException("Поставьте галочку Подтверждаю");
      if (!existing.qualityDocumentUploadedAt) throw new BadRequestException("Контроль качества должен загрузить свидетельство после отправки инспекции");
      const readiness = await this.readiness(id, user);
      if (!readiness.ready) throw new BadRequestException({ message: "Загрузите свидетельство и проверьте комплектность документов", missing: readiness.missing });
    }
    if (status === "approved") {
      await this.assertOrganizationManager(existing.organizationId, user);
      if (existing.status !== "quality_approved" || !existing.qualityConfirmedAt) {
        throw new BadRequestException("Отправить в реестр можно только после подтверждения контроля качества");
      }
      const readiness = await this.readiness(id, user);
      if (!readiness.ready) throw new BadRequestException({ message: "Inspection is not ready for approval", missing: readiness.missing });
    }
    if (status === "rejected") {
      if (existing.status === "submitted") await this.claimQualityReview(user,id);
      else if (existing.status === "quality_approved") await this.assertOrganizationManager(existing.organizationId, user);
      else throw new BadRequestException("На исправление можно вернуть только инспекцию на проверке");
    }
    if (status === "draft" && !["draft", "rejected"].includes(existing.status)) {
      throw new BadRequestException("Нельзя вернуть инспекцию в черновик в обход проверки качества");
    }

    const now = new Date();
    const inspection = await this.prisma.inspection.update({
      where: { id, status: existing.status, ...(["quality_approved","rejected"].includes(status) && existing.status === "submitted" ? {qualityReviewerId:user?.sub} : {}), ...(status === "quality_approved" ? { qualityDocumentUploadedAt: existing.qualityDocumentUploadedAt } : {}) },
      data: {
        status,
        requireApplicantPhotos: status === "submitted" ? true : undefined,
        qualityDocumentUploadedAt: ["submitted", "rejected", "draft"].includes(status) ? null : undefined,
        qualityReviewerId: ["submitted","rejected","draft"].includes(status) ? null : undefined,
        qualityReviewStartedAt: ["submitted","rejected","draft"].includes(status) ? null : undefined,
        qualityConfirmedAt: status === "quality_approved" ? now : ["submitted", "rejected", "draft"].includes(status) ? null : undefined,
        qualityConfirmedById: status === "quality_approved" ? user?.sub : ["submitted", "rejected", "draft"].includes(status) ? null : undefined,
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
        qualityReviewer: { select: { id: true, fullName: true } },
        qualityConfirmedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
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

  async claimQualityReview(user: RequestUser | undefined, id: string) {
    const inspection = await this.assertInspectionAccess(id,user);
    await this.assertQualityControl(inspection.organizationId,user);
    return this.prisma.$transaction(async tx => {
      const result = await tx.inspection.updateMany({
        where:{id,status:"submitted",qualityReviewerId:null},
        data:{qualityReviewerId:user!.sub,qualityReviewStartedAt:new Date()},
      });
      const current = await tx.inspection.findUnique({where:{id},include:{qualityReviewer:{select:{id:true,fullName:true}}}});
      if (!current || current.status !== "submitted") throw new BadRequestException("Инспекция уже не находится в контроле качества");
      if (current.qualityReviewerId !== user!.sub) {
        throw new ConflictException(`Инспекцию уже проверяет ${current.qualityReviewer?.fullName || 'другой сотрудник контроля качества'}`);
      }
      if (result.count) await tx.auditLog.create({data:{actorId:user!.sub,action:"inspection.quality.review.claim",entity:"inspection",entityId:id}});
      return {ok:true,qualityReviewerId:current.qualityReviewerId,qualityReviewer:current.qualityReviewer,qualityReviewStartedAt:current.qualityReviewStartedAt};
    });
  }

  async releaseQualityReview(user: RequestUser | undefined, id: string) {
    const inspection = await this.assertInspectionAccess(id,user);
    const supervisor = user?.roles.includes("super_admin");
    if (!supervisor) await this.assertQualityControl(inspection.organizationId,user);
    return this.prisma.$transaction(async tx => {
      const result = await tx.inspection.updateMany({where:{id,status:"submitted",qualityReviewerId:supervisor ? {not:null} : user!.sub},data:{qualityReviewerId:null,qualityReviewStartedAt:null}});
      if (!result.count) throw new ConflictException("Можно освободить только свою проверку на этапе контроля качества");
      await tx.auditLog.create({data:{actorId:user!.sub,action:"inspection.quality.review.release",entity:"inspection",entityId:id}});
      return {ok:true};
    });
  }

  async updateQualityData(user: RequestUser | undefined, id: string, input: QualityReviewData) {
    const inspection = await this.assertInspectionAccess(id,user);
    await this.claimQualityReview(user,id);
    if (inspection.status !== "submitted") throw new BadRequestException("Исправления доступны только на этапе контроля качества");
    const text = (value: unknown, label: string) => {
      if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`Заполните: ${label}`);
      return value.trim();
    };
    const certificateNumber = this.normalizeCertificateNumber(text(input.certificateNumber,"номер свидетельства"));
    const ownerName = text(input.owner?.fullName,"ФИО владельца");
    const ownerAddress = text(input.owner?.address,"адрес владельца");
    const vin = text(input.vehicle?.vin,"VIN").toUpperCase();
    const plateNumber = text(input.vehicle?.plateNumber,"госномер").toUpperCase();
    const serialNumber = text(input.cylinder?.serialNumber,"номер баллона");
    const reducerName = text(input.cylinder?.reducerName,"редуктор");
    const controlUnitName = text(input.cylinder?.controlUnitName,"ЭБУ");
    if (!Number.isInteger(input.cylinder.volumeLiters) || input.cylinder.volumeLiters <= 0) throw new BadRequestException("Укажите положительный объем баллона");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inspectionDate ?? "")) throw new BadRequestException("Укажите дату инспекции");
    const period = inspectionPeriod(text(input.cylinder.fuelType,"тип газа"),input.inspectionDate);
    if (period.inspectedAt.toISOString().slice(0,10) !== input.inspectionDate) throw new BadRequestException("Некорректная дата инспекции");
    const producedAt = cylinderProducedAt(input.cylinder.producedAt);
    const pair = cylinderPair(input, serialNumber, inspection);
    const year = input.vehicle.year;
    if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw new BadRequestException("Некорректный год автомобиля");
    await this.prisma.$transaction(async tx => {
      const current = await tx.inspection.findUnique({where:{id},include:{vehicle:{include:{owners:{include:{user:true}},cylinders:true}}}});
      if (!current || current.status !== "submitted") throw new BadRequestException("Этап инспекции изменился. Обновите карточку");
      const used = await tx.inspection.findUnique({where:{certificateNumber}});
      const certificate = await tx.certificate.findUnique({where:{number:certificateNumber}});
      if ((used && used.id !== id) || certificate) throw new BadRequestException("Этот номер свидетельства уже используется");
      const manufacturer = input.cylinder.manufacturer?.trim() || "Не указан";
      const duplicate = await tx.gasCylinder.findFirst({where:{serialNumber,manufacturer,vehicleId:{not:current.vehicleId}}});
      if (duplicate) throw new BadRequestException("Этот баллон уже привязан к другому автомобилю");
      await tx.inspection.update({where:{id,status:"submitted",qualityReviewerId:user!.sub},data:{certificateNumber,...pair,qualityConfirmedAt:null,qualityConfirmedById:null}});
      await tx.vehicle.update({where:{id:current.vehicleId},data:{vin,plateNumber,normalizedPlate:plateNumber.replace(/[^0-9a-zA-Zа-яА-Я]/g,"").toUpperCase(),vinLast3:vin.slice(-3),make:input.vehicle.make?.trim() || "Не указано",model:input.vehicle.model?.trim() || "Не указано",year:year ?? null}});
      const owner = current.vehicle.owners[0];
      if (!owner) throw new BadRequestException("Владелец автомобиля не найден");
      const phone = input.owner.phone === undefined ? owner.phone : normalizeOwnerPhone(input.owner.phone);
      await tx.vehicleOwner.update({where:{id:owner.id},data:{userId:null,phone,fullName:ownerName,address:ownerAddress,iin:input.owner.iin?.trim() || null}});
      const cylinder = current.vehicle.cylinders[0];
      const data = {serialNumber,manufacturer,volumeLiters:input.cylinder.volumeLiters,reducerName,controlUnitName,producedAt,...period};
      if (cylinder) await tx.gasCylinder.update({where:{id:cylinder.id},data});
      else await tx.gasCylinder.create({data:{...data,vehicleId:current.vehicleId}});
      await tx.auditLog.create({data:{actorId:user!.sub,action:"inspection.quality.data.update",entity:"inspection",entityId:id,metadata:{certificateNumber,previousCertificateNumber:current.certificateNumber,fields:["owner","vehicle","cylinder","certificateNumber","inspectionDate"]}}});
    });
    return this.detail(id,user);
  }

  async updateData(
    user: RequestUser | undefined,
    id: string,
    input: { vehicleId: string; certificateNumber?: string } & CylinderPairInput,
  ) {
    const existing = await this.assertInspectionAccess(id, user);
    if (!["draft", "rejected"].includes(existing.status)) {
      throw new BadRequestException("Данные можно изменять только в черновике или после возврата на исправление");
    }
    const vehicleId = input.vehicleId?.trim();
    if (!vehicleId) throw new BadRequestException("Vehicle is required");
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {cylinders:true},
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
      data: { vehicleId, certificateNumber, ...cylinderPair(input, vehicle.cylinders?.[0]?.serialNumber ?? "", existing) },
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
    const photoTypes = new Set(inspection.photos.filter(photo => !secondCylinderDocuments.includes(photo.type) || (inspection.usesTwoCylinders && photo.cylinderSerial === inspection.secondCylinderSerial)).map((photo) => photo.type));
    const required = [
      "cylinder_label",
      ...(inspection.usesTwoCylinders ? secondCylinderDocuments : []),
      "vehicle_photo",
      "tech_passport",
      ...(["draft", "rejected"].includes(inspection.status) || inspection.requireApplicantPhotos ? ["applicant_application", "applicant_questionnaire"] : []),
      "gas_work_record",
      "cylinder_work_record",
      "gas_inspection_report",
      "cylinder_inspection_report",
      ...(["draft", "rejected"].includes(inspection.status) ? [] : ["certificate_document"]),
    ];
    const missing = [
      ...required.filter((type) => !photoTypes.has(type)),
      ...(inspection.usesTwoCylinders && !inspection.secondCylinderSerial?.trim() ? ["second_cylinder_serial"] : []),
      ...(inspection.vehicle.cylinders.length ? [] : ["gas_cylinder"]),
      ...(inspection.vehicle.owners.length ? [] : ["vehicle_owner"]),
      ...(inspection.vehicle.cylinders.length && !inspection.vehicle.cylinders[0].producedAt ? ["cylinder_produced_at"] : []),
      ...(inspection.vehicle.cylinders.length && !["СНГ", "КПГ", "LPG", "CNG"].includes(inspection.vehicle.cylinders[0].fuelType?.trim().toUpperCase() ?? "") ? ["fuel_type"] : []),
    ];
    return {
      ready: missing.length === 0,
      missing,
      photoTypes: [...photoTypes],
    };
  }

  async certificateNumberAvailability(number: string, inspectionId?: string, user?: RequestUser) {
    if (inspectionId) await this.assertInspectionAccess(inspectionId,user);
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
    return { available: !certificate && (!inspection || inspection.id === inspectionId) };
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
        qualityReviewer: { select: { id: true, fullName: true } },
        qualityConfirmedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      },
    });
    if (!inspection) throw new BadRequestException("Inspection not found");
    return {
      ...inspection,
      photos: activeCylinderPhotos(inspection, inspection.photos).map((photo) => ({
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

  async rotatePhoto(id: string, photoId: string, turns: unknown, expectedObjectKey: unknown, user?: RequestUser) {
    if (turns !== -1 && turns !== 1) throw new BadRequestException("Выберите поворот влево или вправо");
    if (typeof expectedObjectKey !== 'string' || !expectedObjectKey) throw new BadRequestException("Обновите фотографию перед поворотом");
    const inspection = await this.assertInspectionAccess(id, user);
    await this.assertQualityControl(inspection.organizationId, user);
    if (inspection.status !== 'submitted' || inspection.qualityReviewerId !== user!.sub) {
      throw new ConflictException("Повернуть фото может сотрудник, проверяющий эту инспекцию");
    }
    const photo = await this.prisma.inspectionPhoto.findFirst({where: {id: photoId, inspectionId: id}});
    if (!photo) throw new NotFoundException("Фотография не найдена");
    if (photo.objectKey !== expectedObjectKey) throw new ConflictException("Фотография уже изменена. Обновите инспекцию");
    const original = await this.storage.readObject(photo.objectKey);
    let rotated: Buffer;
    try {
      const image = sharp(original, {limitInputPixels: 40_000_000});
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
        throw new Error('Unsupported image');
      }
      // Normalize EXIF orientation before applying the requested visible turn.
      // PNG preserves the decoded pixels across repeated turns without JPEG loss.
      const normalized = await image.autoOrient().png().toBuffer();
      rotated = await sharp(normalized, {limitInputPixels: 40_000_000}).rotate(turns * 90).png().toBuffer();
    } catch {
      throw new BadRequestException("Поворот доступен только для фотографий JPEG, PNG и WebP");
    }
    const objectKey = `inspections/${id}/${photo.type}-rotated-${randomUUID()}.png`;
    const stored = await this.storage.putObject({key: objectKey, body: rotated, createdById: user!.sub});
    const saved = await this.prisma.$transaction(async tx => {
      const locked = await tx.inspection.updateMany({
        where: {id, status: 'submitted', qualityReviewerId: user!.sub},
        data: {updatedAt: new Date()},
      });
      if (locked.count !== 1) throw new ConflictException("Инспекция уже не находится у вас на проверке");
      const updated = await tx.inspectionPhoto.updateMany({
        where: {id: photoId, inspectionId: id, objectKey: photo.objectKey},
        data: {objectKey, checksum: createHash('sha256').update(rotated).digest('hex')},
      });
      if (updated.count !== 1) throw new ConflictException("Фотография уже изменена. Обновите инспекцию");
      await tx.auditLog.create({data: {actorId: user!.sub, action: 'inspection.photo.rotate', entity: 'inspection', entityId: id,
        metadata: {photoId, fileId: stored.id, type: photo.type, turns, objectKey, previousObjectKey: photo.objectKey}}});
      return tx.inspectionPhoto.findUniqueOrThrow({where: {id: photoId}});
    });
    return {...saved, viewUrl: this.storage.objectUrl(saved.objectKey).url};
  }

  moderationStatus() { return this.photoModeration.status(); }

  async uploadPhoto(
    id: string,
    type: string,
    file: UploadedInspectionFile,
    user?: RequestUser,
    location: { lat?: number | string; lng?: number | string } = {},
  ) {
    const inspection = await this.assertInspectionAccess(id, user);
    if (!["cylinder_label","cylinder_label_2","cylinder_work_record_2","cylinder_inspection_report_2","vehicle_photo","tech_passport","tech_passport_back","applicant_application","applicant_questionnaire","gas_work_record","cylinder_work_record","gas_inspection_report","cylinder_inspection_report","certificate_document","photo"].includes(type)) throw new BadRequestException("Неизвестный тип документа");
    if (["gas_work_record","cylinder_work_record","gas_inspection_report","cylinder_inspection_report","cylinder_work_record_2","cylinder_inspection_report_2"].includes(type)) {
      const qualityMember = await this.prisma.organizationMember.findFirst({where:{organizationId:inspection.organizationId,userId:user?.sub,role:"quality_control"}});
      if (qualityMember) throw new ForbiddenException("Контроль качества не может изменять рабочие записи и отчеты инспекции");
    }
    if (type === "certificate_document") {
      await this.claimQualityReview(user,id);
      if (inspection.status !== "submitted") throw new BadRequestException("Свидетельство загружается на этапе контроля качества");
    } else if (inspection.status === "submitted" && ["cylinder_label", "cylinder_label_2", "vehicle_photo", "tech_passport", "tech_passport_back", "applicant_application", "applicant_questionnaire"].includes(type)) {
      await this.claimQualityReview(user,id);
    } else if (!["draft", "rejected"].includes(inspection.status)) {
      throw new BadRequestException("Документы инспектора зафиксированы. Верните инспекцию на исправление");
    }
    if (secondCylinderDocuments.includes(type) && (!inspection.usesTwoCylinders || !inspection.secondCylinderSerial)) throw new BadRequestException("Сначала укажите второй баллон в данных инспекции");
    if (!file?.buffer?.length) throw new BadRequestException("Выберите непустой файл");
    let moderation:Awaited<ReturnType<PhotoModerationService['check']>>;
    try{moderation=await this.photoModeration.check(file.buffer,file.originalname,type.endsWith("_2") ? type.slice(0,-2) : type);}
    catch(error){
      if(error instanceof BadRequestException){
        let evidenceFileId:string|undefined;
        try {
          if(file.buffer.length<=12*1024*1024){
            const stored=await this.storage.putObject({key:`technical-rejections/${randomUUID()}.bin`,body:file.buffer,createdById:user?.sub});
            evidenceFileId=stored.id;
          }
        } catch { /* Record the refusal even when evidence storage is unavailable. */ }
        await this.prisma.$transaction(tx=>notifyPhotoRejection(tx,id,type,error.message,user?.sub,this.photoModeration.status().model,evidenceFileId));
      }
      throw error;
    }
    const lat = this.coordinate(location.lat, -90, 90);
    const lng = this.coordinate(location.lng, -180, 180);
    const extension =
      file.originalname.split(".").pop()?.toLowerCase() ?? "bin";
    const objectKey = `inspections/${id}/${type}-${randomUUID()}.${extension}`;
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const storedObject=await this.storage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: file.mimetype,
      createdById: user?.sub,
    });
    const photoData = {
        inspectionId: id,
        ...moderation,
        type,
        cylinderSerial: secondCylinderDocuments.includes(type) ? inspection.secondCylinderSerial : null,
        objectKey,
        checksum,
        lat,
        lng,
      };
    const photo = await this.prisma.$transaction(async tx=>{
      if(inspection.status === "submitted" && type !== "certificate_document"){
        await tx.inspection.update({where:{id,status:"submitted",qualityReviewerId:user!.sub},data:{updatedAt:new Date()}});
        await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type}});
      }else if(type === "certificate_document"){
        await tx.inspection.update({where:{id,status:"submitted",qualityReviewerId:user!.sub},data:{qualityDocumentUploadedAt:new Date()}});
      }else await tx.inspection.update({where:{id},data:{updatedAt:new Date()}});
      const saved=await tx.inspectionPhoto.create({data:photoData});
      if(moderation.moderationStatus==='manual_review')await notifyPhotoReview(tx,id,user?.sub);
      await tx.auditLog.create({data:{actorId:user?.sub,action:"inspection.photo.upload",entity:"inspection",entityId:id,metadata:{photoId:saved.id,fileId:storedObject.id,type,objectKey,lat,lng}}});
      return saved;
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

  private async assertQualityControl(organizationId: string, user?: RequestUser) {
    if (!user?.sub) throw new ForbiddenException("Только контроль качества может подтвердить документы");
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.sub, role: "quality_control" },
    });
    if (!membership) throw new ForbiddenException("Только контроль качества может загрузить свидетельство и подтвердить инспекцию");
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
