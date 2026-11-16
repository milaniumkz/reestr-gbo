// Installation/lifecycle worker only. The browser loads pages and files directly.
// A network-only fetch proxy cannot provide offline functionality and can trap
// an installed app on a synthetic error page after a transient worker failure.
// Never intercept navigation, API calls, storage, uploads or application assets.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
