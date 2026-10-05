import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import {
  assertOrganizationAccess,
  hasGlobalAccess,
  userOrganizationIds,
} from "../common/access-scope";
import { RequestUser } from "../common/current-user";
import { listResponse, paginationMeta } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentProvider } from "./payment.provider";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
  ) {}

  async list(user: RequestUser | undefined, page?: string, limit?: string) {
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const where = organizationIds
      ? { organizationId: { in: organizationIds } }
      : undefined;
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async createInvoice(
    user: RequestUser | undefined,
    input: {
      amount?: number;
      purpose?: string;
      organizationId?: string;
      tariffCode?: string;
    },
  ) {
    const paymentsEnabled =
      this.config.get<string>("PAYMENTS_ENABLED") === "true";
    if (!paymentsEnabled) {
      throw new ForbiddenException("Payments are temporarily disabled");
    }
    let organizationId = input.organizationId;
    if (!hasGlobalAccess(user)) {
      const organizationIds = await userOrganizationIds(this.prisma, user);
      organizationId = organizationId ?? organizationIds[0];
      if (!organizationId)
        throw new ForbiddenException("User has no organization");
      await assertOrganizationAccess(this.prisma, organizationId, user);
    } else if (organizationId) {
      await assertOrganizationAccess(this.prisma, organizationId, user);
    }
    const tariff = input.tariffCode
      ? await this.prisma.tariff.findUnique({
          where: { code: input.tariffCode },
        })
      : null;
    if (input.tariffCode && (!tariff || !tariff.isActive)) {
      throw new NotFoundException("Active tariff not found");
    }
    const amount = tariff?.amount ?? input.amount;
    const purpose = tariff?.name ?? input.purpose;
    if (!amount || !purpose) {
      throw new NotFoundException("Payment amount or purpose not found");
    }

    const invoice = await this.provider.createInvoice({
      amount,
      currency: tariff?.currency ?? "KZT",
      purpose,
    });
    const payment = await this.prisma.payment.create({
      data: {
        amount,
        purpose,
        organizationId,
        provider: this.provider.isMockEnabled()
          ? "mock"
          : (this.config.get<string>("PAYMENT_PROVIDER") ?? "http"),
        externalId: invoice.externalId,
        currency: tariff?.currency ?? "KZT",
        metadata: tariff
          ? { tariffCode: tariff.code, tariffId: tariff.id }
          : undefined,
      },
    });
    return { payment, ...invoice };
  }

  async handleWebhook(provider: string, payload: unknown, signature?: string) {
    this.assertWebhookSignature(payload, signature);
    const event = await this.provider.handleWebhook(payload);
    if (!event.externalId) return { ok: false };

    const payment = await this.prisma.payment.findFirst({
      where: { provider, externalId: event.externalId },
    });
    if (!payment) return { ok: false };

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: event.status },
      });

      if (
        event.status === "confirmed" &&
        payment.status !== "confirmed" &&
        payment.organizationId
      ) {
        await tx.balance.upsert({
          where: { organizationId: payment.organizationId },
          update: { amount: { increment: payment.amount } },
          create: {
            organizationId: payment.organizationId,
            amount: payment.amount,
            currency: payment.currency,
          },
        });
      }
    });

    return { ok: true };
  }

  private assertWebhookSignature(payload: unknown, signature?: string) {
    const secret = this.config.get<string>("PAYMENT_WEBHOOK_SECRET");
    if (!secret || secret.startsWith("replace_")) return;
    if (!signature) throw new ForbiddenException("Missing webhook signature");

    const expected = createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException("Invalid webhook signature");
    }
  }
}
