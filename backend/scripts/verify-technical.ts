/** Runs exclusively against an isolated local database and local API. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { totp } from "../src/technical/technical-security";
const base = "http://127.0.0.1:3000/api/v1/technical";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/reestr_test"))
  throw new Error("Only the isolated test database is allowed");
const db = new PrismaClient();
let cookie = "";
let checks = 0;
async function call(
  path: string,
  body?: unknown,
  expected = 200,
  method?: string,
) {
  const response = await fetch(base + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3002",
      "X-Technical-Request": "1",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
async function enroll(login: string, role: string) {
  const password = "IsolatedPassword123!";
  await db.techAccount.upsert({
    where: { login },
    create: {
      login,
      fullName: "Синтетический тест " + role,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    },
    update: {
      totpEncrypted: null,
      totpConfirmedAt: null,
      lastTotpStep: -1,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  cookie = "";
  await call("/auth/login", { login, password }, 201);
  await call("/overview", undefined, 401);
  const enrollment = await call("/auth/enrollment", {}, 201);
  await call(
    "/auth/enrollment/confirm",
    { code: totp(enrollment.secret) },
    201,
  );
  return enrollment.secret;
}
async function main() {
  await db.technicalRateLimit.deleteMany();
  const inspector = await db.user.upsert({
    where: { phone: "+77000000001" },
    create: {
      phone: "+77000000001",
      fullName: "Искусственный инспектор",
      residenceCity: "Алматы",
    },
    update: { residenceCity: "Алматы" },
  });
  const org = await db.organization.upsert({
    where: { bin: "000000000001" },
    create: {
      bin: "000000000001",
      name: "ИО · тест географии",
      type: "inspection_org",
    },
    update: {},
  });
  const vehicle = await db.vehicle.upsert({
    where: { vin: "TECHSYNTHETIC00001" },
    create: {
      vin: "TECHSYNTHETIC00001",
      plateNumber: "TEST01",
      make: "Тест",
      model: "Синтетический",
    },
    update: {},
  });
  await db.vehicleOwner.deleteMany({ where: { vehicleId: vehicle.id } });
  await db.vehicleOwner.create({
    data: {
      vehicleId: vehicle.id,
      fullName: "Искусственный владелец",
      address: "г. Караганда, дом 1",
    },
  });
  const existing = await db.inspection.findFirst({
    where: { vehicleId: vehicle.id },
  });
  const inspection = existing
    ? await db.inspection.update({
        where: { id: existing.id },
        data: { address: "г. Астана, дом 2" },
      })
    : await db.inspection.create({
        data: {
          organizationId: org.id,
          vehicleId: vehicle.id,
          createdById: inspector.id,
          address: "г. Астана, дом 2",
        },
      });
  await enroll("integration-owner", "owner");
  for (const path of [
    "/auth/me",
    "/overview",
    "/events",
    "/problems",
    "/services",
    "/backups",
    "/releases",
    "/files",
    "/alerts",
    "/settings",
    "/people",
    "/accounts",
    "/organizations",
    "/geography",
  ])
    await call(path);
  const geography = await call("/geography");
  const facts = geography.items.find(
    (item: any) => item.id === inspection.id,
  ).facts;
  assert.equal(facts.inspectorMismatch, true);
  assert.equal(facts.ownerMismatch, true);
  checks += 2;
  const csrf = await fetch(base + "/maintenance/check", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  checks++;
  const settings = await call("/settings");
  assert.equal(settings.externalChannels.state, "not_connected");
  checks++;
  const recovery = await call(
    "/people/" + inspector.id + "/recovery",
    { reason: "Синтетическая проверка одноразового восстановления" },
    201,
  );
  const complete = () =>
    fetch("http://127.0.0.1:3000/api/v1/auth/recovery/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: recovery.token,
        password: "NewIsolatedPassword123!",
        confirmation: "NewIsolatedPassword123!",
      }),
    });
  const attempts = await Promise.all([complete(), complete()]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 401]);
  checks++;
  const grant = await db.passwordRecovery.findUniqueOrThrow({
    where: {
      tokenHash: (await import("../src/observability/safe-data")).digest(
        recovery.token,
      ),
    },
  });
  assert.ok(grant.usedAt);
  checks++;
  const { EventLedger } = await import(
    "../src/observability/event-ledger.service"
  );
  const ledger = new EventLedger(db as any);
  const problemId = await ledger.problem({
    status: 500,
    route: "/synthetic/verification",
    method: "POST",
    errorType: "SyntheticFailure",
    requestId: "synthetic-request-one",
  });
  await call(
    "/problems/" + problemId,
    {
      status: "resolved",
      note: "Только синтетический тест",
      resolvedVersion: "synthetic-test",
      verificationMethod: "Изолированный HTTP тест",
      verificationResult: "passed",
    },
    200,
    "PATCH",
  );
  const same = await ledger.problem({
    status: 500,
    route: "/synthetic/verification",
    method: "POST",
    errorType: "SyntheticFailure",
    requestId: "synthetic-request-two",
  });
  assert.equal(same, problemId);
  assert.equal(
    (await db.technicalProblem.findUniqueOrThrow({ where: { id: problemId } }))
      .status,
    "reopened",
  );
  checks += 2;
  const event = await ledger.write({
    category: "audit",
    action: "synthetic.integrity",
    result: "success",
    explanation: "Синтетическая запись для проверки неизменяемости",
  });
  await assert.rejects(
    db.technicalEvent.update({
      where: { id: event.id },
      data: { explanation: "Перезапись" },
    }),
  );
  await assert.rejects(db.technicalEvent.delete({ where: { id: event.id } }));
  checks += 2;
  await call(
    "/events/" + event.id + "/hold",
    { days: 365, reason: "Синтетическая проверка удержания" },
    200,
    "PATCH",
  );
  assert.ok(
    (await db.technicalEvent.findUniqueOrThrow({ where: { id: event.id } }))
      .holdUntil,
  );
  checks++;
  const file = await db.inspectionPhoto.create({
    data: {
      inspectionId: inspection.id,
      type: "tech_passport",
      objectKey: "synthetic/never-public.png",
      moderationStatus: "manual_review",
    },
  });
  await call(
    "/files/" + file.id + "/review",
    { result: "quarantined", reason: "Синтетическая проверка карантина" },
    200,
    "PATCH",
  );
  const media = (await import("../src/storage/media-security")).mediaGrant({
    key: file.objectKey,
  });
  const blocked = await fetch(
    "http://127.0.0.1:3000/api/v1/media/view?grant=" + media,
  );
  assert.equal(blocked.status, 401);
  checks++;
  ledger.onModuleDestroy();
  await enroll("integration-support", "support");
  for (const path of [
    "/people",
    "/accounts",
    "/services",
    "/organizations",
    "/geography",
  ])
    await call(path, undefined, 403);
  const events = await call("/events");
  assert.ok(
    events.items.every(
      (e: any) =>
        e.category !== "security" &&
        e.ipAddress === undefined &&
        e.device === undefined,
    ),
  );
  checks++;
  console.log(
    `Technical HTTP integration: ${checks} checks passed; synthetic isolated data only`,
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
