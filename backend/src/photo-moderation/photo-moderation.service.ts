import { BadRequestException, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { PhotoAnalysisLimiter } from "./photo-analysis-limiter";
import { screenEvidence, shouldReshoot } from "./screen-evidence";
import { analyzePixels, reviewReasons } from "./local-photo-analysis";
export type PhotoCheck = {
  moderationStatus: string;
  moderationModel?: string;
  moderationCheckedAt?: Date;
  moderationReason?: string;
};
const MODEL = "local-screening-v2";
@Injectable()
export class PhotoModerationService {
  private readonly limiter = new PhotoAnalysisLimiter();
  status() {
    return {
      enabled: process.env.PHOTO_MODERATION_MODE !== "off",
      required: false,
      configured: true,
      provider: "local",
      model: MODEL,
      authenticityGuaranteed: false,
      analysisRevision: "v2-performance-1",
      load: this.limiter.status(),
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
    if (buffer.subarray(0, 5).toString() === "%PDF-" && ["vehicle_photo","cylinder_label"].includes(_type)) throw new BadRequestException("В этом поле нужна фотография объекта, а не PDF-документ");
    if (buffer.subarray(0, 5).toString() === "%PDF-")
      return result(
        "manual_review",
        "PDF: требуется ручная проверка всех страниц",
      );
    const release = await this.limiter.acquire();
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
        .clone()
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
      // Isolated heuristic signals remain advisory; only combined enclosure + banding requires reshooting.
      if (metrics.contrast < 2 && metrics.edgeFraction < 0.001)
        throw new BadRequestException(
          "На фото почти нет различимых деталей. Сфотографируйте документ заново",
        );
      const rgb = await input
        .clone()
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: 480,
          height: 480,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const evidence = screenEvidence(
        rgb.data,
        rgb.info.width,
        rgb.info.height,
      );
      if (shouldReshoot(evidence, _type))
        throw new BadRequestException(
          "Обнаружены совместные признаки экрана: тёмная рамка и повторяющиеся полосы. Сфотографируйте оригинал документа вне экрана другого устройства",
        );
      const reasons = reviewReasons(metrics);
      if (evidence.enclosedDisplay)
        reasons.push(
          "Внутренняя рамка вокруг светлой области: возможен экран устройства",
        );
      if (evidence.coherentBands)
        reasons.push("Повторяющиеся полосы в нескольких участках изображения");
      if (evidence.colorBands)
        reasons.push("Цветные периодические полосы: возможен муар экрана");
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
      release();
    }
  }
}
