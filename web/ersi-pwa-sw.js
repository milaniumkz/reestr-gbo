// Installation/lifecycle worker only. The browser loads pages and files directly.
// A network-only fetch proxy cannot provide offline functionality and can trap
// an installed app on a synthetic error page after a transient worker failure.
// Never intercept navigation, API calls, storage, uploads or application assets.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Public release announcements only. Never cache pages or reload an active form.
self.addEventListener('push', event => {
  let payload;
  try {payload=event.data.json();} catch {return;}
  if(payload?.type!=='web_release'||!/^[a-f0-9]{40}$/.test(payload.version||''))return;
  event.waitUntil(self.registration.showNotification(String(payload.title||'ЕРСИ ГБО').slice(0,100),{
    body:String(payload.body||'').slice(0,300),icon:'/icons/Icon-192.png',badge:'/icons/Icon-192.png',
    tag:'ersi-web-release',data:{version:payload.version},
  }));
});
self.addEventListener('notificationclick',event=>{
  const version=event.notification.data?.version;
  if(!/^[a-f0-9]{40}$/.test(version||''))return;
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      const url=new URL(client.url);
      if(url.origin===self.location.origin&&['/','/index.html'].includes(url.pathname)){
        client.postMessage({type:'ersi-release-available',version});await client.focus();return;
      }
    }
    await self.clients.openWindow(self.location.origin+'/?_ersi_release='+version);
  })());
});
