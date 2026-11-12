import dns, { promises as dnsPromises } from 'node:dns';
import type { LookupFunction } from 'node:net';

// Only provider hostnames go to DNS. HTTPS still checks the original hostname.
export function createGeocoderLookup(
  primary: typeof dns.lookup = dns.lookup,
  resolve4: (hostname:string) => Promise<string[]> = publicResolve4,
): LookupFunction {
  return (hostname, options, callback) => {
    let finished = false, fallbackStarted = false;
    const finish = (error:NodeJS.ErrnoException|null, address?:string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      callback(error, options.all ? (address ? [{address,family:4}] : []) : address ?? '', 4);
    };
    const fallback = () => {
      if (finished || fallbackStarted) return;
      fallbackStarted = true;
      void resolve4(hostname).then(addresses => {
        if (addresses[0]) finish(null,addresses[0]);
        else finish(Object.assign(new Error('No IPv4 address'),{code:'ENOTFOUND'}));
      }, error => finish(error));
    };
    const timer = setTimeout(fallback,750);
    primary(hostname,{family:4},(error,address) => {
      if (error) fallback();
      else finish(null,address);
    });
  };
}

function publicResolve4(hostname:string) {
  const resolver = new dnsPromises.Resolver({timeout:1000,tries:1});
  resolver.setServers(['1.1.1.1','8.8.8.8']);
  return resolver.resolve4(hostname);
}

export const geocoderLookup = createGeocoderLookup();
