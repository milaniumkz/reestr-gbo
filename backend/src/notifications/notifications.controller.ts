import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { hasGlobalAccess, userOrganizationIds } from '../common/access-scope';
import { listResponse, paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { roles } from '../common/roles';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'nca', 'government', 'super_admin')
  async list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    const query = q?.trim().toLowerCase();
    const meta = paginationMeta(page, limit ?? '100');
    const poolLimit = Math.min(500, meta.skip + meta.limit + 100);
    const notificationItems = await this.prisma.notification.findMany({
      where: {
        OR: [
          { userId: user.sub },
          { role: { in: user.roles } },
          { role: null, userId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: poolLimit,
    });
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const certificates = await this.prisma.certificate.findMany({
      where: {
        status: 'active',
        ...(organizationIds ? { inspection: { organizationId: { in: organizationIds } } } : {}),
      },
      include: {
        vehicle: true,
        inspection: { include: { organization: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: poolLimit,
    });
    const certificateItems = certificates.map((certificate) => ({
      id: `certificate:${certificate.id}`,
      title: 'Свидетельство опубликовано',
      body: [
        certificate.number,
        certificate.vehicle.plateNumber,
        certificate.inspection.organization.name,
      ].filter(Boolean).join(' · '),
      role: null,
      userId: null,
      readAt: null,
      createdAt: certificate.issuedAt,
      entity: 'certificate',
      entityId: certificate.number,
    }));
    const inspections = await this.prisma.inspection.findMany({
      where: organizationIds ? { organizationId: { in: organizationIds } } : undefined,
      include: {
        organization: true,
        vehicle: true,
        certificate: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: poolLimit,
    });
    const inspectionItems = inspections.map((inspection) => ({
      id: `inspection:${inspection.id}`,
      title: inspection.certificate ? 'Инспекция завершена' : 'Инспекция в работе',
      body: [
        inspection.vehicle.plateNumber,
        inspection.organization.name,
        inspection.certificate?.number ?? inspection.status,
      ].filter(Boolean).join(' · '),
      role: null,
      userId: null,
      readAt: null,
      createdAt: inspection.updatedAt,
      entity: 'inspection',
      entityId: inspection.certificate?.number ?? inspection.id,
    }));
    const storedItems = notificationItems.map((item) => ({
      ...item,
      entity: 'notification',
      entityId: item.id,
    }));
    const allItems = [...storedItems, ...certificateItems, ...inspectionItems]
      .filter((item) => {
        if (!query) return true;
        return [item.title, item.body, item.role, item.entity, item.entityId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return listResponse(allItems.slice(meta.skip, meta.skip + meta.limit), allItems.length, page, limit ?? '100');
  }

  @Post()
  @Roles('operator', 'nca', 'super_admin')
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: { title: string; body: string; role?: string; userId?: string },
  ) {
    const role = body.role?.trim() || undefined;
    if (role && !roles.includes(role as never)) {
      throw new BadRequestException('Некорректная роль уведомления');
    }
    const notification = await this.prisma.notification.create({
      data: {
        title: body.title,
        body: body.body,
        role,
        userId: body.userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'notification.create',
        entity: 'notification',
        entityId: notification.id,
        metadata: { title: notification.title, role: notification.role, userId: notification.userId },
      },
    });
    return notification;
  }

  @Patch(':id/read')
  @Roles('inspection_org', 'operator', 'nca', 'government', 'super_admin')
  async markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const visibleNotification = await this.prisma.notification.findFirst({
      where: {
        id,
        userId: user.sub,
      },
    });
    if (!visibleNotification) {
      throw new NotFoundException('Уведомление не найдено');
    }
    const notification = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'notification.read',
        entity: 'notification',
        entityId: notification.id,
        metadata: { title: notification.title },
      },
    });
    return notification;
  }

  @Delete(':id')
  @Roles('operator', 'nca', 'super_admin')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const notification = await this.prisma.notification.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'notification.delete',
        entity: 'notification',
        entityId: notification.id,
        metadata: { title: notification.title, role: notification.role, userId: notification.userId },
      },
    });
    return notification;
  }
}
