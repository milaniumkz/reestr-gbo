/* Announce a fully published release. Reload only after an explicit safe action. */
(() => {
 'use strict';
 const current=document.querySelector('meta[name="ersi-release"]')?.content;
 if(!/^[a-f0-9]{40}$/.test(current||''))return;
 let pending=null,checking=false,reloading=false,applying=false,dirty=false,banner=null,note='';
 let appBusy=window.ersiUpdateBusy===true,pushPanel=null,pushConfig=null,pushChecking=false,pushBusy=false,pushDismissed=false,pushNote='';
 const requests=new Map();let serial=0;
 const lang=()=>{try{return JSON.parse(localStorage.getItem('flutter.app_language'))==='kk'?'kk':'ru';}catch{return 'ru';}};
 const words={
  ru:{text:'Доступна новая версия ЕРСИ ГБО. Обновите страницу.',button:'Обновить страницу',saving:'Сохраняем черновик…',blocked:'Не удалось безопасно обновить страницу. Завершите текущее действие или сохраните черновик и повторите.',push:'Получать уведомления о новых версиях, даже когда сайт закрыт?',enable:'Включить уведомления',later:'Позже',enabled:'Уведомления включены',denied:'Уведомления запрещены в браузере. Разрешите их в настройках сайта.',failed:'Не удалось включить уведомления. Попробуйте ещё раз.',ios:'На iPhone добавьте сайт на экран «Домой» и откройте его оттуда — затем включите уведомления.',unsupported:'Этот браузер не поддерживает push. На iPhone нужна iOS 16.4 или новее и запуск с экрана «Домой». При открытии сайта уведомление об обновлении будет доступно.',install:'Добавить на экран «Домой»'},
  kk:{text:'ЕРСИ ГБО жаңа нұсқасы қолжетімді. Бетті жаңартыңыз.',button:'Бетті жаңарту',saving:'Жобаны сақтап жатырмыз…',blocked:'Бетті қауіпсіз жаңарту мүмкін болмады. Ағымдағы әрекетті аяқтаңыз немесе жобаны сақтап, қайталаңыз.',push:'Сайт жабық болғанда да жаңа нұсқалар туралы хабарлама алғыңыз келе ме?',enable:'Хабарламаларды қосу',later:'Кейін',enabled:'Хабарламалар қосылды',denied:'Браузер хабарламаларға тыйым салған. Сайт параметрлерінен рұқсат беріңіз.',failed:'Хабарламаларды қосу мүмкін болмады. Қайталаңыз.',ios:'iPhone телефонында сайтты «Басты экранға» қосып, сол жерден ашыңыз, содан кейін хабарламаларды қосыңыз.',unsupported:'Браузер push хабарламаларын қолдамайды. iPhone үшін iOS 16.4 немесе жаңарақ нұсқа және Басты экраннан іске қосу қажет. Сайт ашылғанда жаңарту хабарламасы көрсетіледі.',install:'«Басты экранға» қосу'},
 };
 const modal=()=>document.querySelector('dialog[open],[role="dialog"]');
 const blocked=()=>appBusy||dirty||modal()||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
 function call(action,payload={}){
  return new Promise(resolve=>{
   if(!window.ersiUpdateBridgeReady)return resolve({ok:false});
   const id=String(++serial),timeout=setTimeout(()=>{requests.delete(id);resolve({ok:false});},25000);
   requests.set(id,result=>{clearTimeout(timeout);resolve(result);});
   window.dispatchEvent(new CustomEvent('ersi-update-request',{detail:JSON.stringify({id,action,payload})}));
  });
 }
 window.addEventListener('ersi-update-response',event=>{try{const result=JSON.parse(event.detail),done=requests.get(result.id);if(done){requests.delete(result.id);done(result);}}catch{}});
 function show(){
  if(!pending){if(banner)banner.hidden=true;return;}
  if(!banner){
   banner=document.createElement('aside');banner.id='ersi-update';banner.setAttribute('role','alert');
   banner.style.cssText='position:fixed;top:calc(12px + env(safe-area-inset-top));left:12px;right:12px;max-width:430px;margin:auto;z-index:2147483640;background:#fff;color:#123e34;padding:14px;box-sizing:border-box;border:2px solid #007a4d;border-radius:14px;box-shadow:0 8px 28px #0003;font:15px/1.4 system-ui';
   const text=document.createElement('span'),button=document.createElement('button'),status=document.createElement('p');
   status.setAttribute('role','status');status.style.margin='8px 0 0';
   button.type='button';button.style.cssText='display:block;margin-top:10px;min-height:44px;padding:10px 14px;border:0;border-radius:9px;background:#007a4d;color:white;font:700 15px system-ui';
   button.addEventListener('click',apply);banner.append(text,button,status);document.body.appendChild(banner);
  }
  banner.querySelector('span').textContent=words[lang()].text;
  banner.querySelector('button').textContent=applying?words[lang()].saving:words[lang()].button;
  banner.querySelector('button').disabled=applying;
  banner.querySelector('p').textContent=note;
  banner.hidden=!!modal();renderPush();
 }
 async function apply(){
  if(!pending||reloading||applying)return;
  applying=true;note='';show();
  const shield=document.createElement('div');shield.id='ersi-update-saving';shield.setAttribute('role','status');shield.textContent=words[lang()].saving;shield.style.cssText='position:fixed;inset:0;z-index:2147483641;display:grid;place-items:center;background:#fffffff0;color:#123e34;font:700 18px system-ui';document.body.appendChild(shield);
  try{
   document.activeElement?.blur?.();await new Promise(resolve=>requestAnimationFrame(resolve));
   const saved=window.ersiUpdateBridgeReady?await call('save'):{ok:!blocked()};
   if(!saved.ok){note=words[lang()].blocked;return;}
   try{sessionStorage.setItem('ersi-update-attempt',pending);}catch{}
   reloading=true;const url=new URL(location.href);url.searchParams.set('_ersi_release',pending);location.replace(url.toString());
  }finally{shield.remove();applying=false;if(!reloading)show();}
 }
 async function check(announceCurrent=false){
  if(checking||reloading)return;checking=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('/release.json?check='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)return;
   const release=await response.json();if(!/^[a-f0-9]{40}$/.test(release.version||''))return;
   if(release.version===current){pending=null;show();if(announceCurrent)await call('release-current');return;}
   const html=await fetch('/index.html?check='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});if(!html.ok)return;
   const parsed=new DOMParser().parseFromString(await html.text(),'text/html');
   if(parsed.querySelector('meta[name="ersi-release"]')?.content!==release.version)return;
   const changed=pending!==release.version;pending=release.version;show();
   if(changed&&channel)channel.postMessage('check');
  }catch{/* Keep the working page when offline or publication is incomplete. */}
  finally{clearTimeout(timeout);checking=false;}
 }
 const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 const pushSupported=()=>{try{return !!navigator.serviceWorker&&'PushManager' in window&&'Notification' in window&&(!ios()||standalone());}catch{return false;}};
 function renderPush(){
  const visible=window.ersiWebPushAvailable===true&&!pending&&!pushDismissed&&!appBusy&&!modal()&&(!pushConfig?.subscribed);
  if(!visible){if(pushPanel)pushPanel.hidden=true;return;}
  if(!pushSupported()&&!ios())return;
  if(!pushPanel){
   pushPanel=document.createElement('aside');pushPanel.id='ersi-release-push';pushPanel.setAttribute('role','status');
   pushPanel.style.cssText='position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;right:12px;z-index:2147483639;max-width:430px;box-sizing:border-box;margin:auto;padding:14px;border:1px solid #bfd8cb;border-radius:14px;background:white;color:#123e34;box-shadow:0 8px 28px #0003;font:14px/1.4 system-ui';
   const text=document.createElement('p'),enable=document.createElement('button'),later=document.createElement('button');text.style.margin='0 0 8px';
   enable.type=later.type='button';enable.style.cssText='min-height:44px;padding:8px 12px;border:0;border-radius:8px;background:#007a4d;color:white;font:inherit';later.style.cssText='min-height:44px;padding:8px 12px;border:0;background:white;color:#123e34;font:inherit';
   enable.onclick=enablePush;later.onclick=()=>{pushDismissed=true;renderPush();};pushPanel.append(text,enable,later);document.body.appendChild(pushPanel);
  }
  const help=ios()&&!standalone(),unavailable=!help&&!pushSupported();
  pushPanel.querySelector('p').textContent=pushNote|| (help?words[lang()].ios:unavailable?words[lang()].unsupported:('Notification' in window&&Notification.permission==='denied'?words[lang()].denied:words[lang()].push));
  const buttons=pushPanel.querySelectorAll('button');buttons[0].textContent=help?words[lang()].install:words[lang()].enable;
  buttons[0].disabled=pushBusy||(!help&&(unavailable||!pushConfig?.publicKey||Notification.permission==='denied'));
  buttons[1].textContent=words[lang()].later;pushPanel.hidden=false;
 }
 function keyBytes(value){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
 async function syncPush(){
  if(pushChecking||window.ersiWebPushAvailable!==true||!pushSupported())return;
  pushChecking=true;
  try{
   const config=await call('push-status');if(!config.ok)return;
   pushConfig=config;
   if(Notification.permission==='granted'){
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
    if(subscription){
     const saved=await call('push-subscribe',{subscription:subscription.toJSON(),language:lang()});
     pushConfig.subscribed=saved.ok===true;
    }
   }
  }catch{}finally{pushChecking=false;renderPush();}
 }
 async function enablePush(){
  if(ios()&&!standalone()){window.dispatchEvent(new Event('ersi-install-open'));return;}
  if(!pushSupported()||!pushConfig?.publicKey||pushBusy)return;
  // Permission is requested only from the user's button gesture.
  const permission=Notification.requestPermission();pushNote='';pushBusy=true;renderPush();
  try{
   if(await permission!=='granted')return;
   const registration=await navigator.serviceWorker.ready;
   const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(pushConfig.publicKey)});
   const saved=await call('push-subscribe',{subscription:subscription.toJSON(),language:lang()});
   if(!saved.ok)throw Error('subscribe failed');
   pushConfig.subscribed=true;
  }catch{pushNote=words[lang()].failed;}
  finally{pushBusy=false;renderPush();}
 }
 let channel=null;try{channel=new BroadcastChannel('ersi-web-updates');channel.onmessage=()=>check();}catch{}
 window.addEventListener('ersi-update-state',event=>{try{const state=typeof event.detail==='string'?JSON.parse(event.detail):event.detail;appBusy=state?.busy!==false;}catch{appBusy=true;}show();renderPush();});
 window.addEventListener('ersi-update-saved',()=>{dirty=false;});
 window.addEventListener('ersi-push-state',()=>{if(!window.ersiWebPushAvailable){pushConfig=null;if(pushPanel)pushPanel.hidden=true;}else syncPush();renderPush();});
 document.addEventListener('input',()=>{dirty=true;},true);
 document.addEventListener('change',event=>{if(event.target?.matches('input,textarea,select'))dirty=true;},true);
 document.addEventListener('close',()=>{show();renderPush();},true);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 window.addEventListener('online',()=>{check();syncPush();});window.addEventListener('pageshow',()=>check());window.addEventListener('ersi-update-check',event=>check(event.detail==='announce'));
 try{navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='ersi-release-available')check(true);});}catch{}
 function ready(){check();syncPush();renderPush();setInterval(()=>{check();show();renderPush();},15000);setInterval(syncPush,60000);}
 if(window.ersiFlutterReady)ready();else window.addEventListener('flutter-first-frame',ready,{once:true});
})();
