/* Reload only a fully published release and never discard an active form. */
(() => {
  'use strict';
  const current = document.querySelector('meta[name="ersi-release"]')?.content;
  if (!/^[a-f0-9]{40}$/.test(current || '')) return;
  let pending = null, checking = false, reloading = false, dirty = false;
  let appBusy = window.ersiUpdateBusy === true, lastInput = Date.now(), banner = null, idleTimer = null;
  const lang = () => {try{return JSON.parse(localStorage.getItem('flutter.app_language'))==='kk'?'kk':'ru';}catch{return 'ru';}};
  const words = {
    ru:{text:'Доступна новая версия. Она применится автоматически после завершения работы.',button:'Обновить сейчас',confirm:'На странице могут быть несохранённые данные. Обновить и закрыть текущую форму?'},
    kk:{text:'Жаңа нұсқа қолжетімді. Жұмыс аяқталғаннан кейін автоматты түрде жаңартылады.',button:'Қазір жаңарту',confirm:'Бетте сақталмаған деректер болуы мүмкін. Жаңартып, ағымдағы нысанды жабу керек пе?'},
  };
  function show() {
    if (!banner) {
      banner=document.createElement('aside');banner.id='ersi-update';banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;top:12px;left:12px;right:12px;max-width:430px;margin:auto;z-index:2147483640;background:#fff;color:#123e34;padding:14px;border:1px solid #bfd8cb;border-radius:14px;box-shadow:0 8px 28px #0003;font:14px/1.4 system-ui';
      const text=document.createElement('span'), button=document.createElement('button');
      button.type='button';button.style.cssText='margin-top:8px;padding:10px 14px;border:0;border-radius:9px;background:#007a4d;color:white;font:inherit';
      button.addEventListener('click',()=>apply(true));banner.append(text,document.createElement('br'),button);document.body.appendChild(banner);
    }
    banner.querySelector('span').textContent=words[lang()].text;
    banner.querySelector('button').textContent=words[lang()].button;
    banner.hidden=false;
  }
  const blocked = () => appBusy || dirty || document.querySelector('dialog[open],[role="dialog"]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  function apply(force=false) {
    if (!pending || reloading || navigator.onLine===false) return;
    if (!force && (document.visibilityState!=='visible' || blocked() || Date.now()-lastInput<3000)) return;
    if (force && blocked() && !window.confirm(words[lang()].confirm)) return;
    try {if (!force && sessionStorage.getItem('ersi-update-attempt')===pending) return;sessionStorage.setItem('ersi-update-attempt',pending);}catch{}
    reloading=true;
    const url=new URL(location.href);url.searchParams.set('_ersi_release',pending);
    location.replace(url.toString());
  }
  async function check() {
    if (checking || reloading || navigator.onLine===false) return;
    checking=true;
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),7000);
    try {
      const response=await fetch('/release.json?check='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});
      if (!response.ok) return;
      const release=await response.json();
      if (!/^[a-f0-9]{40}$/.test(release.version || '')) return;
      if (release.version===current) {pending=null;if(banner)banner.hidden=true;return;}
      // A half-published release or rollback must not cause a reload loop.
      const html=await fetch('/index.html?check='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});
      if (!html.ok) return;
      const parsed=new DOMParser().parseFromString(await html.text(),'text/html');
      if(parsed.querySelector('meta[name="ersi-release"]')?.content!==release.version) return;
      const changed=pending!==release.version;pending=release.version;show();
      if(changed && channel) channel.postMessage('check');
      if(!idleTimer) idleTimer=setInterval(apply,1000);
      apply();
    } catch { /* Keep the working page when offline or deployment is incomplete. */ }
    finally {clearTimeout(timeout);checking=false;}
  }
  let channel=null;
  try {channel=new BroadcastChannel('ersi-web-updates');channel.onmessage=()=>check();}catch{}
  window.addEventListener('ersi-update-state',event=>{
    try {const state=typeof event.detail==='string'?JSON.parse(event.detail):event.detail;appBusy=state?.busy!==false;}catch{appBusy=true;}
    apply();
  });
  window.addEventListener('ersi-update-saved',()=>{dirty=false;lastInput=Date.now();});
  document.addEventListener('input',()=>{dirty=true;lastInput=Date.now();},true);
  document.addEventListener('change',event=>{if(event.target?.matches('input,textarea,select'))dirty=true;lastInput=Date.now();},true);
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{lastInput=Date.now();},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  window.addEventListener('online',check);window.addEventListener('pageshow',check);
  window.addEventListener('ersi-update-check',check);
  function ready(){check();setInterval(check,30000);}
  if(window.ersiFlutterReady)ready();else window.addEventListener('flutter-first-frame',ready,{once:true});
})();
