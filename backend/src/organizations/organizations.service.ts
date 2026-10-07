import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { hasGlobalAccess, userOrganizationIds } from "../common/access-scope";
import { RequestUser } from "../common/current-user";
import { listResponse, paginationMeta } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: RequestUser | undefined,
    type?: string,
    page?: string,
    limit?: string,
    q?: string,
    filters: { status?: string; region?: string } = {},
  ) {
    const query = q?.trim();
    const status = filters.status?.trim();
    const region = filters.region?.trim();
    const memberScopedRoles = ["inspection_org", "inspector", "admin"];
    const shouldScopeToMembership =
      user?.roles.some((role) => memberScopedRoles.includes(role)) &&
      !hasGlobalAccess(user);
    const organizationIds = shouldScopeToMembership
      ? await userOrganizationIds(this.prisma, user)
      : undefined;
    const where = {
      ...(organizationIds ? { id: { in: organizationIds } } : {}),
      ...(type ? { type } : {}),
      ...(status && status !== "all" ? { status } : {}),
      ...(region ? { region: { contains: region, mode: "insensitive" as const } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { bin: { contains: query } },
              { region: { contains: query, mode: "insensitive" as const } },
              { status: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        include: { balances: true, members: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async setStatus(user: RequestUser | undefined, id: string, status: string, reason?: string) {
    if (!["active", "blocked"].includes(status)) {
      throw new BadRequestException("Некорректный статус инспекционного органа");
    }
    const trimmedReason = reason?.trim();
    if (status === "blocked" && !trimmedReason) {
      throw new BadRequestException("Укажите причину блокировки");
    }
    const organization = await this.prisma.organization.update({
      where: { id },
      data: { status },
      include: { balances: true, members: { include: { user: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: status === "blocked" ? "organization.block" : "organization.status",
        entity: "organization",
        entityId: id,
        metadata: { status, ...(trimmedReason ? { reason: trimmedReason } : {}) },
      },
    });
    return organization;
  }

  async update(
    user: RequestUser | undefined,
    id: string,
    input: {
      name?: string;
      bin?: string;
      address?: string | null;
      region?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      accreditationValidFrom?: string;
      accreditationValidUntil?: string;
      lat?: number | string | null;
      lng?: number | string | null;
    },
  ) {
    const data: {
      name?: string;
      bin?: string;
      address?: string | null;
      region?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      accreditationValidFrom?: Date;
      accreditationValidUntil?: Date;
      lat?: number | null;
      lng?: number | null;
    } = {};
    if (input.name !== undefined) data.name = this.requiredText(input.name, "Название ИО");
    if (input.bin !== undefined) data.bin = this.requiredText(input.bin, "БИН");
    if (input.address !== undefined) data.address = this.optionalText(input.address);
    if (input.region !== undefined) data.region = this.optionalText(input.region);
    if (input.contactPhone !== undefined) data.contactPhone = this.optionalText(input.contactPhone);
    if (input.contactEmail !== undefined) data.contactEmail = this.optionalText(input.contactEmail);
    if (input.lat !== undefined) data.lat = this.coordinate(input.lat, -90, 90);
    if (input.lng !== undefined) data.lng = this.coordinate(input.lng, -180, 180);

    if (input.accreditationValidFrom !== undefined || input.accreditationValidUntil !== undefined) {
      const current = await this.prisma.organization.findUniqueOrThrow({ where: { id } });
      Object.assign(data, this.accreditationPeriod(
        input.accreditationValidFrom ?? current.accreditationValidFrom?.toISOString().slice(0, 10),
        input.accreditationValidUntil ?? current.accreditationValidUntil?.toISOString().slice(0, 10),
      ));
    }
    const organization = await this.prisma.organization.update({
      where: { id },
      data,
      include: { balances: true, members: { include: { user: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "organization.update",
        entity: "organization",
        entityId: id,
        metadata: { fields: Object.keys(data) },
      },
    });
    return organization;
  }

  async remove(user: RequestUser | undefined, id: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id },
      include: {
        balances: true,
        _count: { select: { inspections: true, cameras: true, importJobs: true } },
      },
    });
    const balanceAmount = organization.balances.reduce((sum, balance) => sum + Number(balance.amount), 0);
    if (organization._count.inspections || organization._count.cameras || organization._count.importJobs || balanceAmount !== 0) {
      throw new BadRequestException("Нельзя удалить организацию с инспекциями, камерами, импортами или ненулевым балансом. Заблокируйте ее вместо удаления.");
    }
    await this.prisma.$transaction([
      this.prisma.balance.deleteMany({ where: { organizationId: id } }),
      this.prisma.organizationMember.deleteMany({ where: { organizationId: id } }),
      this.prisma.organization.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: user?.sub,
          action: "organization.delete",
          entity: "organization",
          entityId: id,
          metadata: { type: organization.type, bin: organization.bin, name: organization.name },
        },
      }),
    ]);
    return { ok: true };
  }

  detail(id: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id },
      include: {
        balances: true,
        members: { include: { user: { include: { roles: true } } } },
        inspections: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            vehicle: { include: { owners: true } },
            certificate: true,
            createdBy: {
              select: { id: true, phone: true, fullName: true, lastLoginAt: true },
            },
            submittedBy: {
              select: { id: true, phone: true, fullName: true, lastLoginAt: true },
            },
            approvedBy: {
              select: { id: true, phone: true, fullName: true, lastLoginAt: true },
            },
            photos: true,
          },
        },
      },
    });
  }

  async activity(id: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    const memberIds = members.map((member) => member.userId);
    const [inspections, audit, createdCount, submittedCount, publishedCount] = await Promise.all([
      this.prisma.inspection.findMany({
        where: { organizationId: id },
        include: {
          certificate: true,
          vehicle: true,
          createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
          submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
          approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { actorId: { in: memberIds } },
            { entity: "organization", entityId: id },
          ],
        },
        include: { actor: { select: { id: true, phone: true, fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.inspection.count({ where: { organizationId: id } }),
      this.prisma.inspection.count({
        where: {
          organizationId: id,
          OR: [
            { submittedAt: { not: null } },
            { status: { in: ["submitted", "approved"] } },
          ],
        },
      }),
      this.prisma.certificate.count({
        where: { inspection: { organizationId: id } },
      }),
    ]);
    return { members, inspections, audit, stats: { createdCount, submittedCount, publishedCount } };
  }

  async create(user: RequestUser | undefined, input: {
    type: string;
    name: string;
    bin: string;
    address?: string;
    region?: string;
    contactPhone?: string;
    contactEmail?: string;
    accreditationValidFrom?: string;
    accreditationValidUntil?: string;
    lat?: number | string;
    lng?: number | string;
  }) {
    const organization = await this.prisma.organization.create({
      data: {
        type: input.type || "inspection_org",
        name: this.requiredText(input.name, "Название ИО"),
        bin: this.requiredText(input.bin, "БИН"),
        ...((input.type || "inspection_org") === "inspection_org" || input.accreditationValidFrom || input.accreditationValidUntil
          ? this.accreditationPeriod(input.accreditationValidFrom, input.accreditationValidUntil)
          : {}),
        address: this.optionalText(input.address),
        region: this.optionalText(input.region),
        contactPhone: this.optionalText(input.contactPhone),
        contactEmail: this.optionalText(input.contactEmail),
        lat: input.lat === undefined ? undefined : this.coordinate(input.lat, -90, 90),
        lng: input.lng === undefined ? undefined : this.coordinate(input.lng, -180, 180),
        balances: { create: { amount: 0, currency: "KZT" } },
      },
      include: { balances: true, members: { include: { user: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "organization.create",
        entity: "organization",
        entityId: organization.id,
        metadata: { type: organization.type, bin: organization.bin },
      },
    });
    return organization;
  }

  async addMember(user: RequestUser | undefined, organizationId: string, input: {
    userId?: string;
    role: string;
    fullName?: string;
    phone?: string;
    iin?: string;
  }) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { type: true },
    });
    const role = this.memberRole(input.role, organization.type);
    const systemRole = this.systemRoleForMember(role, organization.type);
    await this.assertManagerAccess(user, organizationId);
    const userId = input.userId || (await this.createMemberUser(input)).id;
    await this.prisma.userRole.upsert({
      where: { userId_role: { userId, role: systemRole } },
      update: {},
      create: { userId, role: systemRole },
    });
    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId_role: { organizationId, userId, role } },
      update: {},
      create: { organizationId, userId, role },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "organization.member.add",
        entity: "organization",
        entityId: organizationId,
        metadata: { userId, role },
      },
    });

    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { balances: true, members: { include: { user: true } } },
    });
  }

  private accreditationPeriod(from: unknown, until: unknown) {
    const parse = (value: unknown) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException("Укажите обе даты аттестата аккредитации в формате ГГГГ-ММ-ДД");
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException("Некорректная дата аттестата аккредитации");
      }
      return date;
    };
    const accreditationValidFrom = parse(from);
    const accreditationValidUntil = parse(until);
    if (accreditationValidUntil < accreditationValidFrom) {
      throw new BadRequestException("Дата окончания аккредитации не может быть раньше даты начала");
    }
    return { accreditationValidFrom, accreditationValidUntil };
  }

  private async createMemberUser(input: { fullName?: string; phone?: string; iin?: string }) {
    const phone = this.requiredOptionalText(input.phone, "Телефон сотрудника");
    const fullName = this.requiredOptionalText(input.fullName, "ФИО сотрудника");
    return this.prisma.user.upsert({
      where: { phone },
      update: {
        fullName,
        iin: this.optionalText(input.iin),
      },
      create: {
        phone,
        fullName,
        iin: this.optionalText(input.iin),
      },
    });
  }

  async removeMember(user: RequestUser | undefined, organizationId: string, memberId: string) {
    await this.assertManagerAccess(user, organizationId);
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { userId: true, role: true },
    });
    await this.prisma.organizationMember.deleteMany({
      where: { id: memberId, organizationId },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "organization.member.remove",
        entity: "organization",
        entityId: organizationId,
        metadata: { memberId, userId: member?.userId ?? null, role: member?.role ?? null },
      },
    });

    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { balances: true, members: { include: { user: true } } },
    });
  }

  private async assertManagerAccess(user: RequestUser | undefined, organizationId: string) {
    if (hasGlobalAccess(user)) return;
    if (!user?.sub) throw new ForbiddenException("Forbidden");
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.sub,
        role: "admin",
      },
    });
    if (!membership) {
      throw new ForbiddenException("Только руководитель ИО может управлять сотрудниками");
    }
  }

  private requiredText(value: string, label: string) {
    const text = value.trim();
    if (!text) throw new BadRequestException(`${label} обязательно`);
    return text;
  }

  private requiredOptionalText(value: string | undefined, label: string) {
    const text = value?.trim();
    if (!text) throw new BadRequestException(`${label} обязательно`);
    return text;
  }

  private optionalText(value?: string | null) {
    const text = value?.trim();
    return text || null;
  }

  private coordinate(value: number | string | null, min: number, max: number) {
    if (value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new BadRequestException("Некорректные координаты");
    }
    return number;
  }

  private memberRole(value: string, organizationType = "inspection_org") {
    if (organizationType === "inspection_org") {
      if (["admin", "inspector"].includes(value)) return value;
      throw new BadRequestException("Некорректная роль участника ИО");
    }
    if (["government", "nca"].includes(value)) return value;
    throw new BadRequestException("Некорректная роль контрольного органа");
  }

  private systemRoleForMember(role: string, organizationType = "inspection_org") {
    if (organizationType === "inspection_org") return "inspection_org";
    return role === "nca" ? "nca" : "government";
  }
}
