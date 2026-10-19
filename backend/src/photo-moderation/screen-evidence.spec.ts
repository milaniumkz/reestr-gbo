import { describe, it, expect } from "@jest/globals";
import sharp from "sharp";
import { PhotoModerationService } from "./photo-moderation.service";
import { screenEvidence, shouldReshoot } from "./screen-evidence";

function fixture({
  bezel = true,
  bands = true,
  color = false,
  angle = 0,
}: { bezel?: boolean; bands?: boolean; color?: boolean; angle?: number } = {}) {
  const width = 480,
    height = 480,
    data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const screen = x >= 70 && x < 410 && y >= 50 && y < 430;
      const phase =
        (2 * Math.PI * 18 * (x * Math.cos(angle) + y * Math.sin(angle))) /
        width;
      const wave = bands ? Math.round(25 * Math.sin(phase)) : 0;
      let r = bezel && !screen ? 25 : 180 + wave,
        g = r,
        b = r;
      if (color && screen) {
        r = 160 + wave;
        g = 160 - wave;
        b = 160;
      }
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  return { data, width, height };
}
describe("combined screen evidence", () => {
  it.each([
    0,
    Math.PI / 4,
    Math.PI / 2,
    (17 * Math.PI) / 180,
    (73 * Math.PI) / 180,
  ])("detects an internal bezel with local bands at angle %s", (angle) => {
    const f = fixture({ angle });
    const e = screenEvidence(f.data, f.width, f.height);
    expect(e.enclosedDisplay).toBe(true);
    expect(e.coherentBands).toBe(true);
    expect(shouldReshoot(e, "tech_passport")).toBe(true);
  });
  it("finds color moire and does not require a globally dark image edge", () => {
    const f = fixture({ color: true });
    const e = screenEvidence(f.data, f.width, f.height);
    expect(e.colorBands).toBe(true);
    expect(shouldReshoot(e, "tech_passport")).toBe(true);
  });
  it("does not refuse a document on a dark surface based on its border alone", () => {
    const f = fixture({ bands: false });
    const e = screenEvidence(f.data, f.width, f.height);
    expect(e.enclosedDisplay).toBe(true);
    expect(shouldReshoot(e, "tech_passport")).toBe(false);
  });
  it("does not refuse a patterned sheet without an enclosure or incidental dashboard displays", () => {
    const f = fixture({ bezel: false });
    const e = screenEvidence(f.data, f.width, f.height);
    expect(e.coherentBands).toBe(true);
    expect(shouldReshoot(e, "tech_passport")).toBe(false);
    expect(
      shouldReshoot(
        { enclosedDisplay: true, coherentBands: true, colorBands: true },
        "vehicle_photo",
      ),
    ).toBe(false);
  });
  it("requires a new capture before storage for combined signals, including after JPEG encoding", async () => {
    const f = fixture({});
    const jpeg = await sharp(f.data, {
      raw: { width: f.width, height: f.height, channels: 3 },
    })
      .resize(1200,1200)
      .jpeg({ quality: 80 })
      .toBuffer();
    await expect(
      new PhotoModerationService().check(
        jpeg,
        "original-document.jpg",
        "tech_passport",
      ),
    ).rejects.toThrow("совместные признаки");
    expect(
      await new PhotoModerationService().check(
        jpeg,
        "car.jpg",
        "vehicle_photo",
      ),
    ).toMatchObject({ moderationStatus: "manual_review" });
  });
  it("does not classify filename or missing EXIF as proof of a screenshot", async () => {
    const f = fixture({ bezel: false, bands: false });
    for (let y = 40; y < 430; y += 29)
      for (let x = 30; x < 440; x++) {
        if (x % 57 < 35)
          f.data.fill(40, (y * f.width + x) * 3, (y * f.width + x) * 3 + 3);
      }
    const png = await sharp(f.data, {
      raw: { width: f.width, height: f.height, channels: 3 },
    })
      .resize(1200,1200)
      .png()
      .toBuffer();
    await expect(
      new PhotoModerationService().check(
        png,
        "Screenshot_123.png",
        "tech_passport",
      ),
    ).resolves.toHaveProperty("moderationStatus");
  });
});
