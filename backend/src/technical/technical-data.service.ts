import {
  photoRejectionReason,
  legacyPhotoRejectionReason,
} from "./photo-rejection-reason";
import { TechnicalActivity } from "./technical-activity.service";
import { problemName } from "./activity-presentation";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import { TechnicalMonitor } from "./technical-monitor.service";
import {
  TechnicalAuthService,
  TechnicalPrincipal,
} from "./technical-auth.service";
import { safeDetails, safeText } from "../observability/safe-data";

export function pageInput(query: any) {
  const page = Math.max(
      1,
      Math.min(100000, Number.parseInt(query.page ?? "1") || 1),
    ),
    limit = Math.max(
      1,
      Math.min(100, Number.parseInt(query.limit ?? "25") || 25),
    );
  return { page, limit, skip: (page - 1) * limit };
}
function dateRange(q: any) {
  const result: any = {};
  for (const [key, value] of [
    ["gte", q.from],
    ["lte", q.to],
  ])
    if (value) {
      const date = new Date(String(value));
      if (!Number.isFinite(date.getTime()))
        throw new BadRequestException("Проверьте период");
      result[key as string] = date;
    }
  return Object.keys(result).length ? result : undefined;
}
@Injectable()
export class TechnicalData {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
    private readonly monitor: TechnicalMonitor,
    private readonly auth: TechnicalAuthService,
    private readonly activity: TechnicalActivity,
  ) {}
  private async problemSummaries(items: any[], principal: TechnicalPrincipal) {
    if (!items.length) return items;
    const latest = await this.prisma.technicalEvent.findMany({
      where: { problemId: { in: items.map((item) => item.id) } },
      orderBy: { createdAt: "desc" },
      distinct: ["problemId"],
    });
    const events = await this.activity.enrich(latest, principal);
    const accounts = await this.activity.profiles(
      [],
      items.map((x) => x.assignedTo).filter(Boolean),
      principal,
    );
    return items.map((item) => ({
      ...item,
      title: problemName(item),
      assignedName: accounts.get("tech:" + item.assignedTo)?.name,
      latestEvent: events.find((event) => event.problemId === item.id) ?? null,
    }));
  }
  async overview(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "overview.read");
    const hours = Math.max(1, Math.min(168, Number(q.hours) || 24)),
      since = new Date(Date.now() - hours * 3600000);
    const [
      snapshot,
      critical,
      errors,
      security,
      issues,
      alerts,
      lastEvent,
      requests,
    ] = await Promise.all([
      this.monitor.snapshot(),
      this.prisma.technicalProblem.count({
        where: { severity: "critical", status: { not: "resolved" } },
      }),
      this.prisma.technicalEvent.count({
        where: { category: "error", createdAt: { gte: since } },
      }),
      this.prisma.technicalEvent.count({
        where: {
          category: "security",
          result: "denied",
          createdAt: { gte: since },
        },
      }),
      this.prisma.technicalProblem.findMany({
        where: { status: { not: "resolved" } },
        orderBy: [{ lastSeenAt: "desc" }],
        take: 10,
      }),
      this.prisma.technicalAlert.count({
        where: {
          acknowledgedAt: null,
          OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
        },
      }),
      this.prisma.technicalEvent.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      this.prisma.technicalEvent.count({
        where: {
          OR: ["GET ", "POST ", "PATCH ", "PUT ", "DELETE "].map((method) => ({
            action: { startsWith: method },
          })),
          techActorId: null,
          createdAt: { gte: since },
        },
      }),
    ]);
    const unavailable = [
      snapshot.database,
      snapshot.storage,
      snapshot.redis,
    ].filter((x) => x.state === "unavailable").length;
    const unknown =
      snapshot.collector.state !== "connected" ||
      snapshot.storage.state === "not_connected";
    const urgent =
      critical > 0 ||
      (snapshot.disk.availableBytes != null &&
        snapshot.disk.availableBytes / Math.max(1, snapshot.disk.totalBytes) <
          0.05);
    const status = urgent
      ? "urgent"
      : unavailable ||
          errors ||
          security ||
          unknown ||
          snapshot.eventCollection.state === "attention"
        ? "attention"
        : "ok";
    const infrastructure = principal.permissions.includes(
      "infrastructure.read",
    );
    return {
      observedAt: new Date(),
      hours,
      status,
      counts: {
        critical,
        errors,
        security,
        unavailable,
        alerts,
        requests,
        lastEventAt: lastEvent?.createdAt ?? null,
      },
      attention: await this.problemSummaries(issues, principal),
      snapshot: infrastructure
        ? snapshot
        : {
            observedAt: snapshot.observedAt,
            application: {
              state: snapshot.application.state,
              observedAt: snapshot.application.observedAt,
            },
            database: { state: snapshot.database.state },
            collector: { state: snapshot.collector.state },
            eventCollection: { state: snapshot.eventCollection.state },
            externalNotifications: snapshot.externalNotifications,
          },
    };
  }
  async events(principal: TechnicalPrincipal, q: any) {
    this.auth.require(
      principal,
      q.category === "security" ? "security.read" : "events.read",
    );
    const page = pageInput(q),
      category =
        q.category && ["audit", "security", "error"].includes(q.category)
          ? q.category
          : undefined;
    if (!category && !principal.permissions.includes("security.read"))
      q.excludeSecurity = true;
    const where: any = {
      ...(category
        ? { category }
        : q.excludeSecurity
          ? { category: { not: "security" } }
          : {}),
      ...(q.result ? { result: String(q.result).slice(0, 30) } : {}),
      ...(q.requestId ? { requestId: String(q.requestId).slice(0, 64) } : {}),
      ...(q.actorId ? { actorId: String(q.actorId).slice(0, 64) } : {}),
      ...(q.techActorId
        ? { techActorId: String(q.techActorId).slice(0, 64) }
        : {}),
      ...(q.problemId ? { problemId: String(q.problemId).slice(0, 64) } : {}),
      ...(dateRange(q) ? { createdAt: dateRange(q) } : {}),
      ...(q.q
        ? {
            OR: [
              {
                action: {
                  contains: String(q.q).slice(0, 100),
                  mode: "insensitive",
                },
              },
              {
                explanation: {
                  contains: String(q.q).slice(0, 100),
                  mode: "insensitive",
                },
              },
              {
                requestId: {
                  contains: String(q.q).slice(0, 100),
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    if (q.q && principal.permissions.includes("people.read")) {
      const term = String(q.q).slice(0, 100);
      const [users, accounts] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            OR: [
              { fullName: { contains: term, mode: "insensitive" } },
              {
                memberships: {
                  some: {
                    organization: {
                      name: { contains: term, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          },
          select: { id: true },
          take: 100,
        }),
        this.prisma.techAccount.findMany({
          where: {
            OR: [
              { fullName: { contains: term, mode: "insensitive" } },
              { login: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true },
          take: 20,
        }),
      ]);
      where.OR = [
        ...(where.OR ?? []),
        { actorId: { in: users.map((x) => x.id) } },
        { techActorId: { in: accounts.map((x) => x.id) } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.technicalEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.technicalEvent.count({ where }),
    ]);
    await this.ledger.write({
      category: "audit",
      action: "technical.events.read",
      result: "success",
      techActorId: principal.account.id,
      explanation: "Просмотр технических событий",
      details: { category: category ?? "all", count: items.length },
    });
    return {
      items: await this.activity.enrich(items, principal),
      total,
      page: page.page,
      limit: page.limit,
    };
  }
  async exportEvents(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "events.export");
    this.auth.fresh(principal);
    const result = await this.events(principal, { ...q, limit: "100" });
    await this.ledger.write({
      category: "audit",
      action: "technical.events.export",
      result: "success",
      techActorId: principal.account.id,
      explanation: "Выдан безопасный экспорт страницы журнала",
      details: { count: result.items.length },
    });
    return {
      observedAt: new Date(),
      scope:
        "Текущая страница, максимум 100 записей; IP и сведения устройства исключены",
      items: result.items.map(
        ({
          objectContext,
          location,
          ipAddress,
          device,
          actorName,
          actor,
          ...item
        }) => item,
      ),
    };
  }
  async problems(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "issues.read");
    const page = pageInput(q),
      where = {
        ...(q.status ? { status: String(q.status) } : {}),
        ...(q.severity ? { severity: String(q.severity) } : {}),
        ...(q.q
          ? {
              title: {
                contains: String(q.q).slice(0, 100),
                mode: "insensitive" as const,
              },
            }
          : {}),
      };
    const [items, total] = await Promise.all([
      this.prisma.technicalProblem.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.technicalProblem.count({ where }),
    ]);
    return {
      items: await this.problemSummaries(items, principal),
      total,
      page: page.page,
      limit: page.limit,
    };
  }
  async journey(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "events.read");
    this.auth.require(principal, "people.read");
    this.auth.require(principal, "security.read");
    let anchor;
    if (q.alertId) {
      const alert = await this.prisma.technicalAlert.findFirst({
        where: { id: String(q.alertId), ...(await this.alertScope(principal)) },
      });
      if (!alert) throw new NotFoundException("Уведомление не найдено");
      const requestId = /Обращение: ([a-f0-9-]{36})/i.exec(
        alert.explanation,
      )?.[1];
      anchor = await this.prisma.technicalEvent.findFirst({
        where: {
          action: "inspection.photo.rejected",
          OR: [
            { id: alert.dedupKey.replace(/^photo-rejected:/, "") },
            ...(requestId ? [{ requestId }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
      });
    } else if (q.eventId)
      anchor = await this.prisma.technicalEvent.findUnique({
        where: { id: String(q.eventId) },
      });
    if (!anchor)
      throw new NotFoundException(
        "Исходное событие не найдено. История не восстанавливается предположением.",
      );
    // Never correlate people by IP, proximity in time, or device fingerprints.
    const where: any =
      anchor.actorId && anchor.sessionId
        ? { actorId: anchor.actorId, sessionId: anchor.sessionId }
        : anchor.actorId && anchor.objectId
          ? { actorId: anchor.actorId, objectId: anchor.objectId }
          : anchor.requestId
            ? { requestId: anchor.requestId }
            : { id: anchor.id };
    const page = pageInput({ ...q, limit: "50" });
    const [rows, total] = await Promise.all([
      this.prisma.technicalEvent.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.technicalEvent.count({ where }),
    ]);
    return {
      anchorId: anchor.id,
      events: await this.activity.enrich(rows, principal),
      total,
      page: page.page,
      limit: page.limit,
      scope:
        anchor.actorId && anchor.sessionId
          ? "Действия этого сотрудника в том же сеансе входа"
          : anchor.actorId && anchor.objectId
            ? "Действия этого сотрудника с тем же объектом"
            : "События одного обращения",
      note: "События показаны по времени от первого к последнему, включая неудачные запросы и незавершённое оформление. Это сохранённые обращения к серверу; действия без отправки запроса и прежние незаписанные действия здесь не видны.",
    };
  }
  async problem(principal: TechnicalPrincipal, id: string, q: any = {}) {
    this.auth.require(principal, "issues.read");
    const problem = await this.prisma.technicalProblem.findUniqueOrThrow({
      where: { id },
      include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    const page = pageInput({ page: q.eventsPage, limit: "25" });
    const [participants, rows, eventTotal, versions] = await Promise.all([
      this.activity.participants(id, principal, problem.lastSeenAt),
      this.prisma.technicalEvent.findMany({
        where: { problemId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.technicalEvent.count({ where: { problemId: id } }),
      this.prisma.technicalEvent.groupBy({
        by: ["appVersion"],
        where: { problemId: id, appVersion: { not: null } },
        _count: true,
        take: 50,
        orderBy: { appVersion: "asc" },
      }),
    ]);
    const events = await this.activity.enrich(rows, principal);
    const authors = await this.activity.profiles(
      [],
      [problem.assignedTo, ...problem.comments.map((c) => c.accountId)].filter(
        (id): id is string => !!id,
      ),
      principal,
    );
    return {
      ...problem,
      title: problemName(problem),
      assignedName: authors.get("tech:" + problem.assignedTo)?.name,
      comments: problem.comments.map((comment) => ({
        ...comment,
        authorName:
          authors.get("tech:" + comment.accountId)?.name ??
          "Автор не установлен",
      })),
      affectedUsers: participants.knownAccounts,
      affectedUsersTruncated: participants.participantsTruncated,
      ...participants,
      events,
      eventTotal,
      eventsPage: page.page,
      eventLimit: page.limit,
      historyNote:
        "Это сохранённые серверные события. Если учётная запись или точная причина не были записаны, они не восстанавливаются предположением.",
      versions,
      confirmedCause: false,
      recommendation:
        problem.code === "403"
          ? "Проверьте роль, организацию и принадлежность объекта. Не выдавайте лишние права."
          : problem.code === "401"
            ? "Проверьте срок сеанса, блокировку и обязательную смену пароля."
            : "Откройте связанные события, проверьте доступность БД и хранилища. Причина пока не подтверждена.",
    };
  }
  async updateProblem(principal: TechnicalPrincipal, id: string, input: any) {
    this.auth.require(principal, "issues.manage");
    const statuses = ["new", "in_progress", "waiting", "resolved", "reopened"];
    if (input.status && !statuses.includes(input.status))
      throw new BadRequestException("Неизвестный статус проблемы");
    if (
      input.status === "resolved" &&
      (!input.verificationMethod?.trim() ||
        !["passed", "failed", "not_verified"].includes(
          input.verificationResult,
        ) ||
        !input.resolvedVersion?.trim())
    )
      throw new BadRequestException(
        "Укажите исправляющую версию, способ и результат проверки",
      );
    if (input.status === "resolved" && input.verificationResult !== "passed")
      throw new BadRequestException(
        "Проблема остаётся открытой: проверка исправления не подтверждена",
      );
    if (!input.note?.trim())
      throw new BadRequestException("Добавьте комментарий к изменению");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.technicalProblem.update({
        where: { id },
        data: {
          status: input.status,
          assignedTo:
            input.assignedTo === null
              ? null
              : input.assignedTo
                ? String(input.assignedTo).slice(0, 64)
                : undefined,
          resolvedVersion: input.resolvedVersion
            ? safeText(input.resolvedVersion, 80)
            : undefined,
          verificationMethod: input.verificationMethod
            ? safeText(input.verificationMethod, 500)
            : undefined,
          verificationResult: input.verificationResult,
          verifiedAt:
            input.verificationResult === "passed" ? new Date() : undefined,
        },
      });
      await tx.technicalComment.create({
        data: {
          problemId: id,
          accountId: principal.account.id,
          note: safeText(input.note, 2000),
          kind: input.verificationResult ? "verification" : "comment",
        },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.problem.update",
          result: "success",
          techActorId: principal.account.id,
          objectType: "problem",
          objectId: id,
          explanation: "Обновлено расследование проблемы",
          details: {
            status: input.status,
            verificationMethod: input.verificationMethod,
            verificationResult: input.verificationResult,
          },
        },
        tx,
      );
      if (input.status === "resolved")
        await tx.technicalAlert.create({
          data: {
            dedupKey: "resolved:" + id + ":" + Date.now(),
            category: "monitoring",
            severity: "info",
            title: "Исправление проблемы подтверждено сотрудником",
            explanation:
              "Указаны исправляющая версия и результат проверки. Это запись сотрудника, а не автоматическое доказательство отсутствия ошибки.",
            problemId: id,
          },
        });
      return updated;
    });
  }
  async files(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "files.read");
    const page = pageInput(q),
      where = {
        ...(q.status ? { moderationStatus: String(q.status) } : {}),
        ...(q.type ? { type: String(q.type) } : {}),
      };
    const [items, total] = await Promise.all([
      this.prisma.inspectionPhoto.findMany({
        where,
        select: {
          id: true,
          inspectionId: true,
          objectKey: true,
          inspection: {
            select: {
              certificateNumber: true,
              organization: { select: { name: true } },
            },
          },
          type: true,
          moderationStatus: true,
          moderationModel: true,
          moderationReason: true,
          moderationCheckedAt: true,
          checksum: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.inspectionPhoto.count({ where }),
    ]);
    const [objects, uploadAudit] = await Promise.all([
      this.prisma.storageObject.findMany({
        where: { objectKey: { in: items.map((file) => file.objectKey) } },
        select: {
          objectKey: true,
          createdById: true,
          contentType: true,
          sizeBytes: true,
        },
      }),
      items.length
        ? this.prisma.auditLog.findMany({
            where: {
              action: "inspection.photo.upload",
              OR: items.map((file) => ({
                metadata: { path: ["photoId"], equals: file.id },
              })),
            },
            select: { actorId: true, metadata: true },
            take: items.length,
          })
        : [],
    ]);
    const uploaderIds = items
      .map(
        (file) =>
          objects.find((object) => object.objectKey === file.objectKey)
            ?.createdById ??
          uploadAudit.find(
            (audit) => (audit.metadata as any)?.photoId === file.id,
          )?.actorId,
      )
      .filter((id): id is string => !!id);
    const profiles = await this.activity.profiles(uploaderIds, [], principal);
    const enriched = await Promise.all(
      items.map(async (file) => ({
        ...file,
        objectKey: undefined,
        uploader:
          profiles.get(
            "app:" +
              (objects.find((object) => object.objectKey === file.objectKey)
                ?.createdById ??
                uploadAudit.find(
                  (audit) => (audit.metadata as any)?.photoId === file.id,
                )?.actorId),
          ) ?? null,
        contentType:
          objects.find((object) => object.objectKey === file.objectKey)
            ?.contentType ?? null,
        sizeBytes:
          objects.find((object) => object.objectKey === file.objectKey)
            ?.sizeBytes ?? null,
        exactRepeats: file.checksum
          ? await this.prisma.inspectionPhoto.count({
              where: { checksum: file.checksum },
            })
          : null,
        antivirus: "Не подключено",
        fieldMatch:
          "Семантическое распознавание не подключено; проверяется сотрудником",
        recheck:
          (
            await this.prisma.technicalSetting.findUnique({
              where: { key: "file-recheck:" + file.id },
            })
          )?.value ?? null,
        manualReview:
          (
            await this.prisma.technicalSetting.findUnique({
              where: { key: "file-review:" + file.id },
            })
          )?.value ?? null,
      })),
    );
    const reviewers = await this.activity.profiles(
      [],
      enriched
        .map((file) => (file.manualReview as any)?.reviewedBy)
        .filter(Boolean),
      principal,
    );
    return {
      items: enriched.map((file) => ({
        ...file,
        reviewerName:
          reviewers.get("tech:" + (file.manualReview as any)?.reviewedBy)
            ?.name ?? null,
      })),
      total,
      page: page.page,
      limit: page.limit,
    };
  }
  async reviewFile(principal: TechnicalPrincipal, id: string, input: any) {
    this.auth.require(principal, "files.review");
    this.auth.fresh(principal);
    if (
      !["reviewed", "quarantined"].includes(input.result) ||
      typeof input.reason !== "string" ||
      !input.reason.trim()
    )
      throw new BadRequestException(
        "Укажите результат ручной проверки и основание",
      );
    await this.prisma.inspectionPhoto.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      const value = {
        result: input.result,
        reason: safeText(input.reason, 1000),
        reviewedBy: principal.account.id,
        reviewedAt: new Date().toISOString(),
      };
      await tx.technicalSetting.upsert({
        where: { key: "file-review:" + id },
        create: {
          key: "file-review:" + id,
          value,
          updatedBy: principal.account.id,
          reason: safeText(input.reason),
        },
        update: {
          value,
          updatedBy: principal.account.id,
          reason: safeText(input.reason),
        },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.file.review",
          result: "success",
          techActorId: principal.account.id,
          objectType: "inspection_file",
          objectId: id,
          explanation:
            input.result === "quarantined"
              ? "Файл помещён в технический карантин; публичная выдача запрещена"
              : "Ручной просмотр файла зафиксирован. Это не утверждение инспекции",
          details: { status: input.result, reason: input.reason },
        },
        tx,
      );
      return { ok: true };
    });
  }
  private async alertScope(principal: TechnicalPrincipal) {
    const rules = await this.prisma.technicalRule.findMany();
    const categories = [
      "error",
      "security",
      "monitoring",
      "inspection_geography",
      "inspection_deviation",
      "inspection_photo_review",
      "inspection_photo_rejected",
    ].filter((category) => {
      if (
        [
          "inspection_geography",
          "inspection_deviation",
          "inspection_photo_review",
          "inspection_photo_rejected",
        ].includes(category) &&
        !principal.permissions.includes("people.read")
      )
        return false;
      if (
        category === "security" &&
        !principal.permissions.includes("security.read")
      )
        return false;
      const rule = rules.find((r) => r.category === category);
      return !rule || rule.recipients.includes(principal.account.role);
    });
    return { category: { in: categories } };
  }
  async alerts(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "alerts.read");
    const page = pageInput(q),
      where = {
        ...(await this.alertScope(principal)),
        ...(q.state === "new" ? { acknowledgedAt: null } : {}),
        ...(q.q
          ? {
              OR: [
                {
                  title: {
                    contains: String(q.q).slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
                {
                  explanation: {
                    contains: String(q.q).slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      };
    const [items, total] = await Promise.all([
      this.prisma.technicalAlert.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.technicalAlert.count({ where }),
    ]);
    const rejected = items.filter(
      (item) => item.category === "inspection_photo_rejected",
    );
    const attemptIds = rejected.map((item) =>
      item.dedupKey.replace(/^photo-rejected:/, ""),
    );
    const requestIds = rejected
      .map((item) => /Обращение: ([a-f0-9-]{36})/i.exec(item.explanation)?.[1])
      .filter((value): value is string => !!value);
    const refusalEvents = rejected.length
      ? await this.prisma.technicalEvent.findMany({
          where: {
            action: "inspection.photo.rejected",
            OR: [{ id: { in: attemptIds } }, { requestId: { in: requestIds } }],
          },
          take: page.limit,
        })
      : [];
    const refusalContext = await this.activity.enrich(refusalEvents, principal);
    const rejectionFor = (item: any) => {
      if (item.category !== "inspection_photo_rejected") return null;
      const requestId = /Обращение: ([a-f0-9-]{36})/i.exec(
        item.explanation,
      )?.[1];
      const event = refusalContext.find(
        (event) =>
          event.id === item.dedupKey.replace(/^photo-rejected:/, "") ||
          (requestId && event.requestId === requestId),
      );
      const reason =
        event?.details?.reason ?? legacyPhotoRejectionReason(item.explanation);
      return {
        ...photoRejectionReason(reason),
        actor: event?.actor ?? null,
        inspection: event?.objectContext ?? null,
        documentType: event?.details?.type ?? null,
        model: event?.details?.moderationModel ?? null,
        requestId: event?.requestId ?? requestId ?? null,
        createdAt: event?.createdAt ?? item.firstSeenAt,
      };
    };
    const profiles = await this.activity.profiles(
      [],
      items
        .flatMap((item) => [item.acknowledgedBy, item.assignedTo])
        .filter((id): id is string => !!id),
      principal,
    );
    return {
      items: items.map((item) => ({
        ...item,
        photoRejection: rejectionFor(item),
        acknowledgedName:
          profiles.get("tech:" + item.acknowledgedBy)?.name ?? null,
        assignedName: profiles.get("tech:" + item.assignedTo)?.name ?? null,
      })),
      total,
      page: page.page,
      limit: page.limit,
    };
  }
  async updateAlert(principal: TechnicalPrincipal, id: string, input: any) {
    this.auth.require(principal, "alerts.manage");
    if (
      !(await this.prisma.technicalAlert.findFirst({
        where: { id, ...(await this.alertScope(principal)) },
      }))
    )
      throw new ForbiddenException("Уведомление недоступно для вашей роли");
    if (
      input.action === "mute" &&
      (!input.reason?.trim() ||
        !Number.isFinite(input.minutes) ||
        input.minutes < 1 ||
        input.minutes > 1440)
    )
      throw new BadRequestException(
        "Укажите причину и срок приглушения до суток",
      );
    const data =
      input.action === "acknowledge"
        ? { acknowledgedBy: principal.account.id, acknowledgedAt: new Date() }
        : input.action === "claim"
          ? { assignedTo: principal.account.id }
          : input.action === "mute"
            ? {
                mutedUntil: new Date(Date.now() + input.minutes * 60000),
                muteReason: safeText(input.reason, 500),
              }
            : null;
    if (!data) throw new BadRequestException("Неизвестное действие");
    return this.prisma.$transaction(async (tx) => {
      const alert = await tx.technicalAlert.update({ where: { id }, data });
      await this.ledger.write(
        {
          category: "audit",
          action: `technical.alert.${input.action}`,
          result: "success",
          techActorId: principal.account.id,
          objectType: "alert",
          objectId: id,
          explanation: "Изменена обработка уведомления",
          details: { reason: input.reason },
        },
        tx,
      );
      return alert;
    });
  }
  async settings(principal: TechnicalPrincipal) {
    this.auth.require(principal, "settings.read");
    return {
      rules: await this.prisma.technicalRule.findMany({
        orderBy: { category: "asc" },
      }),
      settings: await this.prisma.technicalSetting.findMany({
        where: {
          NOT: {
            OR: [
              { key: { startsWith: "file-" } },
              { key: "browser-push-vapid" },
            ],
          },
        },
        take: 100,
      }),
      externalChannels: {
        state: "not_connected",
        explanation: "Ни один внешний канал не согласован и не подключён",
      },
      retention: {
        auditDays: 365,
        securityDays: 90,
        errorDays: 30,
        legalHold: true,
      },
      dangerousOperations: {
        state: "manual_procedure",
        explanation:
          "Восстановление рабочей базы и перезапуск выполняются по регламенту вне браузера. Произвольного SQL и командной строки нет.",
      },
    };
  }
  async updateRule(
    principal: TechnicalPrincipal,
    category: string,
    input: any,
  ) {
    this.auth.require(principal, "settings.manage");
    this.auth.fresh(principal);
    if (
      !["error", "security", "monitoring"].includes(category) ||
      !input.reason?.trim() ||
      !Number.isInteger(input.threshold) ||
      input.threshold < 1 ||
      input.threshold > 1000 ||
      !Number.isInteger(input.windowMinutes) ||
      input.windowMinutes < 1 ||
      input.windowMinutes > 1440 ||
      !Number.isInteger(input.cooldownMinutes) ||
      input.cooldownMinutes < 1 ||
      input.cooldownMinutes > 1440
    )
      throw new BadRequestException(
        "Проверьте пороги, периоды и основание изменения",
      );
    for (const h of [input.quietStart, input.quietEnd])
      if (h != null && (!Number.isInteger(h) || h < 0 || h > 23))
        throw new BadRequestException("Тихие часы задаются от 0 до 23 по UTC");
    const recipients = Array.isArray(input.recipients)
      ? input.recipients.filter((x: string) =>
          ["owner", "engineer", "support", "viewer"].includes(x),
        )
      : ["owner", "engineer"];
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.technicalRule.upsert({
        where: { category },
        create: {
          category,
          enabled: input.enabled !== false,
          threshold: input.threshold,
          windowMinutes: input.windowMinutes,
          cooldownMinutes: input.cooldownMinutes,
          quietStart: input.quietStart ?? null,
          quietEnd: input.quietEnd ?? null,
          recipients,
        },
        update: {
          enabled: input.enabled !== false,
          threshold: input.threshold,
          windowMinutes: input.windowMinutes,
          cooldownMinutes: input.cooldownMinutes,
          quietStart: input.quietStart ?? null,
          quietEnd: input.quietEnd ?? null,
          recipients,
        },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.settings.notification",
          result: "success",
          techActorId: principal.account.id,
          explanation: "Изменены правила уведомлений",
          details: { category, reason: input.reason },
        },
        tx,
      );
      return rule;
    });
  }
  async people(principal: TechnicalPrincipal, q: any) {
    this.auth.require(principal, "people.read");
    const page = pageInput(q);
    const digits = String(q.phone ?? "").replace(/\D/g, "");
    const where = digits ? { phone: { endsWith: digits.slice(-10) } } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          fullName: true,
          isBlocked: true,
          mustChangePassword: true,
          lastLoginAt: true,
          residenceCity: true,
          roles: { select: { role: true } },
          memberships: {
            select: {
              role: true,
              organization: { select: { id: true, name: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    await this.ledger.write({
      category: "audit",
      action: "technical.people.read",
      result: "success",
      techActorId: principal.account.id,
      explanation: "Просмотр данных пользователей с отдельным разрешением",
      details: { count: items.length },
    });
    return {
      items: items.map(({ phone, ...x }) => ({
        ...x,
        phoneMasked: phone.slice(0, 2) + "••••••" + phone.slice(-4),
      })),
      total,
      page: page.page,
      limit: page.limit,
    };
  }
  async accounts(principal: TechnicalPrincipal) {
    this.auth.require(principal, "accounts.read");
    return {
      items: await this.prisma.techAccount.findMany({
        where: { login: "owner" },
        select: {
          id: true,
          login: true,
          fullName: true,
          role: true,
          permissions: true,
          active: true,
          totpConfirmedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    };
  }
  async infrastructure(principal: TechnicalPrincipal, section = "services") {
    this.auth.require(
      principal,
      section === "backups"
        ? "backups.read"
        : section === "releases"
          ? "releases.read"
          : "infrastructure.read",
    );
    const snapshot = await this.monitor.snapshot();
    if (section === "backups" || section === "releases")
      return {
        observedAt: snapshot.observedAt,
        state: snapshot.collector.state,
        items:
          snapshot.collector.state === "connected" ||
          snapshot.collector.state === "stale"
            ? (snapshot.collector[section] ?? [])
            : [],
        stale: snapshot.collector.stale ?? false,
        explanation:
          snapshot.collector.state === "not_connected"
            ? "Серверный сборщик не подключён"
            : section === "backups"
              ? "Наличие копии не подтверждает восстановление. Смотрите дату последней изолированной проверки."
              : "Время файлов — время обнаружения, если точный манифест выпуска отсутствует",
      };
    return snapshot;
  }
  async check(
    principal: TechnicalPrincipal,
    operation: string,
    reason: string,
  ) {
    this.auth.require(principal, "maintenance.check");
    if (operation !== "verify-services")
      throw new ForbiddenException(
        "Опасное обслуживание через браузер не разрешено. Требуются специальный регламент, подтверждение личности и согласование",
      );
    if (!reason?.trim())
      throw new BadRequestException("Укажите причину проверки");
    await this.ledger.write({
      category: "audit",
      action: "technical.maintenance.check",
      result: "pending",
      techActorId: principal.account.id,
      explanation:
        "Запрошена безопасная проверка сервисов без изменения данных",
      details: { reason },
    });
    return this.monitor.snapshot();
  }
}
