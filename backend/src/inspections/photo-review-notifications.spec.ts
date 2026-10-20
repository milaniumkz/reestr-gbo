import { describe, it, expect, jest } from "@jest/globals";
import {
  notifyPhotoReview,
  notifyPhotoRejection,
} from "./photo-review-notifications";
function fixture() {
  return {
    inspection: {
      findUniqueOrThrow: jest.fn(async () => ({
        organizationId: "org-1",
        organization: { name: "ИО тест" },
        vehicle: { plateNumber: "123ABC01" },
        certificateNumber: "100",
      })),
    },
    user: {
      findUnique: jest.fn(async () => ({ fullName: "Тестовый Инспектор" })),
    },
    inspectionPhoto: {
      findMany: jest.fn(async () => [
        {
          type: "tech_passport",
          moderationStatus: "manual_review",
          moderationReason: "Невысокое разрешение",
        },
      ]),
    },
    organizationMember: {
      findMany: jest.fn(async () => [
        { userId: "quality-1" },
        { userId: "quality-1" },
        { userId: "quality-2" },
      ]),
    },
    notification: {
      upsert: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    technicalAlert: {
      upsert: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    technicalEvent: { create: jest.fn(async () => ({})) },
  };
}
describe("photo review routing", () => {
  it("notifies admins and only quality staff of the inspection IO, with inspection link and reason", async () => {
    const tx = fixture();
    await notifyPhotoReview(tx, "inspection-1", "inspector-1");
    expect(tx.organizationMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        role: "quality_control",
        user: { isBlocked: false },
      },
      select: { userId: true },
    });
    expect(tx.notification.upsert).toHaveBeenCalledTimes(5);
    const data = tx.notification.upsert.mock.calls.map((x: any) => x[0].create);
    expect(data.filter((x: any) => x.userId).map((x: any) => x.userId)).toEqual(
      ["quality-1", "quality-2"],
    );
    expect(
      data.every(
        (x: any) =>
          x.organizationId === "org-1" &&
          x.entity === "inspection" &&
          x.entityId === "inspection-1" &&
          x.body.includes("Невысокое разрешение") &&
          x.body.includes("Тестовый Инспектор"),
      ),
    ).toBe(true);
    expect(tx.technicalAlert.upsert).toHaveBeenCalledTimes(1);
  });
  it("aggregates repeated review uploads instead of creating duplicate inbox notices", async () => {
    const tx = fixture();
    await notifyPhotoReview(tx, "inspection-1");
    await notifyPhotoReview(tx, "inspection-1");
    const keys = tx.notification.upsert.mock.calls.map(
      (x: any) => x[0].where.dedupKey,
    );
    expect(new Set(keys).size).toBe(5);
  });
  it("records every rejection independently for technical and ordinary admins without notifying quality staff", async () => {
    const tx = fixture();
    await notifyPhotoRejection(
      tx,
      "inspection-1",
      "tech_passport",
      "Размыто",
      "inspector-1",
      "test-model",
    );
    await notifyPhotoRejection(
      tx,
      "inspection-1",
      "tech_passport",
      "Размыто",
      "inspector-1",
      "test-model",
    );
    expect(tx.notification.create).toHaveBeenCalledTimes(6);
    for (const call of tx.notification.create.mock.calls as any) {
      expect(call[0].data.body).not.toContain("Размыто");
      expect(call[0].data.body).toContain(
        "Подробная причина сохранена в технической панели",
      );
    }
    for (const call of tx.technicalAlert.create.mock.calls as any)
      expect(call[0].data.explanation).toContain("Размыто");
    expect(tx.notification.upsert).not.toHaveBeenCalled();
    expect(tx.organizationMember.findMany).not.toHaveBeenCalled();
    const keys = tx.technicalAlert.create.mock.calls.map(
      (x: any) => x[0].data.dedupKey,
    );
    expect(new Set(keys).size).toBe(2);
    expect(tx.technicalEvent.create).toHaveBeenCalledTimes(2);
    for (const call of tx.technicalEvent.create.mock.calls as any)
      expect(call[0].data).toMatchObject({
        actorId: "inspector-1",
        action: "inspection.photo.rejected",
        objectId: "inspection-1",
        result: "denied",
      });
  });
});
