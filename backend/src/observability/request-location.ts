// Coordinates are client-reported, never a proof of physical presence.
export function requestLocation(
  headers: Record<string, unknown> = {},
  now = Date.now(),
) {
  const state = headers["x-location-state"];
  if (
    !["available", "denied", "unavailable", "not_requested"].includes(
      String(state),
    )
  )
    return { state: "not_provided", source: "client_reported" };
  if (state !== "available") return { state, source: "client_reported" };
  const lat = Number(headers["x-location-lat"]),
    lng = Number(headers["x-location-lng"]);
  const accuracy = Number(headers["x-location-accuracy"]);
  const capturedAt = new Date(String(headers["x-location-at"] ?? ""));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 100000 ||
    !Number.isFinite(capturedAt.getTime()) ||
    capturedAt.getTime() > now + 60000 ||
    now - capturedAt.getTime() > 15 * 60000
  )
    return { state: "invalid_or_stale", source: "client_reported" };
  return {
    state,
    lat,
    lng,
    accuracy,
    capturedAt: capturedAt.toISOString(),
    source: "client_reported",
  };
}
