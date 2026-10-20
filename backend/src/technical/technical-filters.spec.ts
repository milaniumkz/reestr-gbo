import { describe, it, expect, jest } from "@jest/globals";
import { filterIds, scopedEventSql, technicalScope } from "./technical-filters";
const organizationId = "11111111-1111-4111-8111-111111111111",
  employeeId = "22222222-2222-4222-8222-222222222222";
describe("technical organization and employee filters", () => {
  it("does not filter or query SQL when no selection exists", async () => {
    const db = { $queryRaw: jest.fn() };
    expect(await technicalScope(db, {}, "events")).toEqual({});
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before executing a query", async () => {
    const db = { $queryRaw: jest.fn() };
    await expect(
      technicalScope(db, { organizationId: "' OR TRUE --" }, "events"),
    ).rejects.toThrow("Неверный");
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("combines organization membership and exact employee for people", async () => {
    expect(
      await technicalScope({}, { organizationId, employeeId }, "people"),
    ).toEqual({
      AND: [{ id: employeeId }, { memberships: { some: { organizationId } } }],
    });
  });
  it("includes inspector, submitter, quality and leader for inspection involvement", async () => {
    const result: any = await technicalScope(
      {},
      { organizationId, employeeId },
      "inspections",
    );
    expect(result.AND[0]).toEqual({ organizationId });
    expect(result.AND[1].OR).toHaveLength(5);
  });
  it("uses a parameterized query and checks object organization before current membership", () => {
    const sql = scopedEventSql({ organizationId, employeeId });
    expect(sql.values).toContain(organizationId);
    expect(sql.values).toContain(employeeId);
    expect(sql.text).not.toContain(employeeId);
    expect(sql.text).toContain("CASE");
    expect(sql.text).toContain("InspectionPhoto");
  });
  it("uses indexed actor equality for employee-only events", async () => {
    expect(await technicalScope({}, { employeeId }, "events")).toEqual({
      actorId: employeeId,
    });
  });
  it("preserves an empty match rather than returning unrelated records", async () => {
    const db = { $queryRaw: jest.fn(async () => []) };
    expect(await technicalScope(db, { organizationId }, "files")).toEqual({
      id: { in: [] },
    });
  });
});
