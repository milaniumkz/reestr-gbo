import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55439/reestr_test"))
  throw Error("Isolated database required");
const db = new PrismaClient(),
  base = "http://127.0.0.1:3000/api/v1";
const password = "IsolatedPhotos123!";
let checks = 0;
async function account(
  phone: string,
  role: string,
  orgId?: string,
  memberRole?: string,
) {
  const user = await db.user.upsert({
    where: { phone },
    create: {
      phone,
      fullName: "Синтетический тест фотографий",
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: false,
    },
    update: {
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: false,
      isBlocked: false,
      passwordLockedUntil: null,
      failedPasswordAttempts: 0,
    },
  });
  await db.userRole.upsert({
    where: { userId_role: { userId: user.id, role } },
    create: { userId: user.id, role },
    update: {},
  });
  if (orgId)
    await db.organizationMember.upsert({
      where: {
        organizationId_userId_role: {
          organizationId: orgId,
          userId: user.id,
          role: memberRole!,
        },
      },
      create: { organizationId: orgId, userId: user.id, role: memberRole! },
      update: { role: memberRole! },
    });
  return user;
}
async function login(phone: string, role: string, bin?: string) {
  const response = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password, role, bin }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert(body.accessToken);
  return body.accessToken;
}
async function inbox(token: string) {
  const response = await fetch(base + "/notifications?limit=100", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(response.status, 200);
  return (await response.json()).items;
}
async function main() {
  const org = await db.organization.upsert({
      where: { bin: "111000000001" },
      create: {
        bin: "111000000001",
        type: "inspection_org",
        name: "ИО тест фотопроверки",
      },
      update: { status: "active" },
    }),
    other = await db.organization.upsert({
      where: { bin: "111000000002" },
      create: {
        bin: "111000000002",
        type: "inspection_org",
        name: "Другое ИО тест",
      },
      update: { status: "active" },
    });
  const inspector = await account(
      "+77000000011",
      "inspection_org",
      org.id,
      "inspector",
    ),
    quality = await account(
      "+77000000012",
      "inspection_org",
      org.id,
      "quality_control",
    ),
    foreign = await account(
      "+77000000013",
      "inspection_org",
      other.id,
      "quality_control",
    ),
    admin = await account("+77000000014", "super_admin");
  const vehicle = await db.vehicle.upsert({
      where: { vin: "PHOTOQUALITY000001" },
      create: {
        vin: "PHOTOQUALITY000001",
        plateNumber: "PHOTO01",
        make: "Тест",
        model: "Тест",
      },
      update: {},
    }),
    inspection = await db.inspection.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        createdById: inspector.id,
      },
    }),
    token = await login(inspector.phone, "inspection_org", org.bin);
  async function upload(bytes: Buffer, expected: number) {
    const form = new FormData();
    form.set("type", "tech_passport");
    form.set(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      "document.png",
    );
    const response = await fetch(
      base + "/inspections/" + inspection.id + "/photos",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form,
      },
    );
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    checks++;
    return body;
  }
  const blank = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await upload(blank, 400);
  await upload(blank, 400);
  assert.equal(
    await db.inspectionPhoto.count({ where: { inspectionId: inspection.id } }),
    0,
  );
  assert.equal(
    await db.technicalEvent.count({
      where: { objectId: inspection.id, action: "inspection.photo.rejected" },
    }),
    2,
  );
  assert.equal(
    await db.notification.count({
      where: { entityId: inspection.id, userId: quality.id },
    }),
    0,
  );
  checks += 3;
  const image = Buffer.from(
    `<svg width="480" height="640" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="640" fill="#eee"/>${Array.from({ length: 18 }, (_, y) => Array.from({ length: 9 }, (_, x) => `<rect x="${20 + x * 47}" y="${20 + y * 31}" width="${18 + ((x * y) % 15)}" height="5" fill="#222"/>`).join("")).join("")}</svg>`,
  );
  const photo = await upload(await sharp(image).png().toBuffer(), 201);
  assert.equal(photo.moderationStatus, "manual_review");
  checks++;
  const adminInbox = await inbox(await login(admin.phone, "vehicle_owner"));
  assert.equal(
    adminInbox.filter(
      (n: any) => n.entityId === inspection.id && n.title.includes("отклонена"),
    ).length,
    2,
  );
  checks++;
  for (const notice of adminInbox.filter(
    (n: any) => n.entityId === inspection.id && n.title.includes("отклонена"),
  )) {
    assert.match(
      notice.body,
      /Подробная причина сохранена в технической панели/,
    );
    assert(!notice.body.includes("Причина:"));
  }
  const qcInbox = await inbox(
    await login(quality.phone, "inspection_org", org.bin),
  );
  const notices = qcInbox.filter(
    (n: any) =>
      n.entityId === inspection.id &&
      n.entity === "inspection" &&
      n.title.includes("Перепроверьте"),
  );
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, /Невысокое разрешение/);
  checks += 2;
  const foreignInbox = await inbox(
    await login(foreign.phone, "inspection_org", other.bin),
  );
  assert(!foreignInbox.some((n: any) => n.entityId === inspection.id));
  checks++;
  assert.equal(
    await db.technicalAlert.count({
      where: {
        category: "inspection_photo_rejected",
        explanation: { contains: inspection.id },
      },
    }),
    2,
  );
  assert(
    await db.technicalAlert.findUnique({
      where: { dedupKey: "photo-review:" + inspection.id },
    }),
  );
  checks += 2;
  console.log(
    `Photo upload/rejection/inbox integration: ${checks} checks passed; only isolated synthetic data`,
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
