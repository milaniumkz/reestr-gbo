import { describe, expect, it, jest, afterEach } from '@jest/globals';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { geocoderJson } from './geocoder-http';
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('Geocoder HTTPS transport', () => {
  it('requests IPv4 and parses the response while clearing the timeout', async () => {
    const request = Object.assign(new EventEmitter(), { destroy: jest.fn() });
    const response = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: jest.fn(), resume: jest.fn() });
    const get = jest.spyOn(https, 'get').mockImplementation(((url: unknown, options: unknown, callback: (r: unknown) => void) => {
      queueMicrotask(() => { callback(response); response.emit('data', '{"address":{"road":"Test"}}'); response.emit('end'); });
      return request;
    }) as never);
    const clear = jest.spyOn(global, 'clearTimeout');
    expect(await geocoderJson('https://nominatim.openstreetmap.org/reverse')).toEqual({ address: { road: 'Test' } });
    expect(get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ family: 4 }), expect.any(Function));
    expect(clear).toHaveBeenCalled();
  });
  it('times out safely instead of leaving a request running', async () => {
    jest.useFakeTimers();
    const request = Object.assign(new EventEmitter(), { destroy: jest.fn() });
    jest.spyOn(https, 'get').mockReturnValue(request as never);
    const result = geocoderJson('https://nominatim.openstreetmap.org/reverse');
    await jest.advanceTimersByTimeAsync(5000);
    expect(await result).toBeUndefined();
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });
});
