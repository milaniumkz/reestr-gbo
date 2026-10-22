import {
  BadRequestException,
  Injectable,
  ForbiddenException,
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
  async request(phone: string, ip: string, bin: string, fullName: string) {
    const digits = String(phone ?? "").replace(/\D/g, "");
    const normalized =
      digits.length === 10
        ? "+7" + digits
        : "+" +
          (digits.length === 11 && digits[0] === "8"
            ? "7" + digits.slice(1)
            : digits);
    if (
      !/^\d{12}$/.test(bin ?? "") ||
      !fullName?.trim() ||
      fullName.length > 200
    )
      throw new BadRequestException("Укажите БИН организации и ФИО полностью");
    await enforceRateLimit(this.prisma, `recovery-ip:${ip}`, 20, 3600);
    await enforceRateLimit(
      this.prisma,
      `recovery-phone:${normalized}`,
      5,
      3600,
    );
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        user: { phone: normalized, isBlocked: false },
        organization: { bin, status: "active" },
      },
      include: { user: true },
    });
    const name = (v: string) =>
      v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
    let requestId: string | undefined;
    if (member && name(member.user.fullName) === name(fullName)) {
      requestId = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${member.userId},2))`;
        const where = {
          userId: member.userId,
          organizationId: member.organizationId,
          status: "pending",
          expiresAt: { gt: new Date() },
        };
        const pending = await tx.passwordRecoveryRequest.findFirst({ where });
        if (pending) return pending.id;
        const request = await tx.passwordRecoveryRequest.create({
          data: {
            userId: member.userId,
            organizationId: member.organizationId,
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        });
        const managers = await tx.organizationMember.findMany({
          where: {
            organizationId: member.organizationId,
            role: { in: ["admin", "manager"] },
            user: { isBlocked: false },
          },
          select: { userId: true },
        });
        for (const manager of new Set(managers.map((m) => m.userId)))
          await tx.notification.create({
            data: {
              userId: manager,
              organizationId: member.organizationId,
              entity: "password_recovery_request",
              entityId: request.id,
              title: "Заявка восстановления доступа",
              body: "Сотрудник запросил восстановление пароля. Откройте Профиль → Заявки восстановления доступа и подтвердите личность перед выдачей ссылки.",
            },
          });
        return request.id;
      });
    }
    await this.ledger.write({
      category: "security",
      action: "password.recovery.request",
      result: "pending",
      actorId: member && requestId ? member.userId : undefined,
      objectType: "password_recovery_request",
      objectId: requestId,
      details: { verified: false },
      explanation:
        "Запрос восстановления доступа: требуется подтверждение личности руководителем или техническим администратором",
      ipAddress: ip,
    });
    return {
      ok: true,
      message:
        "Если данные совпадают, заявка передана руководителю организации и техническому администратору. После проверки личности они передадут вам одноразовую ссылку.",
    };
  }

  private async managerOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        role: { in: ["admin", "manager"] },
        organization: { status: "active", type: "inspection_org" },
      },
    });
    return memberships.map((m) => m.organizationId);
  }
  async requests(actorId?: string) {
    const organizationIds = actorId
      ? await this.managerOrganizations(actorId)
      : undefined;
    const rows = await this.prisma.passwordRecoveryRequest.findMany({
      where: {
        status: "pending",
        expiresAt: { gt: new Date() },
        ...(organizationIds ? { organizationId: { in: organizationIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const [users, organizations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) } },
        select: { id: true, fullName: true, phone: true },
      }),
      this.prisma.organization.findMany({
        where: { id: { in: rows.map((r) => r.organizationId) } },
        select: { id: true, name: true, bin: true },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        user: users.find((u) => u.id === row.userId),
        organization: organizations.find((o) => o.id === row.organizationId),
      })),
    };
  }
  async approve(id: string, actorId: string, technical = false) {
    const request = await this.prisma.passwordRecoveryRequest.findUnique({
      where: { id },
    });
    if (
      !request ||
      request.status !== "pending" ||
      request.expiresAt <= new Date()
    )
      throw new BadRequestException(
        "Заявка недействительна или уже обработана",
      );
    if (
      !technical &&
      (request.userId === actorId ||
        !(await this.managerOrganizations(actorId)).includes(
          request.organizationId,
        ))
    )
      throw new ForbiddenException(
        "Подтверждать можно только заявки сотрудников своего ИО",
      );
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        userId: request.userId,
        organizationId: request.organizationId,
        organization: { status: "active" },
      },
    });
    if (!member)
      throw new BadRequestException(
        "Сотрудник больше не состоит в активной организации",
      );
    return this.issue(
      request.userId,
      actorId,
      "Личность сотрудника проверена; подтверждена заявка " + id,
      id,
      technical,
    );
  }
  async issue(
    userId: string,
    issuedBy: string,
    reason: string,
    requestId?: string,
    technical = true,
  ) {
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
      if (requestId) {
        const claimed = await tx.passwordRecoveryRequest.updateMany({
          where: {
            id: requestId,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
          data: { status: "approved", approvedBy: issuedBy },
        });
        if (claimed.count !== 1)
          throw new BadRequestException("Заявка уже обработана");
      }
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
          ...(technical ? { techActorId: issuedBy } : { actorId: issuedBy }),
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
      const initial = await tx.passwordRecovery.findUnique({
        where: { tokenHash: digest(token) },
      });
      if (!initial)
        throw new UnauthorizedException(
          "Ссылка недействительна или срок истёк",
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.userId},1))`;
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
      await tx.passwordRecoveryRequest.updateMany({
        where: { userId: grant.userId, status: "pending" },
        data: { status: "completed" },
      });
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
