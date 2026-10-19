/** Provision once. Only an RSA/AES encrypted delivery envelope may leave the server. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  createCipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  constants,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const db = new PrismaClient();
async function main() {
  const pem = Buffer.from(
    process.env.TECH_DELIVERY_PUBLIC_KEY ?? "",
    "base64",
  ).toString();
  const publicKey = createPublicKey(pem);
  if (
    publicKey.asymmetricKeyType !== "rsa" ||
    (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error("RSA delivery key must contain at least 3072 bits");
  const fingerprint = createHash("sha256").update(pem).digest("hex"),
    delivery = "/opt/reestr/private/technical-owner.envelope.json";
  const existing = await db.techAccount.findUnique({
    where: { login: "owner" },
  });
  if (existing) {
    const previous = JSON.parse(await readFile(delivery, "utf8"));
    if (previous.fingerprint !== fingerprint)
      throw new Error(
        "Owner already exists. Automatic password reset is forbidden",
      );
    console.log("TECH_OWNER_ENVELOPE=" + JSON.stringify(previous));
    return;
  }
  const password = randomBytes(24).toString("base64url"),
    payload = Buffer.from(
      JSON.stringify({
        url: process.env.TECH_PANEL_ORIGIN + "/tech/",
        login: "owner",
        password,
        instructions:
          "При первом входе настройте второй фактор в приложении-аутентификаторе. После входа смените пароль через кнопку «Сменить пароль». Сохраните этот файл в защищённом хранилище.",
      }),
    );
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const envelope = {
    fingerprint,
    key: publicEncrypt(
      {
        key: publicKey,
        oaepHash: "sha256",
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      key,
    ).toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    body: encrypted.toString("base64"),
  };
  await mkdir("/opt/reestr/private", { recursive: true, mode: 0o700 });
  await writeFile(delivery, JSON.stringify(envelope), {
    mode: 0o600,
    flag: "wx",
  });
  await db.$transaction(async (tx) => {
    const account = await tx.techAccount.create({
      data: {
        login: "owner",
        fullName: "Владелец технической панели",
        role: "owner",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    await tx.technicalEvent.create({
      data: {
        source: "provisioning",
        category: "security",
        action: "technical.owner.provision",
        result: "success",
        techActorId: account.id,
        explanation:
          "Создан персональный технический владелец. Данные входа зашифрованы для авторизованного получателя",
        expiresAt: new Date(Date.now() + 365 * 86400000),
      },
    });
  });
  console.log("TECH_OWNER_ENVELOPE=" + JSON.stringify(envelope));
}
main()
  .finally(() => db.$disconnect())
  .catch(() => {
    console.error(
      "Owner provisioning failed; no plaintext credentials were emitted",
    );
    process.exitCode = 1;
  });
