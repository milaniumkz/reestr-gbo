import https from 'node:https';
import { geocoderLookup } from './geocoder-dns';

// Production has working IPv4 but no usable IPv6 route to the primary geocoder.
// Apply this only to geocoder requests, preserving normal TLS hostname verification.
export function geocoderJson(url: string): Promise<any> {
  return new Promise(resolve => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (value?: unknown) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(value);
    };
    const request = https.get(url, {
      family: 4,
      lookup: geocoderLookup,
      headers: { 'User-Agent': 'ERSI-GBO/1.0 inspection location', 'Accept-Language': 'ru,kk,en' },
    }, response => {
      if (response.statusCode !== 200) { response.resume(); finish(); return; }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 128_000) { finish(); request.destroy(); }
      });
      response.on('end', () => {
        try { finish(JSON.parse(body)); } catch { finish(); }
      });
      response.on('error', () => finish());
    });
    request.on('error', () => finish());
    timeout = setTimeout(() => { finish(); request.destroy(); }, 5000);
  });
}
