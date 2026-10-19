/** Real HTTP + database checks. Strictly refuses production. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { TechnicalActivity } from "../src/technical/technical-activity.service";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/reestr_test"))
  throw Error("Isolated DB required");
const db = new PrismaClient();
const origin = "http://127.0.0.1:3002",
  base = "http://127.0.0.1:3000/api/v1";
let cookie = "";
let checks = 0;
async function call(path: string, body?: any, status = 200, method?: string) {
  const r = await fetch(base + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Technical-Request": "1",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, status, path + ": " + JSON.stringify(data));
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  checks++;
  return data;
}
async function waitEvent(requestId: string) {
  for (let i = 0; i < 60; i++) {
    const event = await db.technicalEvent.findFirst({
      where: { requestId, action: { startsWith: "POST " } },
    });
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("HTTP event not persisted");
}
async function main() {
  await db.technicalRateLimit.deleteMany();
  const pwd = "IsolatedPassword123!";
  const account = await db.techAccount.upsert({
    where: { login: "owner" },
    create: {
      login: "owner",
      fullName: "Тестовый владелец",
      role: "owner",
      passwordHash: await bcrypt.hash(pwd, 12),
    },
    update: {
      passwordHash: await bcrypt.hash(pwd, 12),
      active: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  const user = await db.user.upsert({
    where: { phone: "+77000000009" },
    create: {
      phone: "+77000000009",
      fullName: "Тест журналов Иван Иванович",
      passwordHash: await bcrypt.hash(pwd, 12),
      mustChangePassword: false,
    },
    update: {
      passwordHash: await bcrypt.hash(pwd, 12),
      isBlocked: false,
      mustChangePassword: false,
      failedPasswordAttempts: 0,
      passwordLockedUntil: null,
    },
  });
  await db.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "vehicle_owner" } },
    create: { userId: user.id, role: "vehicle_owner" },
    update: {},
  });
  await call("/technical/auth/login", { login: "owner", password: pwd }, 201);
  await call("/technical/auth/reauthenticate", { password: pwd }, 201);
  const now = new Date();
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Version": "integration-test",
      "X-Location-State": "available",
      "X-Location-Lat": "51.2",
      "X-Location-Lng": "71.4",
      "X-Location-Accuracy": "12",
      "X-Location-At": now.toISOString(),
    },
    body: JSON.stringify({
      phone: user.phone,
      password: "incorrect-password",
      role: "vehicle_owner",
    }),
  });
  assert.equal(r.status, 401);
  checks++;
  const event = await waitEvent(r.headers.get("x-request-id")!);
  assert.equal(event.actorId, user.id);
  assert.equal((event.location as any).lat, 51.2);
  assert.equal((event.details as any).verified, false);
  checks += 3;
  const events = await call("/technical/events?requestId=" + event.requestId);
  const human = events.items.find((x: any) => x.id === event.id);
  assert.equal(human.actor.name, user.fullName);
  assert.equal(human.actor.verified, false);
  assert.match(human.display.message, /пароль|проверку/);
  checks += 3;
  const problem = await call("/technical/problems/" + event.problemId);
  assert(problem.participants.some((x: any) => x.id === user.id));
  assert(problem.events.some((x: any) => x.id === event.id));
  checks += 2;
  const searched = await call(
    "/technical/events?q=" + encodeURIComponent("Тест журналов Иван"),
  );
  assert(searched.items.some((x: any) => x.actor?.name === user.fullName));
  checks++;
  const exported = await call(
    "/technical/events/export?requestId=" + event.requestId,
  );
  assert(
    exported.items.every(
      (x: any) => !x.location && !x.actor && !x.ipAddress && !x.device,
    ),
  );
  checks++;
  const restricted: any = {
    account: { id: account.id, role: "viewer" },
    permissions: ["events.read"],
  };
  const enriched = await new TechnicalActivity(db as any).enrich(
    [event],
    restricted,
  );
  assert(
    !enriched[0].location &&
      !enriched[0].actor.phoneMasked &&
      !enriched[0].ipAddress,
  );
  checks++;
  const beforeVersion = (
    await db.user.findUniqueOrThrow({ where: { id: user.id } })
  ).passwordVersion;
  await call(
    "/technical/people/" + user.id + "/password",
    {
      password: "TemporaryPassword321!",
      confirmation: "TemporaryPassword321!",
      reason: "Проверка поддержки и подтверждённой личности",
    },
    201,
  );
  let updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert(updated.mustChangePassword && updated.passwordVersion > beforeVersion);
  assert(await bcrypt.compare("TemporaryPassword321!", updated.passwordHash));
  checks += 2;
  await call(
    "/technical/people/" + user.id + "/block",
    { blocked: true, reason: "Изолированная проверка блокировки" },
    200,
    "PATCH",
  );
  updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert(updated.isBlocked);
  checks++;
  await call(
    "/technical/people/" + user.id + "/block",
    { blocked: false, reason: "Завершена изолированная проверка" },
    200,
    "PATCH",
  );
  const push = await call("/technical/push");
  assert.match(push.publicKey, /^[a-zA-Z0-9_-]{87}$/);
  checks++;
  const settings = await call("/technical/settings");
  assert(!settings.settings.some((x: any) => x.key === "browser-push-vapid"));
  checks++;
  await call(
    "/technical/push/subscribe",
    {
      subscription: {
        endpoint: "https://127.0.0.1/private",
        keys: { p256dh: "x".repeat(87), auth: "x".repeat(22) },
      },
    },
    400,
  );
  await call("/technical/deviations");
  const requestId = randomUUID(),
    id = randomUUID();
  await db.technicalEvent.createMany({
    data: [
      {
        id,
        requestId,
        source: "server",
        category: "audit",
        action: "GET /legacy",
        result: "success",
        explanation: "Legacy event",
        expiresAt: new Date(Date.now() + 10000),
      },
      {
        requestId,
        actorId: user.id,
        source: "server",
        category: "audit",
        action: "auth.login",
        result: "success",
        explanation: "Known exact request",
        expiresAt: new Date(Date.now() + 10000),
      },
    ],
  });
  const exact = await call("/technical/events?requestId=" + requestId);
  assert.equal(exact.items.find((x: any) => x.id === id).actor.id, user.id);
  checks++;
  console.log(
    `Technical activity/support integration: ${checks} checks passed; isolated synthetic data only`,
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
