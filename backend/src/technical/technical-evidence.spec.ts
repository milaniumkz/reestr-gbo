import { describe, it, expect, jest } from "@jest/globals";
import { TechnicalData } from "./technical-data.service";
function fixture() {
  const event: any = {
    id: "event-1",
    action: "inspection.photo.upload",
    objectType: "inspection",
    objectId: "inspection-1",
    requestId: "request-1",
    details: { photoId: "photo-1" },
  };
  const photo: any = {
    id: "photo-1",
    inspectionId: "inspection-1",
    objectKey: "inspections/inspection-1/photo.jpg",
    type: "tech_passport",
    moderationStatus: "manual_review",
  };
  const object: any = {
    id: "file-1",
    objectKey: photo.objectKey,
    createdById: "user-1",
    contentType: "image/jpeg",
    sizeBytes: 100,
  };
  const db: any = {
    technicalEvent: {
      findUnique: jest.fn(async () => event),
      findMany: jest.fn(async () => []),
    },
    auditLog: { findMany: jest.fn(async () => []) },
    inspectionPhoto: { findMany: jest.fn(async () => [photo]) },
    inspection: {
      findUnique: jest.fn(async () => ({
        id: "inspection-1",
        photos: [photo],
      })),
    },
    storageObject: { findMany: jest.fn(async () => [object]) },
  };
  const auth: any = { require: jest.fn() };
  const activity: any = {
    enrich: jest.fn(async (rows: any) => rows),
    profiles: jest.fn(
      async () => new Map([["app:user-1", { name: "Инспектор" }]]),
    ),
  };
  const principal: any = { permissions: ["files.original"] };
  return {
    db,
    event,
    photo,
    object,
    auth,
    principal,
    service: new TechnicalData(db, {} as any, {} as any, auth, activity),
  };
}
describe("technical event evidence", () => {
  it("links accepted photo to exact event and provides an audited private original route", async () => {
    const f = fixture();
    const data = await f.service.eventFiles(f.principal, f.event.id);
    expect(data.files[0]).toMatchObject({
      id: "file-1",
      forEvent: true,
      photoId: "photo-1",
      uploader: { name: "Инспектор" },
      originalUrl: "/api/v1/technical/events/event-1/files/file-1/original",
    });
    expect(data.files[0]).not.toHaveProperty("objectKey");
    expect(f.db.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: "inspection.photo.upload",
        OR: [{ id: "event-1" }, { requestId: "request-1" }],
      },
      take: 50,
    });
  });
  it("keeps rejected evidence accessible even when inspection is gone", async () => {
    const f = fixture();
    Object.assign(f.event, {
      action: "inspection.photo.rejected",
      details: { fileId: "file-1", type: "tech_passport", reason: "Размыто" },
    });
    f.db.inspectionPhoto.findMany.mockResolvedValue([]);
    f.db.inspection.findUnique.mockResolvedValue(null);
    const data = await f.service.eventFiles(f.principal, f.event.id);
    expect(data.inspection).toBeNull();
    expect(data.files[0]).toMatchObject({
      rejected: true,
      forEvent: true,
      moderationReason: "Размыто",
    });
  });
  it("does not attribute other current photos to a specific attempt", async () => {
    const f = fixture();
    f.event.details = {};
    f.db.inspectionPhoto.findMany.mockResolvedValue([]);
    const data = await f.service.eventFiles(f.principal, f.event.id);
    expect(data.files[0].forEvent).toBe(false);
    expect(data.note).toContain("не означают");
  });
  it("reports absent originals without inventing historical evidence", async () => {
    const f = fixture();
    f.db.inspectionPhoto.findMany.mockResolvedValue([]);
    f.db.storageObject.findMany.mockResolvedValue([]);
    const data = await f.service.eventFiles(f.principal, f.event.id);
    expect(data.files).toEqual([]);
    expect(data.note).toContain("не сохранён");
  });
  it("does not grant original access just because metadata is visible", async () => {
    const f = fixture();
    f.principal.permissions = [];
    const data = await f.service.eventFiles(f.principal, f.event.id);
    expect(data.files[0].originalUrl).toBeNull();
  });
  it("requires private permissions before any file lookup", async () => {
    const f = fixture();
    f.auth.require.mockImplementation(() => {
      throw Error("Forbidden");
    });
    await expect(f.service.eventFiles(f.principal, f.event.id)).rejects.toThrow(
      "Forbidden",
    );
    expect(f.db.storageObject.findMany).not.toHaveBeenCalled();
  });
});
