import { Injectable, BadRequestException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import {
  TechnicalAuthService,
  TechnicalPrincipal,
} from "./technical-auth.service";
import { strongPassword } from "./technical-security";
@Injectable()
export class TechnicalSupport {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: TechnicalAuthService,
    private readonly ledger: EventLedger,
  ) {}
  async change(
    principal: TechnicalPrincipal,
    id: string,
    body: any,
    operation: "password" | "block",
  ) {
    this.auth.require(
      principal,
      operation === "password" ? "credentials.manage" : "accounts.manage",
    );
    this.auth.fresh(principal);
    if (
      typeof body.reason !== "string" ||
      body.reason.trim().length < 5 ||
      body.reason.length > 1000
    )
      throw new BadRequestException(
        "Укажите основание действия (от 5 до 1000 символов)",
      );
    let hash: string | undefined;
    if (operation === "password") {
      strongPassword(body.password, 8);
      if (body.password !== body.confirmation)
        throw new BadRequestException("Пароли не совпадают");
      hash = await bcrypt.hash(body.password, 12);
    }
    if (operation === "block" && typeof body.blocked !== "boolean")
      throw new BadRequestException("Укажите состояние доступа");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},1))`;
      await tx.user.update({
        where: { id },
        data:
          operation === "password"
            ? {
                passwordHash: hash,
                mustChangePassword: true,
                passwordVersion: { increment: 1 },
                failedPasswordAttempts: 0,
                passwordLockedUntil: null,
              }
            : {
                isBlocked: body.blocked,
                passwordVersion: { increment: 1 },
                ...(body.blocked
                  ? {}
                  : { failedPasswordAttempts: 0, passwordLockedUntil: null }),
              },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordRecovery.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.ledger.write(
        {
          category: "security",
          action:
            "technical.user." +
            (operation === "password"
              ? "password_reset"
              : body.blocked
                ? "blocked"
                : "unblocked"),
          result: "success",
          techActorId: principal.account.id,
          objectType: "user",
          objectId: id,
          explanation:
            operation === "password"
              ? "Установлен временный пароль; обязательная смена при входе, прежние сеансы отозваны"
              : body.blocked
                ? "Пользователь заблокирован; все сеансы отозваны"
                : "Пользователь разблокирован; требуется новый вход",
          details: { reason: body.reason },
        },
        tx,
      );
    });
    return { ok: true };
  }
}
