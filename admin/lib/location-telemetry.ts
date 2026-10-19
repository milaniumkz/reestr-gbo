let checked = 0;
let cached: Record<string, string> = { "X-Location-State": "not_requested" };
export async function diagnosticHeaders(): Promise<Record<string, string>> {
  if (typeof navigator === "undefined") return {};
  if (Date.now() - checked < 300000)
    return { "X-App-Version": "admin-technical-diagnostics-3", ...cached };
  checked = Date.now();
  try {
    // Reuse an existing grant; never trigger an unexpected permission prompt in the admin.
    if (!navigator.permissions || !navigator.geolocation) return cached;
    const permission = await navigator.permissions.query({
      name: "geolocation",
    });
    if (permission.state !== "granted") {
      cached = {
        "X-Location-State":
          permission.state === "denied" ? "denied" : "not_requested",
      };
      return cached;
    }
    await new Promise<void>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          cached = {
            "X-Location-State": "available",
            "X-Location-Lat": String(p.coords.latitude),
            "X-Location-Lng": String(p.coords.longitude),
            "X-Location-Accuracy": String(p.coords.accuracy),
            "X-Location-At": new Date(p.timestamp).toISOString(),
          };
          resolve();
        },
        () => {
          cached = { "X-Location-State": "unavailable" };
          resolve();
        },
        { timeout: 3000, maximumAge: 60000 },
      ),
    );
  } catch {
    cached = { "X-Location-State": "unavailable" };
  }
  return { "X-App-Version": "admin-technical-diagnostics-3", ...cached };
}
