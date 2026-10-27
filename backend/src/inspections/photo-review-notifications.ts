import { photoRejectionReason } from "../technical/photo-rejection-reason";
import { randomUUID } from "node:crypto";
import { traceFields, requestContext } from "../observability/request-context";
import { safeText } from "../observability/safe-data";
const PHOTO_NAMES: Record<string, string> = {
  tech_passport: "техпаспорт",
  tech_passport_back: "оборот техпаспорта",
  applicant_application: "заявка",
  applicant_questionnaire: "анкета",
  cylinder_label_2: "бирка второго баллона",
  cylinder_work_record_2: "рабочая запись второго баллона",
  cylinder_inspection_report_2: "отчёт инспекции второго баллона",
  cylinder_label: "бирка баллона",
  vehicle_photo: "автомобиль",
  gas_work_record: "рабочая запись ГБО",
  cylinder_work_record: "рабочая запись баллона",
  gas_inspection_report: "отчёт инспекции ГБО",
  cylinder_inspection_report: "отчёт инспекции баллона",
  certificate_document: "свидетельство",
};
// One current review notice per inspection/recipient; uploads never notify another IO.
export async function notifyPhotoReview(
  tx: any,
  inspectionId: string,
  actorId?: string,
) {
  const inspection = await tx.inspection.findUniqueOrThrow({
    where: { id: inspectionId },
    select: {
      organizationId: true,
      certificateNumber: true,
      organization: { select: { name: true } },
      vehicle: { select: { plateNumber: true } },
    },
  });
  const photos = await tx.inspectionPhoto.findMany({
    where: { inspectionId },
    select: { type: true, moderationStatus: true, moderationReason: true },
  });
  const uncertain = photos.filter(
    (p: any) =>
      p.moderationStatus !== "local_checked" &&
      p.moderationStatus !== "approved",
  );
  const title = uncertain.length
    ? "Перепроверьте фотографии инспекции"
    : "Фотографии инспекции приняты для проверки";
  const details = uncertain.length
    ? uncertain
        .slice(0, 6)
        .map(
          (p: any) =>
            (PHOTO_NAMES[p.type] ?? "фото") +
            ": " +
            (p.moderationReason ?? "Требуется ручная проверка"),
        )
        .join("; ")
    : "Автоматическая проверка не выявила явных дефектов. Контроль качества должен проверить читаемость документов.";
  const actor = actorId
    ? await tx.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      })
    : null;
  const body = [
    inspection.organization.name,
    actor?.fullName ? "Загрузил: " + actor.fullName : "Сотрудник не установлен",
    inspection.vehicle.plateNumber,
    inspection.certificateNumber
      ? "Свидетельство " + inspection.certificateNumber
      : "Инспекция " + inspectionId,
    "Принято фотографий: " + photos.length,
    details,
  ]
    .join(" · ")
    .slice(0, 2400);
  const members = await tx.organizationMember.findMany({
    where: {
      organizationId: inspection.organizationId,
      role: "quality_control",
      user: { isBlocked: false },
    },
    select: { userId: true },
  });
  const recipients = [
    ...["super_admin", "operator", "nca"].map((role) => ({
      role,
      userId: null,
      key: "role:" + role,
    })),
    ...[...new Set(members.map((m: any) => m.userId as string))].map(
      (userId) => ({ role: null, userId, key: "user:" + userId }),
    ),
  ];
  for (const recipient of recipients) {
    const data = {
      title,
      body,
      organizationId: inspection.organizationId,
      entity: "inspection",
      entityId: inspectionId,
      role: recipient.role,
      userId: recipient.userId,
      readAt: null,
      createdAt: new Date(),
    };
    await tx.notification.upsert({
      where: { dedupKey: "photo-review:" + inspectionId + ":" + recipient.key },
      create: {
        ...data,
        dedupKey: "photo-review:" + inspectionId + ":" + recipient.key,
      },
      update: data,
    });
  }
  await tx.technicalAlert.upsert({
    where: { dedupKey: "photo-review:" + inspectionId },
    create: {
      dedupKey: "photo-review:" + inspectionId,
      title,
      explanation: body,
      severity: uncertain.length ? "warning" : "info",
      category: "inspection_photo_review",
    },
    update: {
      title,
      explanation: body,
      severity: uncertain.length ? "warning" : "info",
      lastSeenAt: new Date(),
      repetitions: { increment: 1 },
      acknowledgedAt: null,
      acknowledgedBy: null,
    },
  });
}

// A separate notice for EVERY refused upload. Never attach the rejected original.
export async function notifyPhotoRejection(
  tx: any,
  inspectionId: string,
  type: string,
  reason: string,
  actorId?: string,
  model?: string,
  fileId?: string,
) {
  const inspection = await tx.inspection.findUniqueOrThrow({
    where: { id: inspectionId },
    select: {
      organizationId: true,
      organization: { select: { name: true } },
      vehicle: { select: { plateNumber: true } },
    },
  });
  const actor = actorId
    ? await tx.user.findUnique({
        where: { id: actorId },
        select: { fullName: true },
      })
    : null;
  const attemptId = randomUUID();
  const requestId = requestContext.getStore()?.id;
  const title = "Фотография отклонена при загрузке";
  const body = [
    inspection.organization.name,
    inspection.vehicle.plateNumber,
    actor?.fullName
      ? "Сотрудник: " + actor.fullName
      : "Сотрудник не установлен",
    "Тип документа: " + (PHOTO_NAMES[type] ?? "фото"),
    "Причина: " + reason,
    "Инспекция: " + inspectionId,
    requestId ? "Обращение: " + requestId : "Попытка: " + attemptId,
  ]
    .join(" · ")
    .slice(0, 2400);
  for (const role of ["super_admin", "operator", "nca"])
    await tx.notification.create({
      data: {
        title,
        body: body.replace(
          "Причина: " + reason,
          "Подробная причина сохранена в технической панели",
        ),
        role,
        organizationId: inspection.organizationId,
        entity: "inspection",
        entityId: inspectionId,
        dedupKey: "photo-rejected:" + attemptId + ":" + role,
      },
    });
  await tx.technicalAlert.create({
    data: {
      dedupKey: "photo-rejected:" + attemptId,
      title,
      explanation: body,
      severity: "warning",
      category: "inspection_photo_rejected",
    },
  });
  await tx.technicalEvent.create({
    data: {
      ...traceFields(),
      id: attemptId,
      source: "server",
      category: "security",
      action: "inspection.photo.rejected",
      result: "denied",
      severity: "warning",
      actorId,
      ipAddress: requestContext.getStore()?.request?.ip,
      device: safeText(
        requestContext.getStore()?.request?.headers?.["user-agent"],
        180,
      ),
      objectType: "inspection",
      objectId: inspectionId,
      explanation: safeText(reason, 500),
      details: {
        type,
        fileId,
        moderationModel: model,
        reasonCode: photoRejectionReason(reason).code,
        reason: safeText(reason, 500),
        verified: true,
      },
      expiresAt: new Date(Date.now() + 90 * 86400000),
    },
  });
}
