import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../common/current-user";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { listResponse, paginationMeta } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { hasGlobalAccess, userOrganizationIds } from "../common/access-scope";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles("operator", "nca", "government", "super_admin")
  async list(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("action") action?: string,
    @Query("actorId") actorId?: string,
    @Query("organizationId") organizationId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("q") q?: string,
  ) {
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const scopedOrganizationIds = organizationId
      ? organizationIds?.includes(organizationId) || hasGlobalAccess(user)
        ? [organizationId]
        : []
      : organizationIds;
    const actorIds = scopedOrganizationIds
      ? (
          await this.prisma.organizationMember.findMany({
            where: { organizationId: { in: scopedOrganizationIds } },
            select: { userId: true },
          })
        ).map((item) => item.userId)
      : undefined;
    const query = q?.trim();
    const and: Record<string, unknown>[] = [];
    if (actorId) and.push({ actorId });
    if (entity) and.push({ entity });
    if (entityId) and.push({ entityId });
    if (action) {
      and.push({ action: { contains: action, mode: "insensitive" as const } });
    }
    if (dateFrom || dateTo) {
      and.push({
        createdAt: {
          ...(this.filterDate(dateFrom) ? { gte: this.filterDate(dateFrom) } : {}),
          ...(this.filterDate(dateTo, true)
            ? { lte: this.filterDate(dateTo, true) }
            : {}),
        },
      });
    }
    if (scopedOrganizationIds) {
      and.push({
        OR: [
          ...(!entity && !entityId ? [{ actorId: { in: actorIds ?? [] } }] : []),
          { entity: "organization", entityId: { in: scopedOrganizationIds } },
          { entity: "inspection", entityId: { in: await this.organizationInspectionIds(scopedOrganizationIds) } },
          { entity: "certificate", entityId: { in: await this.organizationCertificateIdentifiers(scopedOrganizationIds) } },
        ],
      });
    }
    if (query) {
      and.push({
        OR: [
          { action: { contains: query, mode: "insensitive" as const } },
          { entity: { contains: query, mode: "insensitive" as const } },
          { entityId: { contains: query, mode: "insensitive" as const } },
          { ipAddress: { contains: query, mode: "insensitive" as const } },
          {
            actor: {
              phone: { contains: query, mode: "insensitive" as const },
            },
          },
          {
            actor: {
              fullName: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
          },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, phone: true, fullName: true, roles: true } } },
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  private async organizationInspectionIds(organizationIds: string[]) {
    const items = await this.prisma.inspection.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true },
      take: 1000,
    });
    return items.map((item) => item.id);
  }

  private filterDate(value?: string, endOfDay = false) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
  }

  private async organizationCertificateIdentifiers(organizationIds: string[]) {
    const items = await this.prisma.certificate.findMany({
      where: { inspection: { organizationId: { in: organizationIds } } },
      select: { id: true, number: true },
      take: 1000,
    });
    return items.flatMap((item) => [item.id, item.number]);
  }

  @Get("my-views")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  async myViews(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const where = {
      actorId: user.sub,
      action: { in: ["view.certificate", "view.organization"] },
    };
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  @Post("view")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  trackView(
    @CurrentUser() user: RequestUser,
    @Body() body: { entity: string; entityId: string; title?: string },
  ) {
    const entity =
      body.entity === "organization" ? "organization" : "certificate";
    return this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action:
          entity === "organization" ? "view.organization" : "view.certificate",
        entity,
        entityId: body.entityId,
        metadata: body.title ? { title: body.title } : undefined,
      },
    });
  }
}
