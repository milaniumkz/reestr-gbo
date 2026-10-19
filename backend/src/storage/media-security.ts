import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
function key() {
  const value =
    process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!value || value.startsWith("replace_") || value.startsWith("dev_"))
    throw new ServiceUnavailableException("Защита файлов не настроена");
  return value;
}
export function mediaGrant(input: {
  key: string;
  actorId?: string;
  sid?: string;
}) {
  const payload = Buffer.from(
    JSON.stringify({ ...input, expires: Date.now() + 15 * 60000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", key())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyMediaGrant(token: string): {
  key: string;
  actorId?: string;
  sid?: string;
  expires: number;
} {
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length > 4096)
    throw new UnauthorizedException("Ссылка на файл недействительна");
  const signature = createHmac("sha256", key()).update(parts[0]).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[1], "base64url");
  } catch {
    throw new UnauthorizedException();
  }
  if (
    signature.length !== supplied.length ||
    !timingSafeEqual(signature, supplied)
  )
    throw new UnauthorizedException("Ссылка на файл недействительна");
  let grant: any;
  try {
    grant = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  } catch {
    throw new UnauthorizedException();
  }
  if (
    typeof grant.key !== "string" ||
    !Number.isFinite(grant.expires) ||
    grant.expires < Date.now() ||
    grant.expires > Date.now() + 16 * 60000
  )
    throw new UnauthorizedException(
      "Ссылка на файл истекла. Обновите карточку",
    );
  return grant;
}
