import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
} from "@nestjs/common";
import webpush from "web-push";
import { PrismaService } from "../prisma/prisma.service";
import {
  TechnicalAuthService,
  TechnicalPrincipal,
} from "./technical-auth.service";
import { EventLedger } from "../observability/event-ledger.service";
import { encryptSecret, decryptSecret } from "./technical-security";
export function validPushEndpoint(value: unknown) {
  try {
    const u = new URL(String(value));
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)) &&
      u.pathname.length > 1 &&
      u.href.length < 3000
    );
  } catch {
    return false;
  }
}
@Injectable()
export class TechnicalPush implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: TechnicalAuthService,
    private readonly ledger: EventLedger,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.dispatch(), 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async keys() {
    const key = "browser-push-vapid";
    let saved = await this.prisma.technicalSetting.findUnique({
      where: { key },
    });
    if (!saved) {
      const generated = webpush.generateVAPIDKeys();
      saved = await this.prisma.technicalSetting.upsert({
        where: { key },
        create: {
          key,
          value: {
            publicKey: generated.publicKey,
            privateKey: encryptSecret(generated.privateKey),
          },
          updatedBy: "system",
          reason: "Ключи Web Push",
        },
        update: {},
      });
    }
    const value = saved.value as any;
    return {
      publicKey: value.publicKey as string,
      privateKey: decryptSecret(value.privateKey),
    };
  }
  async status(p: TechnicalPrincipal) {
    this.auth.require(p, "alerts.read");
    const keys = await this.keys();
    const rows = await this.prisma.technicalPushSubscription.findMany({
      where: { accountId: p.account.id, active: true },
      select: {
        id: true,
        createdAt: true,
        lastSuccessAt: true,
        lastAttemptAt: true,
        lastError: true,
      },
    });
    return { publicKey: keys.publicKey, subscriptions: rows, enabled: true };
  }
  async subscribe(p: TechnicalPrincipal, body: any) {
    this.auth.require(p, "alerts.manage");
    const s = body.subscription;
    if (
      !validPushEndpoint(s?.endpoint) ||
      !/^[-_A-Za-z0-9]{87}$/.test(s?.keys?.p256dh ?? "") ||
      !/^[-_A-Za-z0-9]{22}$/.test(s?.keys?.auth ?? "")
    )
      throw new BadRequestException("Некорректная подписка браузера");
    if (
      (await this.prisma.technicalPushSubscription.count({
        where: { accountId: p.account.id, active: true },
      })) >= 10 &&
      !(await this.prisma.technicalPushSubscription.findUnique({
        where: { endpoint: s.endpoint },
      }))
    )
      throw new BadRequestException(
        "Не более 10 браузеров; отключите неиспользуемый",
      );
    const row = await this.prisma.technicalPushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: {
        accountId: p.account.id,
        endpoint: s.endpoint,
        p256dh: s.keys.p256dh,
        auth: encryptSecret(s.keys.auth),
      },
      update: {
        accountId: p.account.id,
        p256dh: s.keys.p256dh,
        auth: encryptSecret(s.keys.auth),
        active: true,
        lastError: null,
        createdAt: new Date(),
      },
    });
    await this.ledger.write({
      category: "audit",
      action: "technical.push.subscribe",
      result: "success",
      techActorId: p.account.id,
      explanation: "Владелец разрешил push-уведомления в браузере",
    });
    return { ok: true, id: row.id };
  }
  async unsubscribe(p: TechnicalPrincipal, body: any) {
    this.auth.require(p, "alerts.manage");
    await this.prisma.technicalPushSubscription.updateMany({
      where: { accountId: p.account.id, endpoint: String(body.endpoint) },
      data: { active: false },
    });
    return { ok: true };
  }
  private async send(row: any, payload: any) {
    const keys = await this.keys();
    return webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: decryptSecret(row.auth) },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject:
            process.env.TECH_PANEL_ORIGIN ?? "https://89-207-255-42.sslip.io",
          ...keys,
        },
        TTL: 3600,
        timeout: 10000,
      },
    );
  }
  async test(p: TechnicalPrincipal, body: any) {
    this.auth.require(p, "alerts.manage");
    const row = await this.prisma.technicalPushSubscription.findFirst({
      where: {
        accountId: p.account.id,
        endpoint: String(body.endpoint),
        active: true,
      },
    });
    if (!row)
      throw new BadRequestException("Подписка этого браузера не найдена");
    try {
      await this.send(row, {
        title: "ЕРСИ ГБО · проверка уведомлений",
        body: "Push подключён. Нажмите, чтобы открыть техническую панель.",
        url: "/tech/?section=alerts",
        tag: "technical-test",
      });
      await this.prisma.technicalPushSubscription.update({
        where: { id: row.id },
        data: { lastSuccessAt: new Date(), lastError: null },
      });
      return { ok: true };
    } catch {
      throw new BadRequestException(
        "Служба браузера не приняла push; проверьте разрешения и повторите подключение",
      );
    }
  }
  async dispatch() {
    if (this.running || process.env.TECH_PANEL_ENABLED !== "true") return;
    this.running = true;
    try {
      const subscriptions =
        await this.prisma.technicalPushSubscription.findMany({
          where: { active: true },
          take: 50,
        });
      for (const row of subscriptions) {
        const owner = await this.prisma.techAccount.findUnique({
          where: { id: row.accountId },
        });
        if (!owner?.active || owner.login !== "owner") {
          await this.prisma.technicalPushSubscription.update({
            where: { id: row.id },
            data: { active: false },
          });
          continue;
        }
        const alerts = await this.prisma.technicalAlert.findMany({
          where: {
            acknowledgedAt: null,
            firstSeenAt: { gte: row.createdAt },
            OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
          },
          orderBy: { firstSeenAt: "desc" },
          take: 100,
        });
        for (const alert of alerts) {
          const rule = await this.prisma.technicalRule.findUnique({
            where: { category: alert.category },
          });
          if (
            rule?.enabled === false ||
            (rule && !rule.recipients.includes(owner.role))
          )
            continue;
          const hour = new Date().getUTCHours();
          if (
            alert.severity !== "critical" &&
            rule?.quietStart != null &&
            rule.quietEnd != null &&
            (rule.quietStart <= rule.quietEnd
              ? hour >= rule.quietStart && hour < rule.quietEnd
              : hour >= rule.quietStart || hour < rule.quietEnd)
          )
            continue;
          const delivery = await this.prisma.technicalPushDelivery.upsert({
            where: {
              subscriptionId_alertId: {
                subscriptionId: row.id,
                alertId: alert.id,
              },
            },
            create: { subscriptionId: row.id, alertId: alert.id },
            update: {},
          });
          if (
            delivery.state === "sent" ||
            delivery.attempts >= 5 ||
            delivery.nextAttemptAt > new Date()
          )
            continue;
          const claim = await this.prisma.technicalPushDelivery.updateMany({
            where: {
              subscriptionId: row.id,
              alertId: alert.id,
              state: { not: "sent" },
              nextAttemptAt: { lte: new Date() },
            },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + 120000),
            },
          });
          if (!claim.count) continue;
          try {
            await this.send(row, {
              title: "ЕРСИ ГБО · требуется внимание",
              body:
                "В технической панели новое " +
                (alert.severity === "critical" ? "критическое " : "") +
                "уведомление. Откройте панель для подробностей.",
              url: alert.problemId
                ? "/tech/?section=problems&problem=" +
                  encodeURIComponent(alert.problemId)
                : alert.category.startsWith("inspection")
                  ? "/tech/?section=deviations"
                  : "/tech/?section=alerts",
              tag: alert.id,
            });
            await this.prisma.technicalPushDelivery.update({
              where: {
                subscriptionId_alertId: {
                  subscriptionId: row.id,
                  alertId: alert.id,
                },
              },
              data: { state: "sent", sentAt: new Date(), lastError: null },
            });
            await this.prisma.technicalPushSubscription.update({
              where: { id: row.id },
              data: {
                lastSuccessAt: new Date(),
                lastAttemptAt: new Date(),
                lastError: null,
              },
            });
          } catch (e: any) {
            const code = Number(e.statusCode) || 0;
            const message = code
              ? "Служба push: HTTP " + code
              : "Не удалось связаться со службой push";
            await this.prisma.technicalPushSubscription.update({
              where: { id: row.id },
              data: {
                lastAttemptAt: new Date(),
                lastError: message,
                ...([404, 410].includes(code) ? { active: false } : {}),
              },
            });
            await this.prisma.technicalPushDelivery.update({
              where: {
                subscriptionId_alertId: {
                  subscriptionId: row.id,
                  alertId: alert.id,
                },
              },
              data: {
                lastError: message,
                nextAttemptAt: new Date(
                  Date.now() +
                    Math.min(3600000, 60000 * 2 ** delivery.attempts),
                ),
              },
            });
            if ([404, 410].includes(code)) break;
          }
        }
      }
    } catch {
      this.ledger.enqueue({
        category: "error",
        action: "technical.push.delivery",
        result: "error",
        explanation: "Отправка браузерных уведомлений временно недоступна",
      });
    } finally {
      this.running = false;
    }
  }
}
