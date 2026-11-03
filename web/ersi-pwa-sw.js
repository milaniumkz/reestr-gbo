// No CacheStorage: new code is revalidated without deleting sessions or drafts.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET' || url.origin!==self.location.origin) return;
  const navigation=request.mode==='navigate';
  const appFile=/^\/(?:index\.html|release\.json|manifest\.json|flutter[^/]*\.js|main\.[^/]*\.js|install\.js|auto-update\.js)$/.test(url.pathname) || /^\/(?:assets|canvaskit|icons)\//.test(url.pathname);
  if(!navigation&&!appFile)return;
  const network=fetch(new Request(request,{cache:navigation?'no-store':'no-cache'}));
  event.respondWith(navigation?network.catch(()=>new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ЕРСИ ГБО</title><p>Нет подключения к интернету. Подключитесь и откройте приложение снова.</p><p>Интернет байланысы жоқ. Желіге қосылып, қолданбаны қайта ашыңыз.</p>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )):network);
});
