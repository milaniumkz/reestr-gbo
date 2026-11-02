// Installable web shell without caching Flutter bundles, API responses or credentials.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ЕРСИ ГБО</title><p>Нет подключения к интернету. Подключитесь и откройте приложение снова.</p><p>Интернет байланысы жоқ. Желіге қосылып, қолданбаны қайта ашыңыз.</p>',
    {status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
