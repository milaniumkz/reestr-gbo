import { createHash } from "node:crypto";

export function safeText(value: unknown, max = 800): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/(?:Bearer\s+)[^\s,;]+/gi, "[авторизация скрыта]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[токен скрыт]",
    )
    .replace(
      /((?:password|пароль|token|secret|cookie|authorization|api[_-]?key|code)\s*[=:]\s*)[^\s,;}]+/gi,
      "$1[скрыто]",
    )
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, "[адрес с параметрами скрыт]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[почта скрыта]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[идентификатор скрыт]")
    .replace(/\b\d{6}\b/g, "[код скрыт]")
    .replace(/\b[A-Za-z0-9_+/=-]{40,}\b/g, "[секретное значение скрыто]")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .slice(0, max);
}
const permitted = new Set([
  "status",
  "previousStatus",
  "role",
  "previousRole",
  "isBlocked",
  "active",
  "type",
  "fields",
  "count",
  "sizeBytes",
  "moderationStatus",
  "moderationModel",
  "reason",
  "method",
  "route",
  "statusCode",
  "durationMs",
  "errorType",
  "code",
  "message",
  "stack",
  "changed",
  "firstLogin",
  "requestedRole",
  "verified",
  "verificationMethod",
  "verificationResult",
  "incident",
  "source",
  "category",
  "requestId",
  "version",
  "before",
  "after",
  "scope",
  "expiresAt",
  "requiresIdentityVerification",
  "reasonCode",
  "photoId",
  "userId",
  "organizationId",
  "inspectionId",
  "fileId",
]);
export function safeDetails(value: unknown, depth = 0): any {
  if (depth > 4) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value))
    return value.slice(0, 30).map((v) => safeDetails(v, depth + 1));
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => permitted.has(k))
      .map(([k, v]) => [
        k,
        [
          "userId",
          "organizationId",
          "inspectionId",
          "fileId",
          "photoId",
          "requestId",
        ].includes(k) &&
        typeof v === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          v,
        )
          ? v
          : safeDetails(v, depth + 1),
      ])
      .filter(([, v]) => v !== undefined),
  );
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function safeRoute(route: unknown) {
  return typeof route === "string" && route.length < 160
    ? route
    : "неизвестный_маршрут";
}
