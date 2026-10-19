import { afterEach, describe, expect, it, jest } from "@jest/globals";
import sharp from "sharp";
import { PhotoModerationService } from "./photo-moderation.service";
import { analyzePixels } from "./local-photo-analysis";
const saved = process.env.PHOTO_MODERATION_MODE;
afterEach(() => {
  jest.restoreAllMocks();
  if (saved === undefined) delete process.env.PHOTO_MODERATION_MODE;
  else process.env.PHOTO_MODERATION_MODE = saved;
});
function documentSvg() {
  return Buffer.from(
    `<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="600" fill="#eeeece"/>${Array.from({ length: 14 }, (_, y) => Array.from({ length: 12 }, (_, x) => `<rect x="${35 + x * 65}" y="${35 + y * 37}" width="${25 + ((x * y) % 27)}" height="7" fill="#303030"/>`).join("")).join("")}</svg>`,
  );
}
async function image() {
  return sharp(documentSvg()).jpeg().toBuffer();
}
describe("local photo screening", () => {
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
    expect(result.moderationModel).toBe("local-screening-v1");
    expect(result.moderationStatus).toBe("local_checked");
    expect(fetch).not.toHaveBeenCalled();
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
    "flags synthetic %s screen bands for human review, without rejecting upload",
    async (axis) => {
      const width = 640,
        height = 480,
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
      const png = await sharp(data, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();
      const result = await new PhotoModerationService().check(
        png,
        "document.jpg",
        "tech_passport",
      );
      expect(result.moderationStatus).toBe("manual_review");
      expect(result.moderationReason).toContain("полосы");
    },
  );
  it("flags a dark enclosing frame without claiming it is definitely a phone", async () => {
    const png = await sharp(
      Buffer.from(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="480" fill="black"/><rect x="45" y="45" width="550" height="390" fill="#ddd"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect(
      await new PhotoModerationService().check(png, "doc.png", "tech_passport"),
    ).toMatchObject({
      moderationStatus: "manual_review",
      moderationReason: expect.stringContaining("рамка"),
    });
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
  it("rejects uniform unusable frames and low resolution", async () => {
    const blank = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      new PhotoModerationService().check(blank, "photo.png", "tech_passport"),
    ).rejects.toThrow("деталей");
    const tiny = await sharp(documentSvg()).resize(100, 100).png().toBuffer();
    await expect(
      new PhotoModerationService().check(tiny, "photo.jpg", "tech_passport"),
    ).rejects.toThrow("маленькое");
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
