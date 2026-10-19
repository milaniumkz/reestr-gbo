import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { digest, safeText } from "../observability/safe-data";
import {
  permissions,
  strongPassword,
  TECH_PERMISSIONS,
} from "./technical-security";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const TECH_COOKIE = "ersi_technical_session";
export type TechnicalPrincipal = {
  account: {
    id: string;
    login: string;
    fullName: string;
    role: string;
    permissions: string[];
  };
  session: { id: string; reauthenticatedUntil: Date | null };
  permissions: string[];
};
@Injectable()
export class TechnicalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
  ) {}
  enabled() {
    return process.env.TECH_PANEL_ENABLED === "true";
  }
  assertEnabled() {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        "Техническая панель ещё не подключена",
      );
  }
  async limit(key: string, max: number, windowSeconds: number) {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const result = await this.prisma.technicalRateLimit.upsert({
      where: { key: digest(`${key}:${bucket}`) },
      create: {
        key: digest(`${key}:${bucket}`),
        expiresAt: new Date((bucket + 1) * windowSeconds * 1000),
      },
      update: { count: { increment: 1 } },
    });
    if (result.count > max)
      throw new (await import("@nestjs/common")).HttpException(
        "Слишком много попыток. Повторите позже",
        429,
      );
  }
  private view(account: any) {
    return {
      id: account.id,
      login: account.login,
      fullName: account.fullName,
      role: account.role,
      permissions: permissions(account.role, account.permissions),
    };
  }
  async login(
    login: string,
    password: string,
    code: string | undefined,
    ip: string,
  ) {
    this.assertEnabled();
    await this.limit(`tech-login-ip:${ip}`, 20, 900);
    const normalized = String(login ?? "")
      .trim()
      .toLowerCase();
    await this.limit(`tech-login:${normalized}`, 10, 900);
    const account = await this.prisma.techAccount.findUnique({
      where: { login: normalized },
    });
    const valid =
      account &&
      typeof password === "string" &&
      Buffer.byteLength(password) <= 72 &&
      (await bcrypt.compare(password, account.passwordHash));
    if (
      !account ||
      !valid ||
      !account.active ||
      account.login !== "owner" ||
      (account.lockedUntil && account.lockedUntil > new Date())
    ) {
      if (account) {
        const failed = await this.prisma.techAccount.update({
          where: { id: account.id },
          data: { failedAttempts: { increment: 1 } },
        });
        if (failed.failedAttempts >= 5)
          await this.prisma.techAccount.update({
            where: { id: account.id },
            data: { lockedUntil: new Date(Date.now() + 900000) },
          });
      }
      await this.ledger.write({
        category: "security",
        action: "technical.login",
        result: "denied",
        explanation: "Технический вход не подтверждён",
        techActorId: account?.id,
        ipAddress: ip,
        details: { verified: false },
      });
      throw new UnauthorizedException(
        "Неверные данные входа или вход временно ограничен",
      );
    }
    await this.prisma.techAccount.update({
      where: { id: account.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      await tx.techSession.create({
        data: {
          tokenHash: digest(token),
          accountId: account.id,
          version: account.version,
          mfaVerified: true,
          expiresAt: new Date(Date.now() + 8 * 3600000),
          idleExpiresAt: new Date(Date.now() + 1800000),
          reauthenticatedUntil: new Date(Date.now() + 300000),
        },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "technical.login",
          result: "success",
          explanation:
            "Вход владельца в техническую панель подтверждён паролем",
          techActorId: account.id,
          ipAddress: ip,
        },
        tx,
      );
    });
    return { token, mfaRequired: false, account: this.view(account) };
  }
  async principal(token: string | undefined): Promise<TechnicalPrincipal> {
    this.assertEnabled();
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException("Войдите в техническую панель");
    const session = await this.prisma.techSession.findUnique({
      where: { tokenHash: digest(token) },
      include: { account: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.idleExpiresAt <= new Date() ||
      !session.account.active ||
      session.account.login !== "owner" ||
      session.version !== session.account.version ||
      !session.mfaVerified
    )
      throw new UnauthorizedException(
        "Технический сеанс истёк. Войдите по логину и паролю",
      );
    if (
      session.mfaVerified &&
      session.idleExpiresAt.getTime() - Date.now() < 1500000
    )
      await this.prisma.techSession.update({
        where: { id: session.id },
        data: {
          idleExpiresAt: new Date(
            Math.min(session.expiresAt.getTime(), Date.now() + 1800000),
          ),
        },
      });
    return {
      account: this.view(session.account),
      session: {
        id: session.id,
        reauthenticatedUntil: session.reauthenticatedUntil,
      },
      permissions: session.mfaVerified
        ? permissions(session.account.role, session.account.permissions)
        : [],
    };
  }
  require(principal: TechnicalPrincipal, permission: string) {
    if (!principal.permissions.includes(permission))
      throw new ForbiddenException("Недостаточно технических прав");
  }
  fresh(principal: TechnicalPrincipal) {
    if (
      !principal.session.reauthenticatedUntil ||
      principal.session.reauthenticatedUntil <= new Date()
    )
      throw new ForbiddenException("Повторно подтвердите личность паролем");
  }
  async reauthenticate(
    principal: TechnicalPrincipal,
    password: string,
    code?: string,
  ) {
    await this.limit(`tech-reauth:${principal.account.id}`, 8, 900);
    const account = await this.prisma.techAccount.findUniqueOrThrow({
      where: { id: principal.account.id },
    });
    if (
      !account.active ||
      account.login !== "owner" ||
      typeof password !== "string" ||
      Buffer.byteLength(password) > 72 ||
      !(await bcrypt.compare(password, account.passwordHash))
    )
      throw new UnauthorizedException("Повторное подтверждение не выполнено");
    await this.prisma.$transaction(async (tx) => {
      await tx.techSession.update({
        where: { id: principal.session.id },
        data: { reauthenticatedUntil: new Date(Date.now() + 300000) },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "technical.reauthenticate",
          result: "success",
          techActorId: account.id,
          explanation: "Личность повторно подтверждена",
        },
        tx,
      );
    });
    return { ok: true };
  }
  async logout(principal: TechnicalPrincipal) {
    await this.prisma.$transaction(async (tx) => {
      await tx.techSession.updateMany({
        where: { id: principal.session.id },
        data: { revokedAt: new Date() },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.logout",
          result: "success",
          techActorId: principal.account.id,
          explanation: "Технический сеанс завершён",
        },
        tx,
      );
    });
    return { ok: true };
  }
  async changePassword(
    principal: TechnicalPrincipal,
    password: string,
    confirmation: string,
  ) {
    this.fresh(principal);
    strongPassword(password);
    if (password !== confirmation)
      throw new BadRequestException("Пароли не совпадают");
    const passwordHash = await bcrypt.hash(password, 12),
      token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.techAccount.update({
        where: { id: principal.account.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.techSession.updateMany({
        where: {
          accountId: account.id,
          id: { not: principal.session.id },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.techSession.update({
        where: { id: principal.session.id },
        data: { version: account.version, tokenHash: digest(token) },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "technical.password.change",
          result: "success",
          techActorId: account.id,
          explanation: "Технический пароль изменён, остальные сеансы отозваны",
        },
        tx,
      );
    });
    return { ok: true, token };
  }
  async createAccount(
    principal: TechnicalPrincipal,
    input: {
      login: string;
      fullName: string;
      role: string;
      password: string;
      reason: string;
      permissions?: string[];
    },
  ) {
    throw new ForbiddenException(
      "Техническая панель доступна только владельцу. Создание других технических аккаунтов отключено",
    );
  }

  async changeAccess(
    principal: TechnicalPrincipal,
    id: string,
    input: {
      active?: boolean;
      role?: string;
      permissions?: string[];
      reason: string;
    },
  ) {
    this.require(principal, "accounts.manage");
    this.fresh(principal);
    if (id === principal.account.id)
      throw new BadRequestException(
        "Нельзя отозвать собственный доступ этой операцией",
      );
    if (!input.reason?.trim()) throw new BadRequestException("Укажите причину");
    if (input.role && !Object.hasOwn(TECH_PERMISSIONS, input.role))
      throw new BadRequestException("Неизвестная роль");
    if (
      input.permissions?.some(
        (p) => !TECH_PERMISSIONS.owner.includes(p as never),
      )
    )
      throw new BadRequestException("Неизвестное разрешение");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.techAccount.findUniqueOrThrow({ where: { id } });
      const updated = await tx.techAccount.update({
        where: { id },
        data: {
          active: input.active,
          role: input.role,
          permissions: input.permissions,
          version: { increment: 1 },
        },
      });
      await tx.techSession.updateMany({
        where: { accountId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.ledger.write(
        {
          category: "security",
          action: "technical.account.access",
          result: "success",
          techActorId: principal.account.id,
          objectType: "technical_account",
          objectId: id,
          explanation: "Технический доступ изменён, сеансы отозваны",
          details: {
            before: { role: before.role, active: before.active },
            after: { role: updated.role, active: updated.active },
            reason: input.reason,
          },
        },
        tx,
      );
      return this.view(updated);
    });
  }
}
