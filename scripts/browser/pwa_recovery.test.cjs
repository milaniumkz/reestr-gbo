const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
(async()=>{
 let version='a'.repeat(40),updated=false;
 const legacy="self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(new Response('Нет подключения к интернету. Подключитесь и откройте приложение снова.',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}));});";
 const current=fs.readFileSync('web/ersi-pwa-sw.js','utf8'),updater=fs.readFileSync('web/auto-update.js','utf8');
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/ersi-pwa-sw.js')){res.setHeader('Content-Type','application/javascript');return res.end(updated?current:legacy);}
  if(req.url.startsWith('/auto-update.js')){res.setHeader('Content-Type','application/javascript');return res.end(updater);}
  if(req.url.startsWith('/release.json')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version}));}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<meta name="ersi-release" content="${version}"><body>APP ONLINE<script>window.ersiFlutterReady=true</script><script src="/auto-update.js"></script>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto(origin);
  await page.evaluate(async()=>{localStorage.setItem('flutter.accessToken','synthetic-preserved-session');localStorage.setItem('draft-marker','synthetic-preserved-draft');await navigator.serviceWorker.register('/ersi-pwa-sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.reload();assert.match(await page.locator('body').innerText(),/Нет подключения/);
  console.log('PASS reproduces the installed-app false offline page');
  updated=true;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await new Promise(async(resolve,reject)=>{navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});try{await reg.update();}catch(e){reject(e);}});});
  await page.reload();assert.match(await page.locator('body').innerText(),/APP ONLINE/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('flutter.accessToken')),'synthetic-preserved-session');
  assert.equal(await page.evaluate(()=>localStorage.getItem('draft-marker')),'synthetic-preserved-draft');
  console.log('PASS worker updates in place and restores launch without clearing account/draft data');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.ersiUpdateBusy=true;window.dispatchEvent(new CustomEvent('ersi-update-state',{detail:{busy:true}}));});
  version='b'.repeat(40);
  await page.evaluate(()=>window.dispatchEvent(new Event('ersi-update-check')));
  await page.locator('#ersi-update').waitFor();await page.waitForTimeout(3500);
  assert.equal(await page.locator('meta[name="ersi-release"]').getAttribute('content'),'a'.repeat(40));
  console.log('PASS automatic update waits for an active inspection despite a new release');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ersi-update-state',{detail:{busy:false}})));
  await page.waitForFunction(()=>document.querySelector('meta[name="ersi-release"]')?.content==='b'.repeat(40));
  assert.equal(await page.evaluate(()=>localStorage.getItem('flutter.accessToken')),'synthetic-preserved-session');
  console.log('PASS automatic release update resumes after work completes even with a false offline hint');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1)});
