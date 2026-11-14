import { assertCylinderAvailable } from './cylinder-uniqueness';
import { requiredCylinderShape } from './cylinder-pair';
import { certificateNumberConflict } from '../common/certificate-number-conflict';
import { reverseGeocodeInspection, inspectionAddressUnavailable } from './inspection-address';
import { Prisma } from '@prisma/client';
import { TechPassportService } from '../tech-passport/tech-passport.service';
import { passportProofMatches } from '../tech-passport/passport-content';
import { assertSecondCylinderUnique } from './second-cylinder-uniqueness';
import { CylinderPairInput, cylinderPair, secondCylinderDocuments, activeCylinderPhotos, allSecondCylinderDocuments } from './cylinder-pair';
import sharp from 'sharp';
import {notifyPhotoReview,notifyPhotoRejection} from './photo-review-notifications';
import { cylinderProducedAt } from '../common/cylinder-date';
import { PhotoModerationService } from '../photo-moderation/photo-moderation.service';
import { ownerPhone as normalizeOwnerPhone } from '../common/owner-phone';
import { ownerIdentity } from '../common/owner-identity';
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
    private readonly techPassport: TechPassportService = new TechPassportService(),
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
    const [items, total, statusCounts, issuedCertificates] = await Promise.all([
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
      this.prisma.inspection.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.inspection.count({ where: { ...where, certificate: { isNot: null } } }),
    ]);
    return { ...listResponse(items.map(item => ({...item, photos: activeCylinderPhotos(item, item.photos)})), total, page, limit),
      summary: { total, issuedCertificates, byStatus: Object.fromEntries(statusCounts.map(row => [row.status, row._count._all])) },
    };
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
      secondCylinder?: CylinderPairInput["secondCylinder"];
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
      where: { organizationId_number: { organizationId, number: certificateNumber } },
    });
    const existingDraft = await this.prisma.inspection.findUnique({
      where: { organizationId_certificateNumber: { organizationId, certificateNumber } },
    });
    if (existingCertificate || existingDraft) {
      throw new BadRequestException(
        "Свидетельство с таким номером уже есть в этом инспекционном органе",
      );
    }
    const lat = this.coordinate(input.lat, -90, 90);
    const lng = this.coordinate(input.lng, -180, 180);
    if (lat === undefined || lng === undefined) {
      throw new BadRequestException("Не удалось определить место проведения инспекции. Включите геолокацию и повторите отправку");
    }
    // The organization and owner addresses are never evidence of the visit location.
    const resolvedAddress = await this.reverseGeocode(lat, lng);
    if (!resolvedAddress) throw new BadRequestException(inspectionAddressUnavailable);
    const address = resolvedAddress;
    let pair: ReturnType<typeof cylinderPair>;
    if (input.usesTwoCylinders === true) {
      const vehicle = await this.prisma.vehicle.findUnique({where:{id:vehicleId},include:{cylinders:true}});
      if (!vehicle) throw new BadRequestException("Автомобиль не найден");
      pair = cylinderPair(input, vehicle.cylinders[0]?.serialNumber ?? "", undefined, vehicle.cylinders[0]?.inspectedAt ?? new Date(), true, vehicle.cylinders[0]?.fuelType ?? undefined);
    } else {
      pair = cylinderPair(input, "");
    }
    await assertSecondCylinderUnique(this.prisma,pair,vehicleId);
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
    }).catch(certificateNumberConflict);
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "inspection.create",
        entity: "inspection",
        entityId: inspection.id,
        metadata: { organizationId, vehicleId, certificateNumber, lat, lng, address, locationSource: "device_coordinates", addressSource: "reverse_geocoding" },
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
      if (existing.usesTwoCylinders && !existing.secondQualityDocumentUploadedAt) throw new BadRequestException("Контроль качества должен загрузить свидетельство второго баллона после отправки инспекции");
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

    if (["submitted", "quality_approved", "approved"].includes(status)) {
      await this.requireStoredAddress(existing);
    }

    // Keep the existing return command compatible with old clients, but route
    // a manager's return one step back, to quality control rather than inspector.
    const previousStatus = existing.status;
    const managerReturn = status === "rejected" && existing.status === "quality_approved";
    const nextStatus = managerReturn ? "submitted" : status;
    const now = new Date();
    const inspection = await this.prisma.inspection.update({
      where: { id, status: existing.status, ...(["quality_approved","rejected"].includes(status) && existing.status === "submitted" ? {qualityReviewerId:user?.sub} : {}), ...(status === "quality_approved" ? { qualityDocumentUploadedAt: existing.qualityDocumentUploadedAt, ...(existing.usesTwoCylinders?{secondQualityDocumentUploadedAt:existing.secondQualityDocumentUploadedAt}:{}) } : {}) },
      data: {
        status: nextStatus,
        requireApplicantPhotos: status === "submitted" ? true : undefined,
        qualityDocumentUploadedAt: ["submitted", "rejected", "draft"].includes(status) ? null : undefined,
        secondQualityDocumentUploadedAt: ["submitted", "rejected", "draft"].includes(status) ? null : undefined,
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
          previousStatus,
          status: inspection.status,
          requestedStatus: status,
          returnTarget: status === "rejected" ? (managerReturn ? "quality_control" : "inspector") : undefined,
          organizationId: inspection.organizationId,
          certificateNumber: inspection.certificateNumber,
        },
      },
    });
    if (status !== "approved") return {...inspection, photos: activeCylinderPhotos(inspection, inspection.photos)};

    const certificate = await this.certificates.issueForInspection(id);
    return { ...inspection, photos: activeCylinderPhotos(inspection, inspection.photos), certificate };
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
    if (!certificateNumber) throw new BadRequestException("Введите номер свидетельства");
    const identity = ownerIdentity(input.owner);
    const ownerName = text(input.owner?.fullName,"ФИО / наименование владельца");
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
    const pair = cylinderPair(input, serialNumber, inspection, input.inspectionDate, false, input.cylinder.fuelType);
    await assertSecondCylinderUnique(this.prisma,pair,inspection.vehicleId);
    const year = input.vehicle.year;
    if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw new BadRequestException("Некорректный год автомобиля");
    await this.prisma.$transaction(async tx => {
      const current = await tx.inspection.findUnique({where:{id},include:{vehicle:{include:{owners:{include:{user:true}},cylinders:true}}}});
      if (!current || current.status !== "submitted") throw new BadRequestException("Этап инспекции изменился. Обновите карточку");
      const used = await tx.inspection.findUnique({where:{organizationId_certificateNumber:{organizationId:inspection.organizationId,certificateNumber}}});
      const certificate = await tx.certificate.findUnique({where:{organizationId_number:{organizationId:inspection.organizationId,number:certificateNumber}}});
      if ((used && used.id !== id) || certificate) throw new BadRequestException("Этот номер свидетельства уже используется в этом инспекционном органе");
      const manufacturer = input.cylinder.manufacturer?.trim() || "Не указан";
      const shape = requiredCylinderShape(input.cylinder.shape);
      await assertCylinderAvailable(tx,{serialNumber,manufacturer,shape},current.vehicleId);
      await tx.inspection.update({where:{id,status:"submitted",qualityReviewerId:user!.sub},data:{certificateNumber,...pair,qualityConfirmedAt:null,qualityConfirmedById:null,qualityDocumentUploadedAt:null,secondQualityDocumentUploadedAt:null}});
      await tx.vehicle.update({where:{id:current.vehicleId},data:{vin,plateNumber,normalizedPlate:plateNumber.replace(/[^0-9a-zA-Zа-яА-Я]/g,"").toUpperCase(),vinLast3:vin.slice(-3),make:input.vehicle.make?.trim() || "Не указано",model:input.vehicle.model?.trim() || "Не указано",year:year ?? null}});
      const owner = current.vehicle.owners[0];
      if (!owner) throw new BadRequestException("Владелец автомобиля не найден");
      const phone = input.owner.phone === undefined ? owner.phone : normalizeOwnerPhone(input.owner.phone);
      await tx.vehicleOwner.update({where:{id:owner.id},data:{userId:null,phone,fullName:ownerName,address:ownerAddress,...identity}});
      const cylinder = current.vehicle.cylinders[0];
      const data = {shape,serialNumber,manufacturer,volumeLiters:input.cylinder.volumeLiters,reducerName,controlUnitName,producedAt,...period};
      if (cylinder) await tx.gasCylinder.update({where:{id:cylinder.id},data});
      else await tx.gasCylinder.create({data:{...data,vehicleId:current.vehicleId}});
      await tx.auditLog.create({data:{actorId:user!.sub,action:"inspection.quality.data.update",entity:"inspection",entityId:id,metadata:{certificateNumber,previousCertificateNumber:current.certificateNumber,fields:["owner","vehicle","cylinder","certificateNumber","inspectionDate"]}}});
    }).catch(certificateNumberConflict);
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
        where: { organizationId_number: { organizationId: existing.organizationId, number: certificateNumber } },
      }),
      this.prisma.inspection.findUnique({ where: { organizationId_certificateNumber: { organizationId: existing.organizationId, certificateNumber } } }),
    ]);
    if (
      (certificate?.inspectionId && certificate.inspectionId !== id) ||
      (inspectionWithNumber && inspectionWithNumber.id !== id)
    ) {
      throw new BadRequestException(
        "Свидетельство с таким номером уже есть в этом инспекционном органе",
      );
    }
    const pair = cylinderPair(input, vehicle.cylinders?.[0]?.serialNumber ?? "", existing, vehicle.cylinders?.[0]?.inspectedAt ?? existing.createdAt, false, vehicle.cylinders?.[0]?.fuelType ?? undefined);
    await assertSecondCylinderUnique(this.prisma,pair,vehicleId);
    const inspection = await this.prisma.inspection.update({
      where: { id },
      data: { vehicleId, certificateNumber, ...pair },
    }).catch(certificateNumberConflict);
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
    const photoTypes = new Set(inspection.photos.filter(photo => !allSecondCylinderDocuments.includes(photo.type) || (inspection.usesTwoCylinders && photo.cylinderSerial === inspection.secondCylinderSerial)).map((photo) => photo.type));
    const verifiedPassport=inspection.photos.find(photo=>photo.type==='tech_passport'&&/\.pdf$/i.test(photo.objectKey)&&photo.documentVerification);
    const passportChanged=verifiedPassport && !passportProofMatches(verifiedPassport.documentVerification,inspection.vehicle);
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
      ...(["draft", "rejected"].includes(inspection.status) ? [] : ["certificate_document",...(inspection.usesTwoCylinders ? ["certificate_document_2"] : [])]),
    ];
    const missing = [
      ...(!["Тороидальный", "Цилиндрический"].includes(inspection.vehicle.cylinders[0]?.shape ?? "") ? ["cylinder_shape"] : []),
      ...(inspection.usesTwoCylinders && !["Тороидальный", "Цилиндрический"].includes(inspection.secondCylinderShape ?? "") ? ["second_cylinder_shape"] : []),
      ...required.filter((type) => !photoTypes.has(type)),
      ...(passportChanged?['tech_passport_vehicle_mismatch']:[]),
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

  async certificateNumberAvailability(number: string, inspectionId?: string, user?: RequestUser, requestedOrganizationId?: string) {
    let organizationId = requestedOrganizationId?.trim();
    if (inspectionId) {
      const current = await this.assertInspectionAccess(inspectionId, user);
      if (organizationId && organizationId !== current.organizationId) throw new BadRequestException('Выбран другой инспекционный орган');
      organizationId = current.organizationId;
    }
    if (!organizationId && !hasGlobalAccess(user)) {
      const ids = [...new Set(await userOrganizationIds(this.prisma, user))];
      if (ids.length === 1) organizationId = ids[0];
    }
    if (!organizationId) throw new BadRequestException('Выберите инспекционный орган');
    await assertOrganizationAccess(this.prisma, organizationId, user);
    const certificateNumber = this.normalizeCertificateNumber(number);
    if (!certificateNumber) throw new BadRequestException('Введите номер свидетельства');
    const [certificate, inspection] = await Promise.all([
      this.prisma.certificate.findUnique({ where: { organizationId_number: { organizationId, number: certificateNumber } } }),
      this.prisma.inspection.findUnique({ where: { organizationId_certificateNumber: { organizationId, certificateNumber } } }),
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
    const inspection = await this.assertInspectionAccess(id, user);
    const photos = await this.prisma.inspectionPhoto.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "desc" },
    });
    return activeCylinderPhotos(inspection, photos).map((photo) => ({
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
    const isCertificate = ["certificate_document","certificate_document_2"].includes(type);
    const qualityUploadField = type === "certificate_document_2" ? "secondQualityDocumentUploadedAt" : "qualityDocumentUploadedAt";
    if (!["cylinder_label","cylinder_label_2","cylinder_work_record_2","cylinder_inspection_report_2","vehicle_photo","tech_passport","tech_passport_back","applicant_application","applicant_questionnaire","gas_work_record","cylinder_work_record","gas_inspection_report","cylinder_inspection_report","certificate_document","certificate_document_2","photo"].includes(type)) throw new BadRequestException("Неизвестный тип документа");
    if (["gas_work_record","cylinder_work_record","gas_inspection_report","cylinder_inspection_report","cylinder_work_record_2","cylinder_inspection_report_2"].includes(type)) {
      const qualityMember = await this.prisma.organizationMember.findFirst({where:{organizationId:inspection.organizationId,userId:user?.sub,role:"quality_control"}});
      if (qualityMember) throw new ForbiddenException("Контроль качества не может изменять рабочие записи и отчеты инспекции");
    }
    if (isCertificate) {
      await this.claimQualityReview(user,id);
      if (inspection.status !== "submitted") throw new BadRequestException("Свидетельство загружается на этапе контроля качества");
    } else if (inspection.status === "submitted" && ["cylinder_label", "cylinder_label_2", "vehicle_photo", "tech_passport", "tech_passport_back", "applicant_application", "applicant_questionnaire"].includes(type)) {
      await this.claimQualityReview(user,id);
    } else if (!["draft", "rejected"].includes(inspection.status)) {
      throw new BadRequestException("Документы инспектора зафиксированы. Верните инспекцию на исправление");
    }
    if (allSecondCylinderDocuments.includes(type) && (!inspection.usesTwoCylinders || !inspection.secondCylinderSerial)) throw new BadRequestException("Сначала укажите второй баллон в данных инспекции");
    if (!file?.buffer?.length) throw new BadRequestException("Выберите непустой файл");
    let moderation:Awaited<ReturnType<PhotoModerationService['check']>>;
    let documentVerification:Awaited<ReturnType<TechPassportService['verify']>>['proof']|undefined;
    try{
      if(['tech_passport','tech_passport_back'].includes(type) && file.originalname.toLowerCase().endsWith('.pdf') && file.buffer.subarray(0,5).toString()!=='%PDF-') throw new BadRequestException('Выберите настоящий PDF-файл техпаспорта');
      moderation=await this.photoModeration.check(file.buffer,file.originalname,type.endsWith("_2") ? type.slice(0,-2) : type);
      if(['tech_passport','tech_passport_back'].includes(type) && file.buffer.subarray(0,5).toString()==='%PDF-'){
        const vehicle=await this.prisma.vehicle.findUnique({where:{id:inspection.vehicleId}});
        if(!vehicle) throw new BadRequestException('Автомобиль не найден');
        const primary=type==='tech_passport_back'?await this.prisma.inspectionPhoto.findFirst({where:{inspectionId:id,type:'tech_passport'},orderBy:{createdAt:'desc'}}):null;
        const verified=await this.techPassport.verify(file.buffer,vehicle,type==='tech_passport_back',passportProofMatches(primary?.documentVerification,vehicle));
        documentVerification=verified.proof;
        moderation={...moderation,moderationReason:[moderation.moderationReason,verified.reason].filter(Boolean).join('\n')};
      }
    }
    catch(error){
      if(error instanceof BadRequestException && ['tech_passport','tech_passport_back'].includes(type) && !error.message.startsWith('Техпаспорт:')) error=new BadRequestException('Техпаспорт: '+error.message);
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
    const pdf = file.buffer.subarray(0,5).toString()==='%PDF-';
    const extension = pdf ? 'pdf' : (file.originalname.split(".").pop()?.toLowerCase() ?? "bin");
    const objectKey = `inspections/${id}/${type}-${randomUUID()}.${extension}`;
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const storedObject=await this.storage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: pdf ? "application/pdf" : file.mimetype,
      createdById: user?.sub,
    });
    const photoData = {
        inspectionId: id,
        ...moderation,
        documentVerification,
        type,
        cylinderSerial: allSecondCylinderDocuments.includes(type) ? inspection.secondCylinderSerial : null,
        objectKey,
        checksum,
        lat,
        lng,
      };
    const photo = await this.prisma.$transaction(async tx=>{
      // Updating the parent row serializes uploads from all application instances.
      // Recheck access/status after the lock, since moderation may have taken time.
      const locked = await tx.inspection.update({where:{id},data:{updatedAt:new Date()}});
      if (locked.status !== inspection.status || locked.secondCylinderSerial !== inspection.secondCylinderSerial || locked.usesTwoCylinders !== inspection.usesTwoCylinders) throw new ConflictException("Инспекция изменилась. Обновите данные перед загрузкой");
      if (locked.status === "submitted" && locked.qualityReviewerId !== user!.sub) throw new ConflictException("Инспекцию уже проверяет другой сотрудник");
      const existing = await tx.inspectionPhoto.findFirst({where:{inspectionId:id,type,checksum,cylinderSerial:photoData.cylinderSerial},orderBy:{createdAt:"desc"}});
      if (existing) {
        const passportSlot=['tech_passport','tech_passport_back'].includes(type);
        if(passportSlot) {
          await tx.inspectionPhoto.update({where:{id:existing.id},data:{documentVerification:documentVerification ?? Prisma.DbNull,...moderation,moderationReason:moderation.moderationReason ?? null}});
          await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type,id:{not:existing.id}}});
          if(type==='tech_passport' && pdf) await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type:'tech_passport_back'}});
        }
        const labelSlot=['cylinder_label','cylinder_label_2'].includes(type);
        if(labelSlot) {
          await tx.inspectionPhoto.update({where:{id:existing.id},data:{...moderation,moderationReason:moderation.moderationReason ?? null}});
          if(moderation.moderationStatus==='manual_review')await notifyPhotoReview(tx,id,user?.sub);
        }
        if (isCertificate && !locked[qualityUploadField]) await tx.inspection.update({where:{id},data:{[qualityUploadField]:new Date()}});
        await tx.auditLog.create({data:{actorId:user?.sub,action:"inspection.photo.duplicate_ignored",entity:"inspection",entityId:id,metadata:{photoId:existing.id,fileId:storedObject.id,type,checksum,lat,lng}}});
        return passportSlot ? {...existing,documentVerification:documentVerification ?? null,...moderation,moderationReason:moderation.moderationReason ?? null} : labelSlot ? {...existing,...moderation,moderationReason:moderation.moderationReason ?? null} : existing;
      }
      if(['tech_passport','tech_passport_back'].includes(type)) {
        await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type}});
        if(type==='tech_passport' && pdf) await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type:'tech_passport_back'}});
      } else if(inspection.status === "submitted" && !isCertificate){
        await tx.inspectionPhoto.deleteMany({where:{inspectionId:id,type}});
      }else if(isCertificate){
        await tx.inspection.update({where:{id,status:"submitted",qualityReviewerId:user!.sub},data:{[qualityUploadField]:new Date()}});
      }
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
    if (value == null || (typeof value === "string" && !value.trim())) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max)
      return undefined;
    return parsed;
  }

  private normalizeCertificateNumber(value?: string) {
    return value?.replace(/\s+/g, "").trim().toUpperCase();
  }

  async resolveSavedLocation(id: string, user?: RequestUser) {
    const inspection = await this.assertInspectionAccess(id, user);
    const address = await this.requireStoredAddress(inspection);
    return { lat: inspection.lat, lng: inspection.lng, address };
  }

  private async requireStoredAddress(inspection: { id: string; address: string | null; lat: number | null; lng: number | null }) {
    if (inspection.address?.trim() && !/^GPS\b/i.test(inspection.address.trim())) return inspection.address;
    const resolved = await this.resolveLocation({ lat: inspection.lat ?? undefined, lng: inspection.lng ?? undefined });
    await this.prisma.$transaction(async tx => {
      const result = await tx.inspection.updateMany({
        where: { id: inspection.id, address: inspection.address, lat: inspection.lat, lng: inspection.lng },
        data: { address: resolved.address },
      });
      if (result.count !== 1) throw new ConflictException('Адрес инспекции изменился. Обновите карточку и повторите проверку.');
      await tx.auditLog.create({ data: { action: 'inspection.location.address_repaired', entity: 'inspection', entityId: inspection.id,
        metadata: { previousAddress: inspection.address, address: resolved.address, lat: inspection.lat, lng: inspection.lng, source: 'reverse_geocoding' } } });
    });
    return resolved.address;
  }

  async resolveLocation(input: { lat?: number | string; lng?: number | string }) {
    const lat = this.coordinate(input.lat, -90, 90), lng = this.coordinate(input.lng, -180, 180);
    if (lat === undefined || lng === undefined) throw new BadRequestException('Не удалось определить координаты места инспекции. Включите геолокацию и попробуйте снова.');
    const address = await this.reverseGeocode(lat, lng);
    if (!address) throw new BadRequestException(inspectionAddressUnavailable);
    return { lat, lng, address };
  }

  private async reverseGeocode(lat: number, lng: number) {
    return reverseGeocodeInspection(lat, lng);
  }
}
