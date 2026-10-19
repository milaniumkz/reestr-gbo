import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { digest, safeText } from "../observability/safe-data";
import { enforceRateLimit } from "./rate-limit";
import { strongPassword } from "./technical-security";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
  ) {}
  async request(phone: string, ip: string) {
    const normalized = String(phone ?? "")
      .replace(/\D/g, "")
      .slice(0, 15);
    await enforceRateLimit(this.prisma, `recovery-ip:${ip}`, 20, 3600);
    await enforceRateLimit(
      this.prisma,
      `recovery-phone:${normalized}`,
      5,
      3600,
    );
    await this.ledger.write({
      category: "security",
      action: "password.recovery.request",
      result: "pending",
      explanation:
        "Запрошено восстановление доступа. Автоматический канал доставки не подключён",
      ipAddress: ip,
      details: { requiresIdentityVerification: true },
    });
    return {
      ok: true,
      message:
        "Если учётная запись существует, восстановление возможно после подтверждения личности владельцем технической панели. Автоматическая отправка ссылки не подключена.",
    };
  }
  async issue(userId: string, issuedBy: string, reason: string) {
    if (!reason?.trim() || reason.length > 1000)
      throw new BadRequestException(
        "Укажите основание и подтверждение личности без документов и лишних персональных данных",
      );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBlocked: true },
    });
    if (!user || user.isBlocked)
      throw new BadRequestException("Активная учётная запись не найдена");
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(Date.now() + 10 * 60000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},1))`;
      await tx.passwordRecovery.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordRecovery.create({
        data: {
          userId,
          issuedBy,
          reason: safeText(reason, 1000),
          tokenHash: digest(token),
          expiresAt,
        },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "password.recovery.issue",
          result: "success",
          techActorId: issuedBy,
          objectType: "user",
          objectId: userId,
          explanation:
            "Выдан одноразовый механизм восстановления после подтверждения личности",
          details: { reason },
        },
        tx,
      );
    });
    return {
      token,
      expiresAt,
      message:
        "Передайте ссылку только подтверждённому владельцу по уже согласованному каналу. Панель не подтверждает доставку.",
    };
  }
  async consume(
    token: string,
    password: string,
    confirmation: string,
    ip: string,
  ) {
    await enforceRateLimit(this.prisma, `recovery-use:${ip}`, 10, 900);
    strongPassword(password, 8);
    if (password !== confirmation)
      throw new BadRequestException("Пароли не совпадают");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException("Ссылка недействительна или срок истёк");
    const hash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async (tx) => {
      const grant = await tx.passwordRecovery.findUnique({
        where: { tokenHash: digest(token) },
      });
      if (!grant || grant.usedAt || grant.expiresAt <= new Date())
        throw new UnauthorizedException(
          "Ссылка недействительна или уже использована",
        );
      const used = await tx.passwordRecovery.updateMany({
        where: { id: grant.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1)
        throw new UnauthorizedException("Ссылка уже использована");
      const updated = await tx.user.updateMany({
        where: { id: grant.userId, isBlocked: false },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
          passwordVersion: { increment: 1 },
          passwordChangedAt: new Date(),
          failedPasswordAttempts: 0,
          passwordLockedUntil: null,
        },
      });
      if (!updated.count)
        throw new UnauthorizedException("Восстановление недоступно");
      await tx.session.updateMany({
        where: { userId: grant.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "password.recovery.use",
          result: "success",
          actorId: grant.userId,
          explanation: "Личный пароль восстановлен, прежние сеансы отозваны",
          ipAddress: ip,
        },
        tx,
      );
    });
    return { ok: true, message: "Пароль изменён. Войдите заново." };
  }
}
