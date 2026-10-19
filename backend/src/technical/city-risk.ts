/** Reference centres, not official city boundaries. No coordinates are sent to external services. */
const centres: [string, number, number][] = [
  ["Астана", 51.17, 71.43],
  ["Алматы", 43.24, 76.92],
  ["Шымкент", 42.32, 69.59],
  ["Караганда", 49.8, 73.1],
  ["Актобе", 50.28, 57.17],
  ["Атырау", 47.1, 51.92],
  ["Актау", 43.65, 51.17],
  ["Павлодар", 52.29, 76.97],
  ["Костанай", 53.21, 63.63],
  ["Петропавловск", 54.87, 69.15],
  ["Кокшетау", 53.28, 69.38],
  ["Семей", 50.41, 80.23],
  ["Усть-Каменогорск", 49.95, 82.63],
  ["Тараз", 42.9, 71.37],
  ["Кызылорда", 44.85, 65.5],
  ["Уральск", 51.23, 51.37],
  ["Талдыкорган", 45.02, 78.37],
  ["Туркестан", 43.3, 68.27],
];
const aliases: Record<string, string> = {
  "нур султан": "Астана",
  нурсултан: "Астана",
  астана: "Астана",
  astana: "Астана",
  алматы: "Алматы",
  "алма ата": "Алматы",
  almaty: "Алматы",
  қарағанды: "Караганда",
  ақтөбе: "Актобе",
  атырау: "Атырау",
  ақтау: "Актау",
  қостанай: "Костанай",
  петропавл: "Петропавловск",
  көкшетау: "Кокшетау",
  семей: "Семей",
  өскемен: "Усть-Каменогорск",
  орал: "Уральск",
  талдықорған: "Талдыкорган",
  түркістан: "Туркестан",
};
function normalized(s: string) {
  return s
    .toLowerCase()
    .replace(/[.\-_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function explicitCity(value: string | undefined | null): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  // Only the locality segment is considered: a street named Алматы must not become a city.
  const marked = value.match(
    /(?:^|[,;]\s*|\s)(?:город|г\.|қ\.|қаласы)\s*([\p{L}][\p{L} .-]{1,70}?)(?=,|;|\n|$)/iu,
  );
  const segment = marked ? marked[1] : value.split(/[,;\n]/)[0];
  const text = normalized(segment)
    .replace(/^(?:город|г|қ)\s+/, "")
    .replace(/\s+қаласы$/, "");
  const known =
    aliases[text] ?? centres.find(([city]) => normalized(city) === text)?.[0];
  if (known) return known;
  // Explicitly identified cities outside the reference centres are still comparable by name.
  return marked && /^[\p{L}][\p{L} -]{1,69}$/u.test(text)
    ? text.charAt(0).toUpperCase() + text.slice(1)
    : null;
}
export function residenceCity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const known = explicitCity(value);
  if (known) return known;
  const text = value.trim().replace(/\s+/g, " ");
  return /^[\p{L}][\p{L} -]{1,69}$/u.test(text)
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : null;
}
export function ownerCityFromAddresses(owners: { address: string | null }[]): {
  address: string | null;
  ambiguous: boolean;
} {
  const cities = [
    ...new Set(
      owners.map((owner) => explicitCity(owner.address)).filter(Boolean),
    ),
  ];
  return {
    address:
      cities.length === 1
        ? owners.find((owner) => explicitCity(owner.address) === cities[0])!
            .address
        : null,
    ambiguous: cities.length > 1,
  };
}
export function distanceKm(lat: number, lng: number, a: number, b: number) {
  const r = Math.PI / 180,
    dLat = (a - lat) * r,
    dLon = (b - lng) * r;
  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(dLat / 2) ** 2 +
          Math.cos(lat * r) * Math.cos(a * r) * Math.sin(dLon / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(dLat / 2) ** 2 +
            Math.cos(lat * r) * Math.cos(a * r) * Math.sin(dLon / 2) ** 2),
      ),
    )
  );
}
export function inspectionCity(
  address: string | null,
  lat: unknown,
  lng: unknown,
) {
  const fromAddress = explicitCity(address);
  if (fromAddress)
    return { city: fromAddress, source: "address", approximate: false };
  if (
    lat == null ||
    lng == null ||
    String(lat).trim() === "" ||
    String(lng).trim() === "" ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng)) ||
    Math.abs(Number(lat)) > 90 ||
    Math.abs(Number(lng)) > 180
  )
    return { city: null, source: "no_data", approximate: false };
  const nearest = centres
    .map(([city, a, b]) => ({
      city,
      distance: distanceKm(Number(lat), Number(lng), a, b),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest.distance <= 25
    ? {
        city: nearest.city,
        source: "gps_reference_centre",
        approximate: true,
        distanceKm: Math.round(nearest.distance * 10) / 10,
      }
    : { city: null, source: "outside_reference_coverage", approximate: true };
}
export function cityComparison(input: {
  inspectionAddress: string | null;
  lat: unknown;
  lng: unknown;
  inspectorResidence: string | null;
  ownerAddress: string | null;
}) {
  const place = inspectionCity(input.inspectionAddress, input.lat, input.lng);
  const inspectorCity = residenceCity(input.inspectorResidence),
    ownerCity = explicitCity(input.ownerAddress);
  return {
    place,
    inspectorCity,
    ownerCity,
    inspectorMismatch: !!(
      place.city &&
      inspectorCity &&
      place.city !== inspectorCity
    ),
    ownerMismatch: !!(place.city && ownerCity && place.city !== ownerCity),
    missingInspector: !inspectorCity,
    missingOwner: !ownerCity,
    missingInspection: !place.city,
  };
}
