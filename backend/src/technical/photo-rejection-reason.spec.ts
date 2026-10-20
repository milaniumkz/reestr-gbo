import { describe, it, expect } from "@jest/globals";
import {
  photoRejectionReason,
  legacyPhotoRejectionReason,
} from "./photo-rejection-reason";
describe("readable rejection reason", () => {
  it.each([
    [
      "Обнаружены совместные признаки экрана: тёмная рамка и повторяющиеся полосы",
      "screen_capture",
    ],
    [
      "На документе почти не различимы детали. Наведите резкость и переснимите оригинал",
      "severe_blur",
    ],
    [
      "На фото почти нет различимых деталей. Сфотографируйте документ заново",
      "unreadable",
    ],
    ["Слишком маленькое фото", "too_small"],
    ["Не удалось прочитать фотографию", "invalid_image"],
  ])("labels the recorded reason %s", (reason, code) =>
    expect(photoRejectionReason(reason)).toMatchObject({
      code,
      reason,
      automated: true,
    }),
  );
  it("does not invent a historical cause", () =>
    expect(photoRejectionReason(undefined)).toMatchObject({
      code: "other",
      reason: "Конкретная причина не была сохранена",
    }));
  it("reads a saved legacy reason without including identifiers", () =>
    expect(
      legacyPhotoRejectionReason(
        "ИО · Причина: Фото экрана · Инспекция: inspection-id · Обращение: request-id",
      ),
    ).toBe("Фото экрана"));
});
