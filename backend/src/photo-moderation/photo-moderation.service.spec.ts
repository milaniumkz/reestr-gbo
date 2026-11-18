import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import sharp from "sharp";
import { PhotoModerationService } from "./photo-moderation.service";
import { DEVICE_MODEL } from './local-device-evidence';
import { analyzePixels } from "./local-photo-analysis";
const saved = process.env.PHOTO_MODERATION_MODE;
beforeEach(() => {
  delete process.env.PHOTO_MODERATION_MODE;
});
afterEach(() => {
  jest.restoreAllMocks();
  if (saved === undefined) delete process.env.PHOTO_MODERATION_MODE;
  else process.env.PHOTO_MODERATION_MODE = saved;
});
function documentSvg() {
  return Buffer.from(
    `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="800" fill="#eeeece"/>${Array.from({ length: 14 }, (_, y) => Array.from({ length: 12 }, (_, x) => `<rect x="${35 + x * 65}" y="${35 + y * 37}" width="${25 + ((x * y) % 27)}" height="7" fill="#303030"/>`).join("")).join("")}</svg>`,
  );
}
async function image() {
  return sharp(documentSvg()).jpeg().toBuffer();
}
describe("local photo screening", () => {
  it('reuses only exact successful checks and shares concurrent analysis',async()=>{
    const service=new PhotoModerationService();
    const analyze=jest.spyOn(service as any,'analyze');
    const bytes=await image();
    const [a,b]=await Promise.all([service.check(bytes,'a.jpg','cylinder_label'),service.check(Buffer.from(bytes),'b.jpg','cylinder_label')]);
    expect(a).toEqual(b);expect(analyze).toHaveBeenCalledTimes(1);
    a.moderationReason='client mutation';
    expect((await service.check(bytes,'a.jpg','cylinder_label')).moderationReason).not.toBe('client mutation');
    await service.check(bytes,'a.jpg','vehicle_photo');expect(analyze).toHaveBeenCalledTimes(2);
    await service.check(await sharp(documentSvg()).jpeg({quality:70}).toBuffer(),'a.jpg','cylinder_label');expect(analyze).toHaveBeenCalledTimes(3);
    const now=Date.now();jest.spyOn(Date,'now').mockReturnValue(now+6*60000);
    await service.check(bytes,'a.jpg','cylinder_label');expect(analyze).toHaveBeenCalledTimes(4);
  });
  it('does not retain failed checks and bounds cached metadata without retaining images',async()=>{
    const service=new PhotoModerationService();
    const analyze=jest.spyOn(service as any,'analyze').mockResolvedValue({moderationStatus:'local_checked'});
    for(let n=0;n<80;n++)await service.check(Buffer.from('original-'+n),'a.jpg','vehicle_photo');
    expect((service as any).completed.size).toBe(64);expect((service as any).pending.size).toBe(0);
    const state=JSON.stringify([...(service as any).completed.values()]);expect(state).not.toContain('original-');
    analyze.mockRejectedValue(new Error('busy'));
    await expect(service.check(Buffer.from('retry'),'a.jpg','vehicle_photo')).rejects.toThrow('busy');
    analyze.mockResolvedValue({moderationStatus:'local_checked'});
    await expect(service.check(Buffer.from('retry'),'a.jpg','vehicle_photo')).resolves.toHaveProperty('moderationStatus','local_checked');
  });
  it('checks both label slots against local device evidence without modifying original bytes',async()=>{
    const original=await image();const saved=Buffer.from(original);
    const detector={model:DEVICE_MODEL,analyze:jest.fn(async()=>({model:DEVICE_MODEL,authenticityGuaranteed:false as const,pageLikeBorder:false,detections:[{kind:'phone' as const,confidence:.95,agreement:.9,box:[.1,.1,.8,.8] as [number,number,number,number]}]}))};
    const service=new PhotoModerationService(detector);
    for(const type of ['cylinder_label','cylinder_label_2'])await expect(service.check(original,'label.jpg',type)).rejects.toThrow('В центре снимка распознан телефон');
    expect(original.equals(saved)).toBe(true);expect(detector.analyze).toHaveBeenCalledTimes(2);
    await expect(service.check(original,'passport.jpg','tech_passport')).resolves.toHaveProperty('moderationStatus');
    expect(detector.analyze).toHaveBeenCalledTimes(2);
  });
  it('keeps unavailable screen detection explicit and ignores paper-only evidence',async()=>{
    const analyze=jest.fn(async()=>undefined as any);const service=new PhotoModerationService({model:DEVICE_MODEL,analyze});
    expect((await service.check(await image(),'label.jpg','cylinder_label')).moderationReason).toContain('недоступна');
    analyze.mockResolvedValueOnce({model:DEVICE_MODEL,authenticityGuaranteed:false,pageLikeBorder:true,detections:[]});
    expect(await service.check(await image(),'label.jpg','cylinder_label')).toMatchObject({moderationStatus:'local_checked'});
  });

  it("runs without a key or network even when legacy AI settings exist", async () => {
    process.env.PHOTO_MODERATION_MODE = "required";
    const fetch = jest.spyOn(globalThis, "fetch");
    const service = new PhotoModerationService();
    expect(service.status()).toMatchObject({
      provider: "local",
      configured: true,
      authenticityGuaranteed: false,
    });
    const result = await service.check(
      await image(),
      "screenshot.png",
      "tech_passport",
    );
    expect(result.moderationModel).toBe("local-screening-v3.6");
    expect(result.moderationStatus).toBe("local_checked");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['cylinder_label','cylinder_label_2'])('limits a clean %s to blur/screen screening', async(type)=>{
    const network=jest.spyOn(globalThis,'fetch');
    const result=await new PhotoModerationService().check(await image(),'original-label.jpg',type);
    expect(result).toMatchObject({moderationStatus:'local_checked',moderationReason:expect.stringContaining('экрана')});
    expect(network).not.toHaveBeenCalled();
  });
  it('still screens cylinder labels when optional screening is disabled',async()=>{
    process.env.PHOTO_MODERATION_MODE='off';
    expect(await new PhotoModerationService().check(await image(),'label.jpg','cylinder_label')).toMatchObject({moderationStatus:'local_checked',moderationReason:expect.stringContaining('экрана')});
  });
  it("does not equate periodic printed text and table rules with screen bands", () => {
    const width = 320,
      height = 480,
      data = Buffer.alloc(width * height, 230);
    for (let y = 20; y < height; y += 30)
      for (let x = 20; x < width - 20; x++) data[y * width + x] = 25;
    expect(analyzePixels(data, width, height).periodicRows).toBe(false);
  });
  it.each(["horizontal", "vertical"])(
    "does not penalize isolated %s bands on a detailed photo",
    async (axis) => {
      const width = 1200,
        height = 800,
        data = Buffer.alloc(width * height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          data[y * width + x] = Math.round(
            150 +
              40 *
                Math.sin(
                  2 *
                    Math.PI *
                    12 *
                    (axis === "horizontal" ? y / height : x / width),
                ),
          );
      for(let y=35;y<height-20;y+=45)for(let x=35;x<width-20;x+=55)for(let dy=0;dy<5;dy++)for(let dx=0;dx<20;dx++)data[(y+dy)*width+x+dx]=30;
      const png = await sharp(data, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();
      const result = await new PhotoModerationService().check(
        png,
        "document.jpg",
        "vehicle_photo",
      );
      expect(result.moderationStatus).toBe("local_checked");
      expect(result.moderationReason).not.toContain("полосы");
    },
  );
  it("does not penalize a frame alone", async () => {
    const png = await sharp(
      Buffer.from(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="480" fill="black"/><rect x="45" y="45" width="550" height="390" fill="#ddd"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect(
      await new PhotoModerationService().check(png, "doc.png", "vehicle_photo"),
    ).toMatchObject({
      moderationStatus: "local_checked",
    });
  });
  it('accepts mild softness and darker readable documents without extra quality flags',async()=>{
    for(const original of [await sharp(documentSvg()).blur(.6).jpeg().toBuffer(),await sharp(documentSvg()).linear(.15,0).jpeg().toBuffer()]){
      const copy=Buffer.from(original);
      expect(await new PhotoModerationService().check(original,'application.jpg','applicant_application')).toMatchObject({moderationStatus:'local_checked'});
      expect(original.equals(copy)).toBe(true);
    }
  });
  it("does not pretend that PDF pages were checked", async () => {
    expect(
      await new PhotoModerationService().check(
        Buffer.from("%PDF-1.7"),
        "photo.jpg",
        "certificate_document",
      ),
    ).toMatchObject({
      moderationStatus: "manual_review",
      moderationReason: expect.stringContaining("всех страниц"),
    });
  });
  it("rejects unusable frames but allows clear smaller photos", async () => {
    const blank = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      new PhotoModerationService().check(blank, "photo.png", "tech_passport"),
    ).rejects.toThrow("деталей");
    const tiny = await sharp(documentSvg()).resize(100, 100).png().toBuffer();
    await expect(
      new PhotoModerationService().check(tiny, "photo.jpg", "tech_passport"),
    ).resolves.toMatchObject({moderationStatus:"local_checked"});
  });
  it("rejects corrupt payloads and oversized files before storage", async () => {
    await expect(
      new PhotoModerationService().check(
        Buffer.from("not an image"),
        "photo.jpg",
        "photo",
      ),
    ).rejects.toThrow("прочитать");
    await expect(
      new PhotoModerationService().check(
        Buffer.alloc(12 * 1024 * 1024 + 1),
        "photo.jpg",
        "photo",
      ),
    ).rejects.toThrow("12 МБ");
  });
  it("releases its processing slot after decoding failures", async () => {
    const service = new PhotoModerationService();
    for (let i = 0; i < 3; i++)
      await expect(
        service.check(Buffer.from("broken"), "photo.jpg", "photo"),
      ).rejects.toThrow("прочитать");
    expect(
      await service.check(await image(), "photo.jpg", "photo"),
    ).toMatchObject({ moderationStatus: "local_checked" });
  });
  it("accepts portrait EXIF orientation and transparent PNG without modifying original bytes", async () => {
    const service = new PhotoModerationService();
    const jpeg = await sharp(documentSvg())
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const original = Buffer.from(jpeg);
    expect(
      (await service.check(jpeg, "no-extension", "tech_passport"))
        .moderationStatus,
    ).toBe("local_checked");
    expect(jpeg.equals(original)).toBe(true);
    const png = await sharp(documentSvg()).ensureAlpha().png().toBuffer();
    expect(
      (await service.check(png, "file.pdf", "tech_passport")).moderationStatus,
    ).toBe("local_checked");
  });
  it.each([
    "tech_passport",
    "applicant_application",
    "cylinder_work_record",
    "gas_inspection_report",
  ])(
    "accepts ordinary compressed phone documents (%s) without a 1000px requirement",
    async (type) => {
      const low = await sharp(documentSvg())
        .resize(480, 640, { fit: "fill" })
        .jpeg({ quality: 60 })
        .toBuffer();
      const result = await new PhotoModerationService().check(
        low,
        "record.jpg",
        type,
      );
      expect(result).toMatchObject({
        moderationStatus: "local_checked",
      });
    },
  );
  it("accepts a 648×913 document for quality review", async () => {
    const low = await sharp(documentSvg())
      .resize(648, 913, { fit: "fill" })
      .jpeg()
      .toBuffer();
    await expect(
      new PhotoModerationService().check(
        low,
        "record.jpg",
        "cylinder_work_record",
      ),
    ).resolves.toMatchObject({ moderationStatus: "local_checked" });
  });
  it("rejects high-resolution blurred text instead of treating table edges as legibility", async () => {
    const blurred = await sharp(documentSvg())
      .resize(1200, 1600, { fit: "fill" })
      .blur(6)
      .jpeg()
      .toBuffer();
    await expect(
      new PhotoModerationService().check(
        blurred,
        "record.jpg",
        "gas_work_record",
      ),
    ).rejects.toThrow(/различим|деталей/);
  });
  it("respects explicit off mode without reporting a successful check", async () => {
    process.env.PHOTO_MODERATION_MODE = "off";
    expect(
      await new PhotoModerationService().check(
        Buffer.from("invalid"),
        "image.jpg",
        "photo",
      ),
    ).toEqual({ moderationStatus: "disabled" });
  });
});
