import { describe, expect, it, jest } from '@jest/globals';
import { InspectionAddressResolver } from './inspection-address';
const lat = 51.1, lng = 71.4;
const photon = (point = [lng, lat]) => ({ features: [{ geometry: { coordinates: point }, properties: { country: 'Казахстан', city: 'Астана', street: 'улица Тестовая', housenumber: '12' } }] });
const response = (data: unknown, status = 200) => status === 200 ? data : undefined;

describe('Inspection address resolution', () => {
  it('falls back to a nearby street and house when the primary provider is unreachable', async () => {
    const fetch = jest.fn<(url: string) => Promise<any>>().mockResolvedValueOnce(undefined).mockResolvedValueOnce(response(photon()));
    const resolver = new InspectionAddressResolver(fetch);
    expect(await resolver.resolve(lat, lng)).toBe('Казахстан, Астана, улица Тестовая, д. 12');
    expect(await resolver.resolve(lat, lng)).toContain('д. 12');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects a coarse locality result and a distant fallback instead of inventing an address', async () => {
    const fetch = jest.fn<(url: string) => Promise<any>>()
      .mockResolvedValueOnce(response({ lat, lon: lng, address: { city: 'Астана', country: 'Казахстан' } }))
      .mockResolvedValueOnce(response(photon([lng + 0.05, lat])));
    expect(await new InspectionAddressResolver(fetch).resolve(lat, lng)).toBeUndefined();
  });
  it('uses a precise primary result without calling the fallback', async () => {
    const fetch = jest.fn<(url: string) => Promise<any>>().mockResolvedValue(response({ lat, lon: lng, address: { country: 'Казахстан', city: 'Астана', road: 'улица Тестовая', house_number: '12' } }));
    expect(await new InspectionAddressResolver(fetch).resolve(lat, lng)).toContain('улица Тестовая, д. 12');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not cache failures, allowing the same coordinates to be retried successfully', async () => {
    const fetch = jest.fn<(url: string) => Promise<any>>()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(photon()));
    const resolver = new InspectionAddressResolver(fetch);
    expect(await resolver.resolve(lat, lng)).toBeUndefined();
    expect(await resolver.resolve(lat, lng)).toContain('д. 12');
  });
  it('rejects invalid coordinates without contacting either service', async () => {
    const fetch = jest.fn<(url: string) => Promise<any>>();
    expect(await new InspectionAddressResolver(fetch).resolve(91, 71)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
