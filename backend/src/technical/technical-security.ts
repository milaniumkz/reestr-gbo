import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const TECH_PERMISSIONS = {
  owner: [
    "infrastructure.read",
    "people.read",
    "overview.read",
    "issues.read",
    "issues.manage",
    "events.read",
    "security.read",
    "security.ip",
    "files.read",
    "files.original",
    "files.review",
    "backups.read",
    "releases.read",
    "alerts.read",
    "alerts.manage",
    "accounts.read",
    "accounts.manage",
    "settings.read",
    "settings.manage",
    "credentials.manage",
    "maintenance.check",
    "maintenance.dangerous",
    "events.export",
  ],
  engineer: [
    "infrastructure.read",
    "overview.read",
    "issues.read",
    "issues.manage",
    "events.read",
    "security.read",
    "security.ip",
    "files.read",
    "backups.read",
    "releases.read",
    "alerts.read",
    "alerts.manage",
    "settings.read",
    "maintenance.check",
    "events.export",
  ],
  support: [
    "overview.read",
    "issues.read",
    "issues.manage",
    "events.read",
    "files.read",
    "alerts.read",
    "alerts.manage",
  ],
  viewer: ["overview.read", "issues.read", "events.read", "alerts.read"],
} as const;
export type TechRole = keyof typeof TECH_PERMISSIONS;
export function permissions(role: string, extra: string[] = []): string[] {
  const base =
    (TECH_PERMISSIONS as Record<string, readonly string[]>)[role] ?? [];
  // Additional access is explicit, owner-assigned, and restricted to known permissions.
  const known = new Set(TECH_PERMISSIONS.owner);
  return [...new Set([...base, ...extra.filter((x) => known.has(x as never))])];
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode32(text: string) {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const c of text.replace(/=+$/, "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new BadRequestException("Неверный секрет второго фактора");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", decode32(secret)).update(counter).digest(),
    offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    "0",
  );
}
export function verifyTotp(
  secret: string,
  code: string,
  lastStep = -1,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1])
    if (
      step > lastStep &&
      step >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  return null;
}
function encryptionKey() {
  const value = process.env.TECH_PANEL_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new ServiceUnavailableException(
      "Ключ защиты технической панели не настроен",
    );
  return Buffer.from(value, "hex");
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptSecret(value: string) {
  try {
    const bytes = Buffer.from(value, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ServiceUnavailableException(
      "Не удалось проверить второй фактор. Требуется владелец панели",
    );
  }
}
export function newTotp() {
  return base32(randomBytes(20));
}
export function strongPassword(value: string, min = 12) {
  if (
    typeof value !== "string" ||
    value.length < min ||
    Buffer.byteLength(value) > 72 ||
    !value.trim()
  )
    throw new BadRequestException(
      `Пароль должен содержать минимум ${min} символов и не более 72 байтов`,
    );
}
