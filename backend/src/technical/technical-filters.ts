import { Prisma } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
export function filterIds(q: any) {
  const read = (value: any) => {
    if (!value) return undefined;
    const id = String(value);
    if (!/^[a-f0-9-]{36}$/i.test(id))
      throw new BadRequestException("Неверный идентификатор фильтра");
    return id;
  };
  return {
    organizationId: read(q.organizationId),
    employeeId: read(q.employeeId),
  };
}
export function scopedEventSql(q: any) {
  const { organizationId, employeeId } = filterIds(q);
  return Prisma.sql`TRUE ${employeeId ? Prisma.sql`AND e."actorId"=${employeeId}` : Prisma.empty}
 ${
   organizationId
     ? Prisma.sql`AND (CASE
 WHEN e."objectId"=${organizationId} THEN TRUE
 WHEN e.details->>'organizationId' IS NOT NULL THEN e.details->>'organizationId'=${organizationId}
 WHEN EXISTS(SELECT 1 FROM "Inspection" i WHERE i.id=e."objectId") THEN EXISTS(SELECT 1 FROM "Inspection" i WHERE i.id=e."objectId" AND i."organizationId"=${organizationId})
 WHEN EXISTS(SELECT 1 FROM "InspectionPhoto" p WHERE p.id=e."objectId") THEN EXISTS(SELECT 1 FROM "InspectionPhoto" p JOIN "Inspection" i ON i.id=p."inspectionId" WHERE p.id=e."objectId" AND i."organizationId"=${organizationId})
 ELSE EXISTS(SELECT 1 FROM "OrganizationMember" m WHERE m."userId"=e."actorId" AND m."organizationId"=${organizationId}) END)`
     : Prisma.empty
 }`;
}
export async function technicalScope(
  db: any,
  q: any,
  kind:
    | "events"
    | "problems"
    | "alerts"
    | "files"
    | "inspections"
    | "people"
    | "organizations",
): Promise<any> {
  const { organizationId, employeeId } = filterIds(q);
  if (!organizationId && !employeeId) return {};
  if (kind === "people")
    return {
      AND: [
        ...(employeeId ? [{ id: employeeId }] : []),
        ...(organizationId
          ? [{ memberships: { some: { organizationId } } }]
          : []),
      ],
    };
  if (kind === "organizations")
    return {
      AND: [
        ...(organizationId ? [{ id: organizationId }] : []),
        ...(employeeId ? [{ members: { some: { userId: employeeId } } }] : []),
      ],
    };
  if (kind === "inspections")
    return {
      AND: [
        ...(organizationId ? [{ organizationId }] : []),
        ...(employeeId
          ? [
              {
                OR: [
                  { createdById: employeeId },
                  { submittedById: employeeId },
                  { qualityReviewerId: employeeId },
                  { qualityConfirmedById: employeeId },
                  { approvedById: employeeId },
                ],
              },
            ]
          : []),
      ],
    };
  if (kind === "files") {
    const ids = await db.$queryRaw(
      Prisma.sql`SELECT p.id FROM "InspectionPhoto" p JOIN "Inspection" i ON i.id=p."inspectionId" WHERE TRUE ${organizationId ? Prisma.sql`AND i."organizationId"=${organizationId}` : Prisma.empty} ${employeeId ? Prisma.sql`AND (EXISTS(SELECT 1 FROM "StorageObject" s WHERE s."objectKey"=p."objectKey" AND s."createdById"=${employeeId}) OR EXISTS(SELECT 1 FROM "AuditLog" a WHERE a.action='inspection.photo.upload' AND a."actorId"=${employeeId} AND a.metadata->>'photoId'=p.id))` : Prisma.empty}`,
    );
    return { id: { in: ids.map((r: any) => r.id) } };
  }
  const condition = scopedEventSql(q);
  if (kind === "events" && employeeId && !organizationId)
    return { actorId: employeeId };
  if (kind === "events") {
    const ids = await db.$queryRaw(
      Prisma.sql`SELECT e.id FROM "TechnicalEvent" e WHERE ${condition}`,
    );
    return { id: { in: ids.map((r: any) => r.id) } };
  }
  if (kind === "problems") {
    const ids = await db.$queryRaw(
      Prisma.sql`SELECT DISTINCT e."problemId" AS id FROM "TechnicalEvent" e WHERE e."problemId" IS NOT NULL AND ${condition}`,
    );
    return { id: { in: ids.map((r: any) => r.id) } };
  }
  const ids = await db.$queryRaw(
    Prisma.sql`SELECT a.id FROM "TechnicalAlert" a WHERE EXISTS(SELECT 1 FROM "TechnicalEvent" e WHERE ${condition} AND (a."problemId"=e."problemId" OR a."dedupKey"='photo-rejected:'||e.id OR (e.action='inspection.photo.rejected' AND e."requestId" IS NOT NULL AND position('Обращение: '||e."requestId" in a.explanation)>0))) OR EXISTS(SELECT 1 FROM "Inspection" i WHERE TRUE ${organizationId ? Prisma.sql`AND i."organizationId"=${organizationId}` : Prisma.empty} ${employeeId ? Prisma.sql`AND (${employeeId} IN (i."createdById",i."submittedById",i."qualityReviewerId",i."qualityConfirmedById",i."approvedById"))` : Prisma.empty} AND (a."dedupKey"='photo-review:'||i.id OR a."dedupKey" LIKE 'city:'||i.id||':%' OR a."dedupKey"='accreditation:'||i.id OR EXISTS(SELECT 1 FROM "InspectionDeviation" d WHERE d."inspectionId"=i.id AND a."dedupKey"='deviation:'||d.id) OR EXISTS(SELECT 1 FROM "InspectionPhoto" p WHERE p."inspectionId"=i.id AND a."dedupKey" IN ('photo_reshoot:'||p.id,'photo_review:'||p.id))))`,
  );
  return { id: { in: ids.map((r: any) => r.id) } };
}
