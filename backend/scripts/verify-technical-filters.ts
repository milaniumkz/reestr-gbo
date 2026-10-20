import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/reestr_test"))
  throw Error("Isolated database required");
const db = new PrismaClient(),
  base = "http://127.0.0.1:3000/api/v1/technical";
let cookie = "",
  checks = 0;
async function call(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3002",
      "X-Technical-Request": "1",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  assert(r.ok, JSON.stringify(result));
  return result;
}
async function main() {
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3002",
      "X-Technical-Request": "1",
    },
    body: JSON.stringify({ login: "owner", password: "IsolatedPassword123!" }),
  });
  assert.equal(login.status, 201);
  cookie = login.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  const org = await db.organization.findUniqueOrThrow({
      where: { bin: "111000000001" },
    }),
    other = await db.organization.findUniqueOrThrow({
      where: { bin: "111000000002" },
    }),
    user = await db.user.findUniqueOrThrow({
      where: { phone: "+77000000011" },
    }),
    foreign = await db.user.findUniqueOrThrow({
      where: { phone: "+77000000013" },
    });
  await db.user.update({
    where: { id: user.id },
    data: { fullName: "Фильтров Инспектор Первый" },
  });
  const opts = await call(
    "/filter-options?organizationId=" +
      org.id +
      "&employeeQuery=" +
      encodeURIComponent("Первый Фильтров"),
  );
  assert(opts.employees.some((e: any) => e.id === user.id));
  assert(!opts.employees.some((e: any) => e.id === foreign.id));
  checks += 2;
  const bins = await call("/filter-options?organizationQuery=111000000001");
  assert.equal(bins.organizations[0].id, org.id);
  assert(!opts.employees[0].phone);
  checks += 2;
  const query = "?organizationId=" + org.id + "&employeeId=" + user.id;
  for (const section of [
    "events",
    "problems",
    "alerts",
    "files",
    "people",
    "organizations",
    "geography",
    "deviations",
  ]) {
    const result = await call("/" + section + query);
    assert(Array.isArray(result.items));
    assert(result.total >= result.items.length);
    if (section === "people")
      assert.deepEqual(
        result.items.map((e: any) => e.id),
        [user.id],
      );
    if (section === "organizations")
      assert.deepEqual(
        result.items.map((e: any) => e.id),
        [org.id],
      );
    if (section === "events")
      assert(result.items.every((e: any) => e.actorId === user.id));
    checks++;
  }
  const people = await call(
    "/people?q=" + encodeURIComponent("Первый Фильтров"),
  );
  assert(people.items.some((e: any) => e.id === user.id));
  checks++;
  const empty = await call("/events?employeeId=" + randomUUID());
  assert.equal(empty.total, 0);
  checks++;
  // An employee can belong to two organizations; explicit object context must win.
  await db.organizationMember.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: other.id,
        userId: user.id,
        role: "inspector",
      },
    },
    create: { organizationId: other.id, userId: user.id, role: "inspector" },
    update: {},
  });
  const previous = await db.inspection.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  const second = await db.inspection.create({
    data: {
      organizationId: other.id,
      vehicleId: previous.vehicleId,
      createdById: user.id,
    },
  });
  const event = await db.technicalEvent.create({
    data: {
      source: "server",
      category: "audit",
      action: "filters.synthetic",
      result: "success",
      actorId: user.id,
      objectType: "inspection",
      objectId: second.id,
      explanation: "Isolated filter ownership check",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const excluded = await call("/events" + query + "&q=filters.synthetic");
  assert(!excluded.items.some((e: any) => e.id === event.id));
  const included = await call(
    "/events?organizationId=" +
      other.id +
      "&employeeId=" +
      user.id +
      "&q=filters.synthetic",
  );
  assert(included.items.some((e: any) => e.id === event.id));
  checks += 2;
  const mismatch = await call(
    "/people?organizationId=" + org.id + "&employeeId=" + foreign.id,
  );
  assert.equal(mismatch.total, 0);
  checks++;
  console.log(
    "Technical filters:",
    checks,
    "isolated HTTP checks passed; dependent lists, FIO/bin search, eight sections, totals, empty scopes and multi-IO ownership",
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
