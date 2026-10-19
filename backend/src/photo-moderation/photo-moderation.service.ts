import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import sharp from "sharp";
import { analyzePixels, reviewReasons } from "./local-photo-analysis";
export type PhotoCheck = {
  moderationStatus: string;
  moderationModel?: string;
  moderationCheckedAt?: Date;
  moderationReason?: string;
};
const MODEL = "local-screening-v1";
@Injectable()
export class PhotoModerationService {
  private active = 0;
  status() {
    return {
      enabled: process.env.PHOTO_MODERATION_MODE !== "off",
      required: false,
      configured: true,
      provider: "local",
      model: MODEL,
      authenticityGuaranteed: false,
    };
  }
  async check(
    buffer: Buffer,
    _fileName: string,
    _type: string,
  ): Promise<PhotoCheck> {
    if (!this.status().enabled) return { moderationStatus: "disabled" };
    if (buffer.length > 12 * 1024 * 1024)
      throw new BadRequestException(
        "Максимальный размер файла для проверки — 12 МБ",
      );
    const result = (status: string, reason: string): PhotoCheck => ({
      moderationStatus: status,
      moderationModel: MODEL,
      moderationCheckedAt: new Date(),
      moderationReason: reason,
    });
    // No PDF renderer: never claim that embedded images or all pages were checked.
    if (buffer.subarray(0, 5).toString() === "%PDF-")
      return result(
        "manual_review",
        "PDF: требуется ручная проверка всех страниц",
      );
    if (this.active >= 2)
      throw new ServiceUnavailableException(
        "Проверка фото занята. Повторите загрузку через несколько секунд",
      );
    this.active++;
    try {
      const input = sharp(buffer, {
        limitInputPixels: 40_000_000,
        failOn: "warning",
        animated: false,
      }).timeout({ seconds: 8 });
      const meta = await input.metadata();
      if (!["jpeg", "png", "webp", "gif"].includes(meta.format ?? ""))
        throw new BadRequestException("Загрузите JPG, PNG, WEBP, GIF или PDF");
      if ((meta.pages ?? 1) > 1)
        throw new BadRequestException(
          "Загрузите отдельные фотографии вместо анимированного изображения",
        );
      const width = meta.width ?? 0,
        height = meta.height ?? 0;
      if (Math.min(width, height) < 240 || Math.max(width, height) < 480)
        throw new BadRequestException(
          "Слишком маленькое фото. Короткая сторона должна быть от 240, длинная от 480 пикселей",
        );
      const { data, info } = await input
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: 640,
          height: 640,
          fit: "inside",
          withoutEnlargement: true,
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const metrics = analyzePixels(data, info.width, info.height);
      // Reject unusable frames only. Screen-related signals always require a human decision.
      if (metrics.contrast < 2 && metrics.edgeFraction < 0.001)
        throw new BadRequestException(
          "На фото почти нет различимых деталей. Сфотографируйте документ заново",
        );
      const reasons = reviewReasons(metrics);
      return reasons.length
        ? result("manual_review", reasons.join("; "))
        : result(
            "local_checked",
            "Явные признаки экрана и дефекты не выявлены. Подлинность оригинала проверяется сотрудником",
          );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        "Не удалось прочитать фотографию. Загрузите исправное изображение размером до 40 мегапикселей",
      );
    } finally {
      this.active--;
    }
  }
}
