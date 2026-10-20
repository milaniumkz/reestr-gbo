import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";
import { verifyMediaGrant } from "./media-security";
import { EventLedger } from "../observability/event-ledger.service";
@Controller("media")
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ledger: EventLedger,
  ) {}
  @Get("view") async view(
    @Query("grant") token: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const grant = verifyMediaGrant(String(token ?? ""));
    if(grant.key.startsWith("technical-rejections/")) throw new UnauthorizedException("Материалы отказа доступны только через техническую панель");
    const file = await this.prisma.inspectionPhoto.findFirst({
      where: { objectKey: grant.key },
      select: { id: true },
    });
    if (file) {
      const review = await this.prisma.technicalSetting.findUnique({
        where: { key: "file-review:" + file.id },
      });
      if ((review?.value as any)?.result === "quarantined")
        throw new UnauthorizedException(
          "Файл находится в техническом карантине. Обратитесь в поддержку",
        );
    }
    if (grant.actorId) {
      const session = grant.sid
        ? await this.prisma.session.findUnique({
            where: { id: grant.sid },
            include: {
              user: {
                select: { id: true, isBlocked: true, mustChangePassword: true },
              },
            },
          })
        : null;
      if (
        !session ||
        session.user.id !== grant.actorId ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.isBlocked ||
        session.user.mustChangePassword
      )
        throw new UnauthorizedException("Войдите заново для просмотра файла");
    } else if (grant.key.startsWith("inspections/")) {
      const photo = await this.prisma.inspectionPhoto.findFirst({
        where: { objectKey: grant.key },
        include: {
          inspection: {
            select: { status: true, certificate: { select: { id: true } } },
          },
        },
      });
      if (
        !photo ||
        ![
          "certificate_document",
          "tech_passport",
          "tech_passport_back",
        ].includes(photo.type) ||
        !photo.inspection.certificate ||
        !["approved", "published", "completed"].includes(
          photo.inspection.status,
        )
      )
        throw new UnauthorizedException("Файл требует защищённого доступа");
    } else if (grant.key.startsWith("imports/"))
      throw new UnauthorizedException(
        "Файл импорта доступен только авторизованным сотрудникам",
      );
    const meta = await this.prisma.storageObject.findUnique({
      where: { objectKey: grant.key },
    });
    if (meta && meta.sizeBytes > 50 * 1024 * 1024)
      throw new UnauthorizedException(
        "Файл превышает безопасный размер просмотра",
      );
    const bytes = await this.storage.readObject(grant.key);
    await this.ledger.write({
      category: "audit",
      action: "protected.file.view",
      result: "success",
      actorId: grant.actorId,
      sessionId: grant.sid,
      objectType: "file",
      objectId: meta?.id,
      explanation: "Выдан файл по ограниченному разрешению просмотра",
      details: {
        type: meta?.contentType ?? "unknown",
        sizeBytes: bytes.length,
      },
      ipAddress: req.ip,
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
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
}
