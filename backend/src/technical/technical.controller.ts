import { TechnicalPush } from "./technical-push.service";
import { PhotoModerationService } from "../photo-moderation/photo-moderation.service";
import { TechnicalSupport } from "./technical-support.service";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsOptional, MaxLength, MinLength } from "class-validator";
import { TechnicalAuthService, TECH_COOKIE } from "./technical-auth.service";
import {
  TechnicalGuard,
  TechnicalPermission,
  techCookie,
  assertTechnicalOrigin,
} from "./technical.guard";
import { TechnicalData } from "./technical-data.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { StorageService } from "../storage/storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { EventLedger } from "../observability/event-ledger.service";
import {
  cityComparison,
  residenceCity,
  ownerCityFromAddresses,
} from "./city-risk";
import { CityRiskService } from "./city-risk.service";

class LoginDto {
  @IsString() @MaxLength(48) login!: string;
  @IsString() @MaxLength(72) password!: string;
  @IsOptional() @IsString() @MaxLength(6) code?: string;
}
class PasswordDto {
  @IsString() @MinLength(12) @MaxLength(72) password!: string;
  @IsString() @MaxLength(72) confirmation!: string;
}
class ReauthDto {
  @IsString() @MaxLength(72) password!: string;
}
@Controller("technical/auth")
export class TechnicalLoginController {
  constructor(private readonly auth: TechnicalAuthService) {}
  private cookie(res: any, token: string) {
    res.cookie(TECH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/technical",
      maxAge: 8 * 3600000,
    });
    res.setHeader("Cache-Control", "no-store");
  }
  @Get("status") status() {
    return {
      enabled: this.auth.enabled(),
      environment:
        process.env.NODE_ENV === "production" ? "production" : "isolated",
      message: this.auth.enabled()
        ? "Вход только для технических сотрудников"
        : "Панель ещё не подключена",
    };
  }
  @Post("login") async login(
    @Body() input: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    assertTechnicalOrigin(req);
    const result = await this.auth.login(
      input.login,
      input.password,
      input.code,
      req.ip,
    );
    this.cookie(res, result.token);
    return { mfaRequired: result.mfaRequired, account: result.account };
  }
  @Get("me") async me(@Req() req: any) {
    return this.auth.principal(techCookie(req));
  }
  @Post("reauthenticate") @UseGuards(TechnicalGuard) async reauth(
    @Req() req: any,
    @Body() input: ReauthDto,
  ) {
    return this.auth.reauthenticate(req.tech, input.password);
  }
  @Post("password") @UseGuards(TechnicalGuard) async password(
    @Req() r: any,
    @Body() body: PasswordDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.auth.changePassword(
      r.tech,
      body.password,
      body.confirmation,
    );
    this.cookie(res, result.token);
    return { ok: true };
  }
  @Post("logout") @UseGuards(TechnicalGuard) async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.auth.logout(req.tech);
    res.clearCookie(TECH_COOKIE, {
      path: "/api/v1/technical",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return result;
  }
}
@Controller("technical")
@UseGuards(TechnicalGuard)
export class TechnicalController {
  constructor(
    private readonly data: TechnicalData,
    private readonly auth: TechnicalAuthService,
    private readonly recovery: PasswordRecoveryService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly ledger: EventLedger,
    private readonly city: CityRiskService,
    private readonly support: TechnicalSupport,
    private readonly push: TechnicalPush,
    private readonly moderation: PhotoModerationService,
  ) {}
  @Get("push") pushStatus(@Req() r: any) {
    return this.push.status(r.tech);
  }
  @Post("push/subscribe") pushSubscribe(@Req() r: any, @Body() b: any) {
    return this.push.subscribe(r.tech, b);
  }
  @Post("push/unsubscribe") pushUnsubscribe(@Req() r: any, @Body() b: any) {
    return this.push.unsubscribe(r.tech, b);
  }
  @Post("push/test") pushTest(@Req() r: any, @Body() b: any) {
    return this.push.test(r.tech, b);
  }
  @Post("files/:id/recheck") @TechnicalPermission("files.review") async recheck(
    @Req() r: any,
    @Param("id") id: string,
  ) {
    const photo = await this.prisma.inspectionPhoto.findUniqueOrThrow({
      where: { id },
    });
    const content = await this.storage.readObject(photo.objectKey);
    let assessment: any;
    try {
      assessment = await this.moderation.check(content, "document", photo.type);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      assessment = {
        moderationStatus: "require_reshoot",
        moderationReason: error.message,
        moderationModel: this.moderation.status().model,
        moderationCheckedAt: new Date(),
      };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.technicalSetting.upsert({
        where: { key: "file-recheck:" + id },
        create: {
          key: "file-recheck:" + id,
          value: JSON.parse(JSON.stringify(assessment)),
          updatedBy: r.tech.account.id,
          reason: "Повторная проверка оригинала",
        },
        update: {
          value: JSON.parse(JSON.stringify(assessment)),
          updatedBy: r.tech.account.id,
          reason: "Повторная проверка оригинала",
        },
      });
      if (assessment.moderationStatus !== "local_checked")
        await tx.inspectionDeviation.upsert({
          where: { dedupKey: "file-quality:" + id },
          create: {
            dedupKey: "file-quality:" + id,
            inspectionId: photo.inspectionId,
            kind: "photo_quality",
            explanation: assessment.moderationReason,
            facts: { photoId: id, type: photo.type, assessment },
          },
          update: {
            lastSeenAt: new Date(),
            explanation: assessment.moderationReason,
            facts: { photoId: id, type: photo.type, assessment },
          },
        });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.file.recheck",
          result: "success",
          techActorId: r.tech.account.id,
          objectType: "inspection_file",
          objectId: id,
          explanation:
            "Повторно проверен оригинал; первоначальный результат сохранён",
          details: {
            moderationStatus: assessment.moderationStatus,
            reason: assessment.moderationReason,
          },
        },
        tx,
      );
    });
    return assessment;
  }
  @Get("overview") overview(@Req() r: any, @Query() q: any) {
    return this.data.overview(r.tech, q);
  }
  @Get("events") events(@Req() r: any, @Query() q: any) {
    return this.data.events(r.tech, q);
  }
  @Patch("events/:id/hold") @TechnicalPermission("settings.manage") async hold(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    this.auth.fresh(r.tech);
    if (
      !Number.isInteger(body.days) ||
      body.days < 1 ||
      body.days > 3650 ||
      typeof body.reason !== "string" ||
      !body.reason.trim()
    )
      throw new BadRequestException(
        "Укажите срок сохранения от 1 до 3650 дней и основание",
      );
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.technicalEvent.findUniqueOrThrow({
          where: { id },
        }),
        until = new Date(Date.now() + body.days * 86400000);
      if (event.holdUntil && event.holdUntil > until)
        throw new BadRequestException(
          "Сокращать действующий срок сохранения нельзя",
        );
      await tx.$executeRaw`SELECT set_config('ersi.legal_hold','on',true)`;
      await tx.technicalEvent.update({
        where: { id },
        data: { holdUntil: until },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.event.hold",
          result: "success",
          techActorId: r.tech.account.id,
          objectType: "technical_event",
          objectId: id,
          explanation:
            "Событие защищено от планового удаления на время расследования",
          details: { reason: body.reason, expiresAt: until.toISOString() },
        },
        tx,
      );
      return { ok: true, holdUntil: until };
    });
  }
  @Get("events/:id/files") eventFiles(@Req() r: any, @Param("id") id: string) {
    return this.data.eventFiles(r.tech, id);
  }
  @Get("events/:id/files/:fileId/original")
  @TechnicalPermission("files.original")
  async eventOriginal(
    @Req() r: any,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res() res: any,
  ) {
    const context = await this.data.eventFiles(r.tech, id);
    if (!context.files.some((file) => file.id === fileId))
      throw new BadRequestException("Файл не связан с этим событием");
    const file = await this.prisma.storageObject.findUniqueOrThrow({
      where: { id: fileId },
    });
    await this.ledger.write({
      category: "audit",
      action: "technical.file.original",
      result: "success",
      techActorId: r.tech.account.id,
      objectType: "file",
      objectId: fileId,
      explanation: "Просмотр материала события в техническом расследовании",
      details: { requestId: context.event.requestId, source: id },
    });
    const bytes = await this.storage.readObject(file.objectKey);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const contentType = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(
      file.contentType ?? "",
    )
      ? file.contentType
      : "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    if (contentType === "application/octet-stream")
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="evidence.bin"',
      );
    res.send(bytes);
  }
  @Get("events/export") export(@Req() r: any, @Query() q: any) {
    return this.data.exportEvents(r.tech, q);
  }
  @Get("journey") journey(@Req() r: any, @Query() q: any) {
    return this.data.journey(r.tech, q);
  }
  @Get("problems") problems(@Req() r: any, @Query() q: any) {
    return this.data.problems(r.tech, q);
  }
  @Get("problems/:id") problem(
    @Req() r: any,
    @Param("id") id: string,
    @Query() q: any,
  ) {
    return this.data.problem(r.tech, id, q);
  }
  @Patch("problems/:id") updateProblem(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.data.updateProblem(r.tech, id, body);
  }
  @Get("services") services(@Req() r: any) {
    return this.data.infrastructure(r.tech);
  }
  @Get("backups") backups(@Req() r: any) {
    return this.data.infrastructure(r.tech, "backups");
  }
  @Get("releases") releases(@Req() r: any) {
    return this.data.infrastructure(r.tech, "releases");
  }
  @Get("files") files(@Req() r: any, @Query() q: any) {
    return this.data.files(r.tech, q);
  }
  @Patch("files/:id/review") reviewFile(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.data.reviewFile(r.tech, id, body);
  }
  @Get("files/:id/original")
  @TechnicalPermission("files.original")
  async original(@Req() r: any, @Param("id") id: string, @Res() res: any) {
    const photo = await this.prisma.inspectionPhoto.findUniqueOrThrow({
      where: { id },
    });
    await this.ledger.write({
      category: "audit",
      action: "technical.file.original",
      result: "success",
      techActorId: r.tech.account.id,
      objectType: "inspection_file",
      objectId: id,
      explanation: "Просмотр оригинала со специальным разрешением",
    });
    const bytes = await this.storage.readObject(photo.objectKey);
    const meta = await this.prisma.storageObject.findUnique({
      where: { objectKey: photo.objectKey },
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Type",
      meta?.contentType &&
        /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(meta.contentType)
        ? meta.contentType
        : "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes);
  }
  @Get("alerts") alerts(@Req() r: any, @Query() q: any) {
    return this.data.alerts(r.tech, q);
  }
  @Patch("alerts/:id") updateAlert(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.data.updateAlert(r.tech, id, body);
  }
  @Get("settings") settings(@Req() r: any) {
    return this.data.settings(r.tech);
  }
  @Patch("settings/rules/:category") rules(
    @Req() r: any,
    @Param("category") category: string,
    @Body() body: any,
  ) {
    return this.data.updateRule(r.tech, category, body);
  }
  @Get("accounts") accounts(@Req() r: any) {
    return this.data.accounts(r.tech);
  }
  @Post("accounts") createAccount(@Req() r: any, @Body() body: any) {
    return this.auth.createAccount(r.tech, body);
  }
  @Patch("accounts/:id") account(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.auth.changeAccess(r.tech, id, body);
  }
  @Get("people") people(@Req() r: any, @Query() q: any) {
    return this.data.people(r.tech, q);
  }
  @Post("people/:id/recovery")
  @TechnicalPermission("credentials.manage")
  issueRecovery(@Req() r: any, @Param("id") id: string, @Body() body: any) {
    this.auth.fresh(r.tech);
    return this.recovery.issue(id, r.tech.account.id, body.reason);
  }
  @Patch("people/:id/residence")
  @TechnicalPermission("accounts.manage")
  async residence(@Req() r: any, @Param("id") id: string, @Body() body: any) {
    this.auth.fresh(r.tech);
    const city = residenceCity(body.city);
    if (!city || !body.reason?.trim())
      throw new BadRequestException(
        "Укажите город проживания и основание подтверждения",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { residenceCity: city } });
      await this.ledger.write(
        {
          category: "audit",
          action: "user.residence_city",
          result: "success",
          techActorId: r.tech.account.id,
          objectType: "user",
          objectId: id,
          explanation: "Уточнён подтверждённый город проживания сотрудника",
          details: { reason: body.reason },
        },
        tx,
      );
    });
    const rows = await this.prisma.inspection.findMany({
      where: { createdById: id },
      include: {
        createdBy: { select: { residenceCity: true } },
        vehicle: { select: { owners: { select: { address: true } } } },
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    for (const row of rows) await this.city.inspect(row);
    return { ok: true };
  }
  @Post("people/:id/password") resetPassword(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.support.change(r.tech, id, body, "password");
  }
  @Patch("people/:id/block") blockUser(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.support.change(r.tech, id, body, "block");
  }
  @Get("deviations") @TechnicalPermission("people.read") async deviations(
    @Query() q: any,
  ) {
    const page = Math.max(1, Math.min(100000, parseInt(q.page) || 1)),
      limit = 25;
    const where = { ...(q.status ? { status: String(q.status) } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.inspectionDeviation.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inspectionDeviation.count({ where }),
    ]);
    const inspections = await this.prisma.inspection.findMany({
      where: { id: { in: rows.map((x) => x.inspectionId) } },
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        address: true,
        createdAt: true,
        createdBy: { select: { id: true, fullName: true } },
        organization: { select: { name: true } },
      },
    });
    const names = await this.prisma.techAccount.findMany({
      where: {
        id: { in: rows.map((x) => x.reviewedBy).filter(Boolean) as string[] },
      },
      select: { id: true, fullName: true },
    });
    return {
      items: rows.map((row) => ({
        ...row,
        inspection: inspections.find((i) => i.id === row.inspectionId) ?? null,
        reviewedName: names.find((n) => n.id === row.reviewedBy)?.fullName,
      })),
      total,
      page,
      limit,
    };
  }
  @Patch("deviations/:id")
  @TechnicalPermission("issues.manage")
  async reviewDeviation(
    @Req() r: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    if (
      !["in_progress", "resolved", "dismissed", "new"].includes(body.status) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 5 ||
      body.reason.length > 1000
    )
      throw new BadRequestException("Укажите статус и результат проверки");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.inspectionDeviation.update({
        where: { id },
        data: {
          status: body.status,
          reviewedBy: r.tech.account.id,
          reviewedAt: new Date(),
          reviewNote: body.reason,
        },
      });
      await this.ledger.write(
        {
          category: "audit",
          action: "technical.deviation.review",
          result: "success",
          techActorId: r.tech.account.id,
          objectType: "inspection",
          objectId: row.inspectionId,
          explanation: "Изменён статус проверки отклонения инспекции",
          details: { reason: body.reason, status: body.status },
        },
        tx,
      );
      return { ok: true };
    });
  }
  @Get("organizations") @TechnicalPermission("people.read") async organizations(
    @Query() q: any,
  ) {
    const page = Math.max(1, Math.min(100000, Number(q.page) || 1)),
      limit = 25;
    const where = {
      type: "inspection_org",
      ...(q.q
        ? {
            name: {
              contains: String(q.q).slice(0, 100),
              mode: "insensitive" as const,
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          address: true,
          accreditationValidFrom: true,
          accreditationValidUntil: true,
          members: {
            select: {
              role: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  residenceCity: true,
                  isBlocked: true,
                  lastLoginAt: true,
                },
              },
            },
          },
          _count: { select: { inspections: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return { items, total, page, limit };
  }
  @Get("geography") @TechnicalPermission("people.read") async geography(
    @Query() q: any,
  ) {
    const page = Math.max(1, Math.min(100000, Number(q.page) || 1)),
      limit = 25;
    const text = String(q.q ?? "").slice(0, 100),
      where = text
        ? {
            OR: [
              { address: { contains: text, mode: "insensitive" as const } },
              {
                createdBy: {
                  fullName: { contains: text, mode: "insensitive" as const },
                },
              },
              {
                organization: {
                  name: { contains: text, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {};
    const [rows, total] = await Promise.all([
      this.prisma.inspection.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, fullName: true, residenceCity: true },
          },
          organization: { select: { id: true, name: true } },
          vehicle: { select: { owners: { select: { address: true } } } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inspection.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        organization: row.organization,
        inspector: row.createdBy
          ? { id: row.createdBy.id, fullName: row.createdBy.fullName }
          : null,
        createdAt: row.createdAt,
        status: row.status,
        facts: cityComparison({
          inspectionAddress: row.address,
          lat: row.lat,
          lng: row.lng,
          inspectorResidence: row.createdBy?.residenceCity ?? null,
          ownerAddress: ownerCityFromAddresses(row.vehicle?.owners ?? [])
            .address,
        }),
      })),
      total,
      page,
      limit,
    };
  }
  @Post("maintenance/check") maintenance(@Req() r: any, @Body() body: any) {
    return this.data.check(r.tech, body.operation, body.reason);
  }
}
