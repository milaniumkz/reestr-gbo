import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { cityComparison, ownerCityFromAddresses } from "./city-risk";
@Injectable()
export class CityRiskService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private since = new Date(Date.now() - 86400000);
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
  async inspect(row: any) {
    const facts = cityComparison({
      inspectionAddress: row.address,
      lat: row.lat,
      lng: row.lng,
      inspectorResidence: row.createdBy?.residenceCity ?? null,
      ownerAddress: ownerCityFromAddresses(row.vehicle?.owners ?? []).address,
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
