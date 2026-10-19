import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { cityComparison, ownerCityFromAddresses } from "./city-risk";
@Injectable()
export class CityRiskService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private since = new Date(0);
  private cursor?: { at: Date; id: string };
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.scan(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async scan() {
    if (this.running) return;
    this.running = true;
    try {
      const start = new Date();
      const rows = await this.prisma.inspection.findMany({
        where: this.cursor
          ? {
              OR: [
                { updatedAt: { gt: this.cursor.at } },
                { updatedAt: this.cursor.at, id: { gt: this.cursor.id } },
              ],
            }
          : { updatedAt: { gte: this.since } },
        include: {
          organization: {
            select: {
              accreditationValidFrom: true,
              accreditationValidUntil: true,
            },
          },
          photos: {
            select: {
              id: true,
              type: true,
              moderationStatus: true,
              moderationReason: true,
              checksum: true,
            },
          },
          createdBy: { select: { id: true, residenceCity: true } },
          vehicle: { select: { owners: { select: { address: true } } } },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 200,
      });
      for (const row of rows) await this.inspect(row);
      if (rows.length === 200) {
        const last = rows[rows.length - 1];
        this.cursor = { at: last.updatedAt, id: last.id };
      } else {
        this.cursor = undefined;
        this.since = new Date(start.getTime() - 5000);
      }
    } catch {
      this.ledger.enqueue({
        category: "error",
        action: "monitoring.city_rule",
        result: "error",
        explanation: "Контроль географии инспекций временно не выполняется",
      });
    } finally {
      this.running = false;
    }
  }
  private async saveDeviation(input: any) {
    const row = await this.prisma.inspectionDeviation.upsert(input);
    await this.prisma.technicalAlert.upsert({
      where: { dedupKey: "deviation:" + row.id },
      create: {
        dedupKey: "deviation:" + row.id,
        title: "Отклонение инспекции требует проверки",
        explanation: row.explanation,
        severity: row.severity,
        category: "inspection_deviation",
      },
      update: {},
    });
    return row;
  }
  async inspect(row: any) {
    for (const photo of row.photos ?? []) {
      let reason = [
        "manual_review",
        "require_reshoot",
        "not_checked",
        "not_configured",
        "disabled",
      ].includes(photo.moderationStatus)
        ? (photo.moderationReason ??
          "Файл не прошёл автоматическую проверку; нужна ручная проверка")
        : null;
      let kind = "photo_quality";
      if (
        photo.checksum &&
        (await this.prisma.inspectionPhoto.count({
          where: { checksum: photo.checksum, inspectionId: { not: row.id } },
        })) > 0
      ) {
        reason =
          "Идентичный файл найден в другой инспекции. Проверьте допустимость повторного использования; это не доказательство нарушения.";
        kind = "photo_duplicate";
      }
      if (reason)
        await this.saveDeviation({
          where: { dedupKey: kind + ":" + photo.id },
          create: {
            dedupKey: kind + ":" + photo.id,
            inspectionId: row.id,
            kind,
            explanation: reason,
            facts: {
              photoId: photo.id,
              type: photo.type,
              moderationStatus: photo.moderationStatus,
            },
          },
          update: { lastSeenAt: new Date(), explanation: reason },
        });
    }
    const organization = row.organization;
    if (
      organization &&
      (!organization.accreditationValidFrom ||
        !organization.accreditationValidUntil ||
        row.createdAt < organization.accreditationValidFrom ||
        row.createdAt >
          new Date(
            organization.accreditationValidUntil.getTime() + 86400000 - 1,
          ))
    ) {
      const explanation =
        !organization.accreditationValidFrom ||
        !organization.accreditationValidUntil
          ? "В текущей карточке ИО не указан полный период аккредитации"
          : "Дата инспекции находится вне периода аккредитации из текущей карточки ИО";
      await this.saveDeviation({
        where: { dedupKey: "accreditation:" + row.id },
        create: {
          dedupKey: "accreditation:" + row.id,
          inspectionId: row.id,
          kind: "accreditation",
          explanation:
            explanation + ". Проверьте исходные документы и историю изменений.",
          facts: {
            inspectionAt: row.createdAt.toISOString(),
            validFrom:
              organization.accreditationValidFrom?.toISOString() ?? null,
            validUntil:
              organization.accreditationValidUntil?.toISOString() ?? null,
            source: "current_organization_card",
          },
        },
        update: {
          lastSeenAt: new Date(),
          explanation:
            explanation + ". Проверьте исходные документы и историю изменений.",
        },
      });
    }
    const facts = cityComparison({
      inspectionAddress: row.address,
      lat: row.lat,
      lng: row.lng,
      inspectorResidence: row.createdBy?.residenceCity ?? null,
      ownerAddress: ownerCityFromAddresses(row.vehicle?.owners ?? []).address,
    });
    const issues = [
      facts.inspectorMismatch && [
        "inspector_city",
        "Город проживания инспектора отличается от места инспекции",
      ],
      facts.ownerMismatch && [
        "owner_city",
        "Город проживания владельца отличается от места инспекции",
      ],
    ].filter(Boolean) as string[][];
    for (const [kind, explanation] of issues)
      await this.saveDeviation({
        where: { dedupKey: row.id + ":" + kind + ":" + JSON.stringify(facts) },
        create: {
          dedupKey: row.id + ":" + kind + ":" + JSON.stringify(facts),
          inspectionId: row.id,
          kind,
          explanation:
            explanation +
            ". Требуется проверка; это не доказательство нарушения.",
          facts: JSON.parse(JSON.stringify(facts)),
        },
        update: { lastSeenAt: new Date() },
      });
    if (!facts.inspectorMismatch && !facts.ownerMismatch) return facts;
    const dedupKey = `city:${row.id}:${facts.place.city}:${facts.inspectorCity ?? ""}:${facts.ownerCity ?? ""}`;
    const explanation = `Город инспекции: ${facts.place.city}${facts.place.approximate ? " (приблизительно по GPS)" : ""}. ${facts.inspectorMismatch ? "Город проживания инспектора отличается. " : ""}${facts.ownerMismatch ? "Город проживания владельца транспорта отличается. " : ""}Проверьте выезд, адрес и исходные данные. Это не доказательство нарушения.`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dedupKey},0))`;
      const existing = await tx.technicalAlert.findUnique({
        where: { dedupKey },
      });
      if (existing) return;
      await tx.technicalAlert.create({
        data: {
          dedupKey,
          title: "Разные города проживания и проведения инспекции",
          explanation,
          severity: "warning",
          category: "inspection_geography",
        },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "inspection.city_mismatch",
          result: "review_required",
          severity: "warning",
          actorId: row.createdById ?? undefined,
          objectType: "inspection",
          objectId: row.id,
          explanation,
          details: {
            reason:
              "Разные города. Источники и приблизительность доступны в карточке ИО",
            source: facts.place.source,
          },
        },
        tx,
      );
    });
    return facts;
  }
}
