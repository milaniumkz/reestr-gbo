import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { digest, safeDetails, safeText } from "./safe-data";
import { traceFields } from "./request-context";
import { randomUUID } from "node:crypto";

export type LedgerInput = {
  location?: any;
  id?: string;
  source?: string;
  category: string;
  action: string;
  result: string;
  explanation: string;
  severity?: string;
  requestId?: string;
  actorId?: string;
  actorRole?: string;
  techActorId?: string;
  sessionId?: string;
  objectType?: string;
  objectId?: string;
  details?: unknown;
  ipAddress?: string;
  device?: string;
  appVersion?: string;
  problemId?: string;
  createdAt?: Date;
};
@Injectable()
export class EventLedger implements OnModuleDestroy {
  private pending: LedgerInput[] = [];
  private running = false;
  private timer?: NodeJS.Timeout;
  private failures = 0;
  private dropped = 0;
  private lastSuccess?: Date;
  private lastFailure?: Date;
  constructor(private readonly prisma: PrismaService) {}
  status() {
    return {
      pending: this.pending.length,
      failures: this.failures,
      dropped: this.dropped,
      lastSuccess: this.lastSuccess ?? null,
      lastFailure: this.lastFailure ?? null,
    };
  }
  data(input: LedgerInput) {
    const now = input.createdAt ?? new Date();
    const days =
      input.category === "security"
        ? 90
        : input.category === "error"
          ? 30
          : 365;
    return {
      ...traceFields(),
      ...input,
      id: input.id ?? randomUUID(),
      source: input.source ?? "server",
      explanation: safeText(input.explanation, 500),
      details: safeDetails(input.details),
      device: input.device ? safeText(input.device, 180) : undefined,
      createdAt: now,
      expiresAt: new Date(now.getTime() + days * 86400000),
    };
  }
  async write(input: LedgerInput, tx: any = this.prisma) {
    return tx.technicalEvent.create({ data: this.data(input) });
  }
  enqueue(input: LedgerInput) {
    if (this.pending.length >= 500) {
      this.dropped++;
      this.lastFailure = new Date();
      return;
    }
    this.pending.push({
      ...input,
      ...traceFields(),
      id: input.id ?? randomUUID(),
    });
    void this.flush();
  }
  private async flush() {
    if (this.running || this.timer) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const batch = this.pending.splice(0, 50);
        try {
          await this.prisma.technicalEvent.createMany({
            data: batch.map((x) => this.data(x)),
            skipDuplicates: true,
          });
          this.lastSuccess = new Date();
        } catch {
          this.failures++;
          this.lastFailure = new Date();
          this.pending.unshift(...batch);
          if (this.pending.length > 500) {
            this.dropped += this.pending.length - 500;
            this.pending.length = 500;
          }
          this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.flush();
          }, 5000);
          this.timer.unref();
          break;
        }
      }
    } finally {
      this.running = false;
    }
  }
  async problem(input: {
    status: number;
    route: string;
    method: string;
    errorType: string;
    requestId: string;
    details?: unknown;
    actorId?: string;
    appVersion?: string;
  }) {
    const code = String(input.status),
      fingerprint = digest(
        `${input.method}:${input.route}:${code}:${input.errorType}`,
      );
    const security =
      input.status === 401 || input.status === 403 || input.status === 429;
    const title = security
      ? "Повторные отказы доступа"
      : "Ошибка обработки запроса";
    const problem = await this.prisma.technicalProblem.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        title,
        severity: input.status >= 500 ? "critical" : "warning",
        source: "server",
        code,
        route: input.route,
        lastRequestId: input.requestId,
        details: safeDetails(input.details),
      },
      update: {
        lastSeenAt: new Date(),
        occurrences: { increment: 1 },
        lastRequestId: input.requestId,
      },
    });
    if (problem.status === "resolved")
      await this.prisma.technicalProblem.update({
        where: { id: problem.id },
        data: { status: "reopened", verifiedAt: null },
      });
    const category = security ? "security" : "error";
    const rule = await this.prisma.technicalRule.findUnique({
      where: { category },
    });
    const threshold = rule?.threshold ?? (security ? 5 : 1);
    const windowMs = (rule?.windowMinutes ?? 15) * 60000;
    const recent = await this.prisma.technicalEvent.count({
      where: {
        problemId: problem.id,
        createdAt: { gte: new Date(Date.now() - windowMs) },
      },
    });
    if (rule?.enabled !== false && recent + 1 >= threshold) {
      const cooldown = (rule?.cooldownMinutes ?? 30) * 60000;
      const dedupKey = `${problem.id}:${Math.floor(Date.now() / cooldown)}`;
      const hour = new Date().getUTCHours(),
        start = rule?.quietStart,
        end = rule?.quietEnd;
      const quiet =
        start != null &&
        end != null &&
        (start <= end
          ? hour >= start && hour < end
          : hour >= start || hour < end);
      if (!(quiet && problem.severity !== "critical"))
        await this.prisma.technicalAlert.upsert({
          where: { dedupKey },
          create: {
            dedupKey,
            title,
            explanation: security
              ? "Зафиксирована серия отказов. Это сигнал для проверки, а не доказательство нарушения."
              : "Сервер не выполнил запрос. Проверьте связанные события.",
            severity: problem.severity,
            category,
            problemId: problem.id,
          },
          update: {
            lastSeenAt: new Date(),
            repetitions: { increment: 1 },
            ...(problem.status === "resolved"
              ? { acknowledgedAt: null, acknowledgedBy: null, mutedUntil: null }
              : {}),
          },
        });
    }
    return problem.id;
  }
  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }
}
