import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Role, roles } from '../common/roles';
import { listResponse, paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequestUser } from '../common/current-user';
import { hasGlobalAccess, userOrganizationIds } from '../common/access-scope';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'nca', 'super_admin')
  async list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('phone') phone?: string,
    @Query('fullName') fullName?: string,
    @Query('role') role?: Role,
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('lastLoginFrom') lastLoginFrom?: string,
    @Query('lastLoginTo') lastLoginTo?: string,
  ) {
    const query = q?.trim();
    const phoneFilter = phone?.trim();
    const fullNameFilter = fullName?.trim();
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const requestedOrganizationId = organizationId?.trim();
    const roleFilter = role && role !== ('all' as Role) ? role : undefined;
    if (roleFilter) this.assertSystemRole(roleFilter);
    const lastLoginAt = this.dateRange(lastLoginFrom, lastLoginTo);
    const filteredOrganizationIds = requestedOrganizationId && requestedOrganizationId !== 'all'
      ? organizationIds?.includes(requestedOrganizationId) || hasGlobalAccess(user)
        ? [requestedOrganizationId]
        : []
      : organizationIds;
    const where = {
      ...(filteredOrganizationIds ? { memberships: { some: { organizationId: { in: filteredOrganizationIds } } } } : {}),
      ...(roleFilter ? { roles: { some: { role: roleFilter } } } : {}),
      ...(phoneFilter ? { phone: { contains: phoneFilter, mode: 'insensitive' as const } } : {}),
      ...(fullNameFilter ? { fullName: { contains: fullNameFilter, mode: 'insensitive' as const } } : {}),
      ...(status === 'blocked' ? { isBlocked: true } : {}),
      ...(status === 'active' ? { isBlocked: false } : {}),
      ...(lastLoginAt ? { lastLoginAt } : {}),
      ...(query ? {
        OR: [
          { phone: { contains: query, mode: 'insensitive' as const } },
          { fullName: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } },
          { iin: { contains: query } },
          { roles: { some: { role: { contains: query, mode: 'insensitive' as const } } } },
          { memberships: { some: { organization: { name: { contains: query, mode: 'insensitive' as const } } } } },
          { memberships: { some: { organization: { bin: { contains: query } } } } },
        ],
      } : {}),
    };
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          roles: true,
          memberships: { include: { organization: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  private dateRange(dateFrom?: string, dateTo?: string) {
    const range: { gte?: Date; lte?: Date } = {};
    const from = this.parseFilterDate(dateFrom, false);
    const to = this.parseFilterDate(dateTo, true);
    if (from) range.gte = from;
    if (to) range.lte = to;
    return range.gte || range.lte ? range : undefined;
  }

  private parseFilterDate(value?: string, endOfDay = false) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
  }

  @Get(':id')
  @Roles('operator', 'nca', 'super_admin')
  detail(@Param('id') id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        roles: true,
        memberships: { include: { organization: true } },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            deviceName: true,
            ipAddress: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
        createdInspections: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { organization: true, vehicle: true, certificate: true },
        },
      },
    });
  }

  @Get(':id/activity')
  @Roles('operator', 'nca', 'super_admin')
  async activity(@Param('id') id: string) {
    const [audit, created, submitted, approved] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { actorId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.inspection.findMany({
        where: { createdById: id },
        include: { organization: true, vehicle: true, certificate: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.inspection.findMany({
        where: { submittedById: id },
        include: { organization: true, vehicle: true, certificate: true },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      }),
      this.prisma.inspection.findMany({
        where: { approvedById: id },
        include: { organization: true, vehicle: true, certificate: true },
        orderBy: { approvedAt: 'desc' },
        take: 50,
      }),
    ]);
    return { audit, created, submitted, approved };
  }

  @Post()
  @Roles('operator', 'nca', 'super_admin')
  async create(@CurrentUser() actor: RequestUser, @Body() body: { phone: string; fullName: string; iin?: string; role?: Role }) {
    if (body.role) this.assertSystemRole(body.role);
    if (body.role && !this.canAssignRole(actor, body.role)) {
      throw new ForbiddenException('Недостаточно прав для назначения роли');
    }
    const user = await this.prisma.user.upsert({
      where: { phone: body.phone },
      update: {
        fullName: body.fullName,
        iin: body.iin,
      },
      create: {
        phone: body.phone,
        fullName: body.fullName,
        iin: body.iin,
      },
      include: { roles: true },
    });
    if (body.role) {
      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: body.role } },
        update: {},
        create: { userId: user.id, role: body.role },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: user.createdAt.getTime() === user.updatedAt.getTime() ? 'user.create' : 'user.update',
        entity: 'user',
        entityId: user.id,
        metadata: { phone: user.phone, role: body.role ?? null },
      },
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: true } });
  }

  @Patch(':id/block')
  @Roles('operator', 'nca', 'super_admin')
  async setBlocked(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body('isBlocked') isBlocked: boolean,
    @Body('reason') reason?: string,
  ) {
    const trimmedReason = reason?.trim();
    if (isBlocked && !trimmedReason) {
      throw new BadRequestException('Укажите причину блокировки');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { isBlocked },
      include: { roles: true },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: isBlocked ? 'user.block' : 'user.unblock',
        entity: 'user',
        entityId: id,
        metadata: trimmedReason ? { reason: trimmedReason } : undefined,
      },
    });
    return user;
  }

  @Post(':id/roles')
  @Roles('super_admin')
  async addRole(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body('role') role: Role) {
    this.assertSystemRole(role);
    const result = await this.prisma.userRole.upsert({
      where: { userId_role: { userId: id, role } },
      update: {},
      create: { userId: id, role },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'user.role.add',
        entity: 'user',
        entityId: id,
        metadata: { role },
      },
    });
    return result;
  }

  @Delete(':id/roles/:role')
  @Roles('super_admin')
  async removeRole(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Param('role') role: Role) {
    this.assertSystemRole(role);
    const result = await this.prisma.userRole.delete({
      where: { userId_role: { userId: id, role } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'user.role.remove',
        entity: 'user',
        entityId: id,
        metadata: { role },
      },
    });
    return result;
  }

  private canAssignRole(actor: RequestUser, role: Role) {
    if (actor.roles.includes('super_admin')) return true;
    return role === 'vehicle_owner';
  }

  private assertSystemRole(role: string) {
    if (!roles.includes(role as Role)) {
      throw new BadRequestException('Некорректная системная роль');
    }
  }
}
