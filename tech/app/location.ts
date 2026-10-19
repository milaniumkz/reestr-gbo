let saved: Record<string, string> = { "X-Location-State": "not_requested" };
export function locationHeaders() {
  if (
    saved["X-Location-State"] === "available" &&
    Date.now() - new Date(saved["X-Location-At"]).getTime() > 14 * 60000
  )
    return { "X-Location-State": "unavailable" };
  return saved;
}
export async function consentLocation() {
  if (!navigator.geolocation) {
    saved = { "X-Location-State": "unavailable" };
    return;
  }
  await new Promise<void>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saved = {
          "X-Location-State": "available",
          "X-Location-Lat": String(position.coords.latitude),
          "X-Location-Lng": String(position.coords.longitude),
          "X-Location-Accuracy": String(position.coords.accuracy),
          "X-Location-At": new Date(position.timestamp).toISOString(),
        };
        resolve();
      },
      (error) => {
        saved = {
          "X-Location-State": error.code === 1 ? "denied" : "unavailable",
        };
        resolve();
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 60000 },
    ),
  );
}
