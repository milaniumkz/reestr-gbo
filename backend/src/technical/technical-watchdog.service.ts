import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { TechnicalMonitor } from "./technical-monitor.service";
@Injectable()
export class TechnicalWatchdog implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
    private readonly monitor: TechnicalMonitor,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.run(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (this.running || process.env.TECH_PANEL_ENABLED !== "true") return;
    this.running = true;
    try {
      const snapshot = await this.monitor.snapshot();
      const rule = await this.prisma.technicalRule.findUnique({
        where: { category: "monitoring" },
      });
      for (const [key, title] of [
        ["database", "База данных"],
        ["storage", "Хранилище"],
        ["redis", "Redis"],
        ["collector", "Сборщик метрик"],
      ] as const) {
        const state = snapshot[key].state,
          recordKey = "availability:" + key,
          previous = await this.prisma.technicalSnapshot.findUnique({
            where: { key: recordKey },
          }),
          old = previous?.value as any;
        const bad = ["unavailable", "stale"].includes(state),
          wasBad = ["unavailable", "stale"].includes(old?.state);
        const outageAt =
          bad && wasBad ? old.outageAt : new Date().toISOString();
        if (
          rule?.enabled !== false &&
          ((bad && !wasBad) || (state === "connected" && wasBad))
        ) {
          const recovery = !bad,
            explanation = recovery
              ? `${title}: источник снова отвечает на проверку`
              : `${title}: источник недоступен или данные устарели. Требуется проверка`;
          await this.prisma.$transaction(async (tx) => {
            await tx.technicalAlert.upsert({
              where: {
                dedupKey: `availability:${key}:${recovery ? old.outageAt : outageAt}:${recovery ? "recovered" : "failed"}`,
              },
              create: {
                dedupKey: `availability:${key}:${recovery ? old.outageAt : outageAt}:${recovery ? "recovered" : "failed"}`,
                category: "monitoring",
                title: recovery
                  ? "Источник восстановлен"
                  : "Проверка источника не прошла",
                explanation,
                severity: recovery ? "info" : "critical",
              },
              update: {},
            });
            await this.ledger.write(
              {
                category: recovery ? "audit" : "error",
                action:
                  "monitoring.availability." +
                  (recovery ? "recovered" : "failed"),
                result: recovery ? "success" : "error",
                severity: recovery ? "info" : "critical",
                explanation,
                details: { source: key },
              },
              tx,
            );
          });
        }
        await this.prisma.technicalSnapshot.upsert({
          where: { key: recordKey },
          create: {
            key: recordKey,
            source: "watchdog",
            value: { state, outageAt },
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 90000),
          },
          update: {
            value: { state, outageAt },
            observedAt: new Date(),
            expiresAt: new Date(Date.now() + 90000),
          },
        });
      }
      const neglected = await this.prisma.technicalAlert.findMany({
        where: {
          severity: "critical",
          acknowledgedAt: null,
          firstSeenAt: { lt: new Date(Date.now() - 15 * 60000) },
          NOT: { dedupKey: { startsWith: "escalation:" } },
          OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
        },
        take: 50,
      });
      for (const alert of neglected)
        await this.prisma.technicalAlert.upsert({
          where: { dedupKey: "escalation:" + alert.id },
          create: {
            dedupKey: "escalation:" + alert.id,
            title: "Критическое уведомление не принято в работу",
            explanation:
              "Требуется внимание владельца: критический сигнал остаётся без подтверждения более 15 минут. Откройте исходное уведомление.",
            category: alert.category,
            severity: "critical",
            problemId: alert.problemId,
          },
          update: {},
        });
    } catch {
      this.ledger.enqueue({
        category: "error",
        action: "monitoring.watchdog",
        result: "error",
        severity: "critical",
        explanation:
          "Автоматическая проверка источников временно не выполняется",
      });
    } finally {
      this.running = false;
    }
  }
}
