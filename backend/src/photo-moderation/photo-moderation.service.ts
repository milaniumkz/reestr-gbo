import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import sharp from "sharp";
import {createHash} from "node:crypto";
import { PhotoAnalysisLimiter } from "./photo-analysis-limiter";
import { screenEvidence, shouldReshoot } from "./screen-evidence";
import { focusMetrics } from "./fast-focus";
import { LocalPhotoDeviceService } from './local-photo-device.service';
import { deviceDecision } from './local-device-evidence';
export type PhotoCheck = {
  moderationStatus: string;
  moderationModel?: string;
  moderationCheckedAt?: Date;
  moderationReason?: string;
};
const MODEL = "local-screening-v3.6";
@Injectable()
export class PhotoModerationService {
  constructor(@Optional() private readonly devices?:LocalPhotoDeviceService) {}
  private readonly limiter = new PhotoAnalysisLimiter();
  // Metadata only: never retain photos. Exact original bytes + field + policy.
  private readonly completed = new Map<string,{until:number;value:PhotoCheck}>();
  private readonly pending = new Map<string,Promise<PhotoCheck>>();
  async check(buffer:Buffer,fileName:string,type:string):Promise<PhotoCheck> {
    if(buffer.length>12*1024*1024)return this.analyze(buffer,fileName,type);
    const now=Date.now();
    for(const [key,entry] of this.completed)if(entry.until<=now)this.completed.delete(key);
    const key=type+':'+(process.env.PHOTO_MODERATION_MODE??'auto')+':'+createHash('sha256').update(buffer).digest('hex');
    const hit=this.completed.get(key);
    if(hit)return {...hit.value};
    const running=this.pending.get(key);if(running)return {...await running};
    const task=this.analyze(buffer,fileName,type);
    this.pending.set(key,task);
    try {
      const result=await task;
      if(!result.moderationReason?.includes('временно недоступна')){
        if(this.completed.size>=64)this.completed.delete(this.completed.keys().next().value!);
        this.completed.set(key,{until:Date.now()+5*60_000,value:{...result}});
      }
      return {...result};
    } finally {this.pending.delete(key);}
  }
  status() {
    return {
      enabled: process.env.PHOTO_MODERATION_MODE !== "off",
      required: false,
      configured: true,
      provider: "local",
      model: MODEL,
      authenticityGuaranteed: false,
      analysisRevision: "v3.6-fast-blur-and-screen-only",
      deviceDetection: this.devices?.model ?? 'not-configured',
      cylinderLabelOriginality: "screen-and-blur-only",
      checks:["blur","screen"],
      load: this.limiter.status(),
    };
  }
  private async analyze(
    buffer: Buffer,
    _fileName: string,
    _type: string,
  ): Promise<PhotoCheck> {
    _type = _type.endsWith("_2") ? _type.slice(0, -2) : _type;
    if (!this.status().enabled && _type !== "cylinder_label")
      return { moderationStatus: "disabled" };
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
    if (
      buffer.subarray(0, 5).toString() === "%PDF-" &&
      ["vehicle_photo", "cylinder_label"].includes(_type)
    )
      throw new BadRequestException(
        "В этом поле нужна фотография объекта, а не PDF-документ",
      );
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
      // Decode the original once. Subsequent checks use bounded, in-memory derivatives.
      const rgb=await input.rotate().flatten({background:'#ffffff'})
        .resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true})
        .toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
      const sample=()=>sharp(rgb.data,{raw:{width:rgb.info.width,height:rgb.info.height,channels:3}});
      const gray=await sample().greyscale().raw().toBuffer();
      const focus=focusMetrics(gray,rgb.info.width,rgb.info.height);
      if(focus.laplacianVariance<8 && focus.edgeFraction<.003)
        throw new BadRequestException('На фото почти нет различимых деталей. Наведите резкость и переснимите оригинал');
      const screen=await sample().resize({width:360,height:360,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
      const evidence=screenEvidence(screen.data,screen.info.width,screen.info.height);
      if(shouldReshoot(evidence,_type))throw new BadRequestException('Обнаружены совместные признаки экрана: тёмная рамка и повторяющиеся полосы. Сфотографируйте оригинал вне экрана другого устройства');
      const reasons:string[]=[];
      if(this.devices && (_type==='cylinder_label'||(evidence.enclosedDisplay&&_type!=='vehicle_photo'))){
        const analysis=await sample().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
        const decision=deviceDecision(await this.devices.analyze(analysis));
        if(decision.rejectReason)throw new BadRequestException(decision.rejectReason);
        reasons.push(...decision.reasons);
      }
      return reasons.length
        ? result("manual_review", reasons.join("; "))
        : result(
            "local_checked",
            "Сильное размытие и явные признаки экрана не выявлены",
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
