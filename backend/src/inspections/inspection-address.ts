// Reverse geocoding is evidence of the GPS location, never the office/owner address.
import { geocoderJson } from './geocoder-http';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function distance(lat: number, lng: number, otherLat: number, otherLng: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((otherLat - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(otherLat * rad) * Math.sin((otherLng - lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
function format(country: unknown, region: unknown, city: unknown, street: unknown, house: unknown) {
  const locality = text(city), road = text(street);
  if (!locality || !road) return undefined;
  return [...new Set([text(country), text(region), locality, road, text(house) ? `д. ${text(house)}` : ''].filter(Boolean))].join(', ').slice(0, 500);
}

export const inspectionAddressUnavailable = 'Адрес инспекции не определился. Попробуйте снова определить адрес. Без определённого адреса продолжить нельзя.';

export class InspectionAddressResolver {
  constructor(private readonly json: (url: string) => Promise<any> = geocoderJson) {}
  private readonly cache = new Map<string, { address: string; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<string | undefined>>();
  private nextPrimaryRequest = 0;

  resolve(lat: number, lng: number): Promise<string | undefined> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Promise.resolve(undefined);
    const key = `${lat},${lng}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.address);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = this.lookup(lat, lng).then(address => {
      if (address) {
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { address, expiresAt: Date.now() + 10 * 60_000 });
      }
      return address;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async lookup(lat: number, lng: number) {
    // Nominatim's public usage policy permits at most one request per second.
    const wait = Math.max(0, this.nextPrimaryRequest - Date.now());
    this.nextPrimaryRequest = Date.now() + wait + 1000;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const primary = await this.json(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    if (primary?.address && primary.lat != null && primary.lon != null && Number.isFinite(Number(primary.lat)) && Number.isFinite(Number(primary.lon)) && distance(lat, lng, Number(primary.lat), Number(primary.lon)) <= 100) {
      const a = primary.address;
      const address = format(a.country, a.state, a.city || a.town || a.village || a.municipality || a.hamlet, a.road || a.pedestrian || a.residential || a.footway, a.house_number);
      if (address) return address;
    }
    const fallback = await this.json(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&radius=0.1&limit=1`);
    const feature = fallback?.features?.[0];
    const point = feature?.geometry?.coordinates;
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || distance(lat, lng, point[1], point[0]) > 100) return undefined;
    const p = feature.properties ?? {};
    return format(p.country, p.state, p.city || p.town || p.village || p.district, p.street || (p.osm_key === 'highway' ? p.name : undefined), p.housenumber);
  }
}

const resolver = new InspectionAddressResolver();
export function reverseGeocodeInspection(lat: number, lng: number) { return resolver.resolve(lat, lng); }
