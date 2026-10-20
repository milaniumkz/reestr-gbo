import { describe, it, expect, jest } from "@jest/globals";
import { TechnicalData } from "./technical-data.service";
function fixture(
  anchor: any = {
    id: "event-1",
    actorId: "user-1",
    sessionId: "session-1",
    requestId: "request-1",
  },
) {
  const db: any = {
    technicalEvent: {
      findUnique: jest.fn(async () => anchor),
      findMany: jest.fn(async () => [anchor]),
      count: jest.fn(async () => 51),
    },
  };
  const auth: any = { require: jest.fn() };
  const activity: any = { enrich: jest.fn(async (rows: any) => rows) };
  return {
    db,
    auth,
    service: new TechnicalData(db, {} as any, {} as any, auth, activity),
  };
}
describe("technical action journey", () => {
  it("uses exact authenticated actor and session, ascending order and pagination", async () => {
    const { db, auth, service } = fixture();
    const result = await service.journey({} as any, {
      eventId: "event-1",
      page: 2,
    });
    expect(db.technicalEvent.findMany).toHaveBeenCalledWith({
      where: { actorId: "user-1", sessionId: "session-1" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: 50,
      take: 50,
    });
    expect(result.total).toBe(51);
    expect(result.page).toBe(2);
    expect(auth.require).toHaveBeenCalledTimes(3);
  });
  it("limits legacy events without session to same person and object", async () => {
    const { db, service } = fixture({
      id: "event-1",
      actorId: "user-1",
      objectId: "inspection-1",
    });
    await service.journey({} as any, { eventId: "event-1" });
    expect(db.technicalEvent.findMany.mock.calls[0][0].where).toEqual({
      actorId: "user-1",
      objectId: "inspection-1",
    });
  });
  it("does not attribute unknown accounts by time, IP or device", async () => {
    const { db, service } = fixture({
      id: "event-1",
      ipAddress: "1.2.3.4",
      requestId: "request-1",
    });
    await service.journey({} as any, { eventId: "event-1" });
    expect(db.technicalEvent.findMany.mock.calls[0][0].where).toEqual({
      requestId: "request-1",
    });
  });
  it("keeps unmatched standalone event visible", async () => {
    const { db, service } = fixture({ id: "event-1" });
    await service.journey({} as any, { eventId: "event-1" });
    expect(db.technicalEvent.findMany.mock.calls[0][0].where).toEqual({
      id: "event-1",
    });
  });
  it("does not fabricate missing historical actions", async () => {
    const { service } = fixture(null);
    await expect(
      service.journey({} as any, { eventId: "absent" }),
    ).rejects.toThrow("Исходное событие не найдено");
  });
  it("requires private account and security access before querying events", async () => {
    const { service, auth, db } = fixture();
    auth.require.mockImplementation(() => {
      throw Error("Forbidden");
    });
    await expect(
      service.journey({} as any, { eventId: "event-1" }),
    ).rejects.toThrow("Forbidden");
    expect(db.technicalEvent.findUnique).not.toHaveBeenCalled();
  });
});
