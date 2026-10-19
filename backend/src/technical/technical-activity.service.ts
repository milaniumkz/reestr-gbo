import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TechnicalPrincipal } from "./technical-auth.service";
import { activityPresentation, roleName } from "./activity-presentation";
@Injectable()
export class TechnicalActivity {
  constructor(private readonly prisma: PrismaService) {}
  async profiles(
    actorIds: string[],
    techIds: string[],
    principal: TechnicalPrincipal,
    before?: Date,
  ) {
    const profiles = new Map<string, any>();
    if (!principal.permissions.includes("people.read")) return profiles;
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          fullName: true,
          phone: true,
          isBlocked: true,
          mustChangePassword: true,
          roles: { select: { role: true } },
          memberships: {
            select: {
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.techAccount.findMany({
        where: { id: { in: techIds } },
        select: { id: true, fullName: true, login: true, role: true },
      }),
    ]);
    for (const user of users)
      profiles.set("app:" + user.id, {
        kind: "application",
        id: user.id,
        name: user.fullName,
        isBlocked: user.isBlocked,
        mustChangePassword: user.mustChangePassword,
        phoneMasked: user.phone
          ? user.phone.slice(0, 2) + "••••••" + user.phone.slice(-4)
          : null,
        roles: user.roles.map((r) => roleName(r.role)),
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: roleName(m.role),
        })),
        profileNote: "ФИО, роли и ИО из текущей карточки пользователя",
      });
    for (const account of accounts)
      profiles.set("tech:" + account.id, {
        kind: "technical",
        id: account.id,
        name: account.fullName,
        login: account.login,
        roles: [roleName(account.role)],
        organizations: [],
        profileNote: "Текущая карточка технического аккаунта",
      });
    if (actorIds.length || techIds.length) {
      const logins = await this.prisma.technicalEvent.groupBy({
        by: ["actorId", "techActorId"],
        where: {
          action: { in: ["auth.login", "technical.login"] },
          result: "success",
          ...(before ? { createdAt: { lte: before } } : {}),
          OR: [{ actorId: { in: actorIds } }, { techActorId: { in: techIds } }],
        },
        _max: { createdAt: true },
      });
      for (const event of logins) {
        const profile = profiles.get(
          event.techActorId
            ? "tech:" + event.techActorId
            : "app:" + event.actorId,
        );
        if (profile) profile.lastSuccessfulLoginAt = event._max.createdAt;
      }
    }
    return profiles;
  }
  async enrich(items: any[], principal: TechnicalPrincipal) {
    const requestIds = [
      ...new Set(
        items.map((e) => e.requestId).filter((id): id is string => !!id),
      ),
    ];
    // Exact server-generated request UUID only. Never infer a person from an IP or a nearby timestamp.
    const counterparts = requestIds.length
      ? await this.prisma.technicalEvent.findMany({
          where: {
            requestId: { in: requestIds },
            OR: [{ actorId: { not: null } }, { techActorId: { not: null } }],
          },
          select: {
            requestId: true,
            actorId: true,
            techActorId: true,
            details: true,
            action: true,
            result: true,
          },
          take: 2000,
        })
      : [];
    const resolved = items.map((event) => {
      let reference = event,
        matched = false;
      if (!event.actorId && !event.techActorId && event.requestId) {
        const candidates = counterparts.filter(
            (e) => e.requestId === event.requestId,
          ),
          keys = [
            ...new Set(
              candidates.map((e) =>
                e.techActorId ? "tech:" + e.techActorId : "app:" + e.actorId,
              ),
            ),
          ];
        if (keys.length === 1) {
          reference = candidates[0];
          matched = true;
        }
      }
      return { event, reference, matched };
    });
    const profiles = await this.profiles(
      [
        ...new Set(resolved.map((x) => x.reference.actorId).filter(Boolean)),
      ] as string[],
      [
        ...new Set(
          resolved.map((x) => x.reference.techActorId).filter(Boolean),
        ),
      ] as string[],
      principal,
    );
    const objectIds = [
      ...new Set(
        items
          .map((e) => e.objectId)
          .filter(
            (id): id is string =>
              typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id),
          ),
      ),
    ];
    const contexts =
      principal.permissions.includes("people.read") && objectIds.length
        ? await this.prisma.inspection.findMany({
            where: {
              OR: [
                { id: { in: objectIds } },
                { photos: { some: { id: { in: objectIds } } } },
                { certificate: { id: { in: objectIds } } },
              ],
            },
            select: {
              id: true,
              certificateNumber: true,
              status: true,
              organization: { select: { name: true } },
              vehicle: { select: { plateNumber: true } },
              photos: {
                where: { id: { in: objectIds } },
                select: { id: true, type: true },
              },
              certificate: { select: { id: true } },
            },
            take: 200,
          })
        : [];
    const showIp = principal.permissions.includes("security.ip");
    return resolved.map(({ event, reference, matched }) => {
      const key = reference.techActorId
        ? "tech:" + reference.techActorId
        : reference.actorId
          ? "app:" + reference.actorId
          : null;
      const profile = key ? profiles.get(key) : null;
      const details = reference.details as any;
      const verified =
        typeof details?.verified === "boolean"
          ? details.verified
          : reference.action === "auth.password_failed"
            ? false
            : [
                  "auth.login",
                  "auth.refresh",
                  "auth.logout",
                  "auth.password_changed",
                  "technical.login",
                  "technical.reauthenticate",
                ].includes(reference.action)
              ? reference.result === "success"
              : null;
      return {
        ...event,
        objectContext:
          contexts.find(
            (row) =>
              row.id === event.objectId ||
              row.certificate?.id === event.objectId ||
              row.photos.some((photo) => photo.id === event.objectId),
          ) ?? null,
        location: principal.permissions.includes("people.read")
          ? event.location
          : undefined,
        actorName: profile?.name,
        actor: profile
          ? {
              ...profile,
              verified,
              identified: true,
              identityNote: matched
                ? "Аккаунт установлен по другой серверной записи того же запроса"
                : verified === false
                  ? "Учётная запись определена, действующий вход не подтверждён"
                  : "Учётная запись установлена сервером",
            }
          : {
              kind: "unknown",
              identified: !!key,
              name: key ? "Имя недоступно" : "Пользователь не установлен",
              verified: null,
              roles: [],
              organizations: [],
              identityNote: key
                ? "Сведения скрыты правами доступа или карточка недоступна"
                : "В запросе не было подтверждённой учётной записи; по IP личность не определяется",
            },
        display: activityPresentation(event),
        ipAddress: showIp ? event.ipAddress : undefined,
        device: showIp ? event.device : undefined,
      };
    });
  }
  async participants(
    problemId: string,
    principal: TechnicalPrincipal,
    before?: Date,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ kind: string; id: string; total: bigint }>
    >`WITH related AS (SELECT e."actorId",e."techActorId" FROM "TechnicalEvent" e WHERE e."problemId"=${problemId} OR (e."requestId" IS NOT NULL AND EXISTS(SELECT 1 FROM "TechnicalEvent" p WHERE p."problemId"=${problemId} AND p."requestId"=e."requestId"))), actors AS (SELECT 'app' as kind,"actorId" as id FROM related WHERE "actorId" IS NOT NULL UNION SELECT 'tech',"techActorId" FROM related WHERE "techActorId" IS NOT NULL) SELECT kind,id,count(*) OVER() as total FROM actors ORDER BY kind,id LIMIT 101`;
    const unknown = await this.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) as count FROM "TechnicalEvent" p WHERE p."problemId"=${problemId} AND p."actorId" IS NULL AND p."techActorId" IS NULL AND NOT EXISTS(SELECT 1 FROM "TechnicalEvent" e WHERE p."requestId" IS NOT NULL AND p."requestId"=e."requestId" AND (e."actorId" IS NOT NULL OR e."techActorId" IS NOT NULL))`;
    const visible = rows.slice(0, 100),
      profiles = await this.profiles(
        visible.filter((x) => x.kind === "app").map((x) => x.id),
        visible.filter((x) => x.kind === "tech").map((x) => x.id),
        principal,
        before,
      );
    return {
      knownAccounts: Number(rows[0]?.total ?? 0),
      unidentifiedAttempts: Number(unknown[0]?.count ?? 0),
      participants: visible.map(
        (x) =>
          profiles.get(x.kind + ":" + x.id) ?? {
            kind: x.kind,
            id: x.id,
            name: "Сведения об аккаунте недоступны",
            roles: [],
            organizations: [],
          },
      ),
      participantsTruncated: rows.length > 100,
    };
  }
}
