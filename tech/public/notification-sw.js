/* Web Push runs without an open tab; no credentials, logs or coordinates are cached. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const url = typeof payload.url === 'string' && payload.url.startsWith('/tech/?') ? payload.url : '/tech/?section=alerts';
  event.waitUntil(self.registration.showNotification('ЕРСИ ГБО · техническая панель', {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 220) : 'Новое событие требует внимания. Откройте панель.',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'technical-alert',
    data: {url}, requireInteraction: true,
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const relative = event.notification.data && event.notification.data.url;
  const url = new URL(typeof relative === 'string' && relative.startsWith('/tech/?') ? relative : '/tech/?section=alerts', self.location.origin).href;
  event.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(async windows => {
    for (const window of windows) if (window.url.startsWith(self.location.origin + '/tech/')) { await window.navigate(url); return window.focus(); }
    return clients.openWindow(url);
  }));
});
