/** Fixed retention task: encrypted archive is durable before eligible events can be pruned. */
import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const prisma = new PrismaClient();
async function main() {
  const key = process.env.TECH_PANEL_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Archive encryption key is not configured");
  const root = process.env.TECH_ARCHIVE_PATH ?? "/opt/reestr/archives";
  await mkdir(root, { recursive: true, mode: 0o700 });
  const now = new Date(),
    where = {
      expiresAt: { lt: now },
      OR: [{ holdUntil: null }, { holdUntil: { lt: now } }],
    };
  const rows = await prisma.technicalEvent.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 10000,
  });
  if (!rows.length) {
    console.log("No eligible expired technical events");
    return;
  }
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv),
    compressed = gzipSync(
      Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n")),
    );
  const body = Buffer.concat([
    Buffer.from("ERSIARCH1"),
    iv,
    cipher.update(compressed),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const name = `events-${Date.now()}-${randomBytes(6).toString("hex")}.enc`,
    tmp = join(root, "." + name),
    target = join(root, name);
  const file = await open(tmp, "wx", 0o600);
  try {
    await file.writeFile(body);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(tmp, target);
  const directory = await open(root, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  await prisma.$transaction(async (tx) => {
    await tx.technicalEvent.create({
      data: {
        source: "retention",
        category: "audit",
        action: "technical.retention.archive",
        result: "success",
        explanation:
          "Истёкшие события сохранены в зашифрованный архив перед удалением",
        details: {
          count: rows.length,
          version: createHash("sha256").update(body).digest("hex"),
        },
        expiresAt: new Date(Date.now() + 365 * 86400000),
      },
    });
    await tx.$executeRaw`SELECT set_config('ersi.retention','on',true)`;
    await tx.technicalEvent.deleteMany({
      where: { ...where, id: { in: rows.map((row) => row.id) } },
    });
  });
  await prisma.technicalRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
  });
  console.log(
    `Archived up to ${rows.length} expired events; active legal holds preserved`,
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch(() => {
    console.error(
      "Technical archival failed; inspect service journal. No unarchived records may be pruned.",
    );
    process.exitCode = 1;
  });
