import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "./event-ledger.service";
import { safeText } from "./safe-data";
@Injectable()
export class BusinessAuditBridge implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.copy(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async copy() {
    if (this.running) return;
    this.running = true;
    try {
      const saved = await this.prisma.technicalSnapshot.findUnique({
        where: { key: "audit-cursor" },
      });
      const cursor = saved?.value as any;
      const from = cursor?.at ? new Date(cursor.at) : new Date(0);
      const rows = await this.prisma.auditLog.findMany({
        where: {
          OR: [
            { createdAt: { gt: from } },
            { createdAt: from, id: { gt: cursor?.id ?? "" } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 500,
      });
      if (!rows.length) return;
      const events = rows.map((row) => {
        const denied = /failed|denied|forbidden/.test(row.action),
          security = /^auth\.|role|block/.test(row.action);
        const explanation = row.action.startsWith("auth.")
          ? "Событие доступа в приложение"
          : row.action.includes("inspection")
            ? "Изменение инспекции"
            : row.action.includes("certificate")
              ? "Операция со свидетельством"
              : row.action.includes("role")
                ? "Изменение прав пользователя"
                : row.action.includes("organization")
                  ? "Операция с инспекционным органом"
                  : "Серверная операция реестра";
        return this.ledger.data({
          id: row.id,
          createdAt: row.createdAt,
          source: "business_audit",
          category: security ? "security" : "audit",
          action: row.action,
          result: denied ? "denied" : "success",
          severity: denied ? "warning" : "info",
          actorId: row.actorId ?? undefined,
          requestId: row.requestId ?? undefined,
          sessionId: row.sessionId ?? undefined,
          appVersion: row.appVersion ?? undefined,
          objectType: row.entity,
          objectId: row.entityId ? safeText(row.entityId, 80) : undefined,
          details: row.metadata,
          ipAddress: row.ipAddress ?? undefined,
          explanation,
        });
      });
      const last = rows[rows.length - 1];
      await this.prisma.$transaction(async (tx) => {
        await tx.technicalEvent.createMany({
          data: events,
          skipDuplicates: true,
        });
        await tx.technicalSnapshot.upsert({
          where: { key: "audit-cursor" },
          create: {
            key: "audit-cursor",
            source: "audit_bridge",
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 30000),
            value: { at: last.createdAt.toISOString(), id: last.id },
          },
          update: {
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 30000),
            value: { at: last.createdAt.toISOString(), id: last.id },
          },
        });
      });
    } catch {
      this.ledger.enqueue({
        category: "error",
        action: "monitoring.audit_bridge",
        result: "error",
        severity: "critical",
        explanation:
          "Перенос бизнес-аудита в технический журнал временно не выполняется",
      });
    } finally {
      this.running = false;
    }
  }
}
