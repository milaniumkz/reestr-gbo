const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const a='a'.repeat(40),b='b'.repeat(40);let version=a,index=a;
 const updater=fs.readFileSync('web/auto-update.js','utf8'),key=Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url');
 const setup=`window.ersiFlutterReady=true;window.ersiUpdateBridgeReady=true;window.ersiWebPushAvailable=location.search.includes('push');window.allowSave=false;window.counts={permission:0,subscribe:0};
 document.querySelector('textarea').value=localStorage.getItem('saved-draft')||'ORIGINAL';
 if(window.ersiWebPushAvailable){let permission='default',subscription=null;window.PushManager=class{};Object.defineProperty(window,'Notification',{value:class{static get permission(){return permission;}static async requestPermission(){window.counts.permission++;permission='granted';return permission;}}});
 Object.defineProperty(navigator,'serviceWorker',{value:{addEventListener(){},ready:Promise.resolve({pushManager:{async getSubscription(){return subscription;},async subscribe(options){window.counts.subscribe++;window.options={userVisibleOnly:options.userVisibleOnly,keyLength:options.applicationServerKey.length};subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'x'.repeat(87),auth:'a'.repeat(22)}})};return subscription;}}})}});}
 window.addEventListener('ersi-install-open',()=>window.installOpened=true);
 window.addEventListener('ersi-update-request',event=>{const request=JSON.parse(event.detail);let response={ok:true};
 if(request.action==='save'){response.ok=window.allowSave;if(response.ok)localStorage.setItem('saved-draft',document.querySelector('textarea').value);}
 if(request.action==='push-status')response={ok:true,publicKey:${JSON.stringify(key)},subscriptions:[]};
 if(request.action==='push-subscribe')window.savedSubscription=request.payload;
 window.dispatchEvent(new CustomEvent('ersi-update-response',{detail:JSON.stringify({id:request.id,...response})}));});`;
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/auto-update.js')){res.setHeader('Content-Type','application/javascript');return res.end(updater);}
  if(req.url.startsWith('/release.json')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version}));}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<meta name="ersi-release" content="${index}"><body><textarea aria-label="draft"></textarea><script>${setup}</script><script src="/auto-update.js"></script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),p=await context.newPage(),q=await context.newPage();await p.goto(origin);await q.goto(origin);
  version=b;await p.evaluate(()=>window.dispatchEvent(new Event('ersi-update-check')));await p.waitForTimeout(250);assert.equal(await p.locator('#ersi-update').count(),0);console.log('PASS incomplete publication is never announced');
  index=b;await p.evaluate(()=>window.dispatchEvent(new Event('ersi-update-check')));
  await p.locator('#ersi-update').waitFor();await q.locator('#ersi-update').waitFor();await p.waitForTimeout(3500);
  assert.equal(await p.locator('meta[name="ersi-release"]').getAttribute('content'),a);assert.equal(await q.locator('meta[name="ersi-release"]').getAttribute('content'),a);console.log('PASS every open tab keeps a visible update notice without silent reload');
  await p.bringToFront();await p.getByRole('textbox',{name:'draft'}).fill('LATEST UNSAVED DRAFT');
  await p.getByRole('button',{name:'Обновить страницу',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#ersi-update')?.textContent.includes('Не удалось безопасно'));
  assert.equal(await p.locator('meta[name="ersi-release"]').getAttribute('content'),a);assert.equal(await p.getByRole('textbox',{name:'draft'}).inputValue(),'LATEST UNSAVED DRAFT');
  assert.match(await p.locator('#ersi-update').innerText(),/Не удалось безопасно/);console.log('PASS failed save leaves the current page and form intact');
  await p.evaluate(()=>window.allowSave=true);await p.getByRole('button',{name:'Обновить страницу',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('meta[name="ersi-release"]').content==='b'.repeat(40));
  assert.equal(await p.getByRole('textbox',{name:'draft'}).inputValue(),'LATEST UNSAVED DRAFT');console.log('PASS explicit refresh waits for successful saving before loading the new version');await context.close();
  const enabled=await browser.newContext(),r=await enabled.newPage();await r.goto(origin+'/?push');
  await r.getByRole('button',{name:'Включить уведомления',exact:true}).waitFor();await r.waitForFunction(()=>!document.querySelector('#ersi-release-push button').disabled);
  assert.equal(await r.evaluate(()=>window.counts.permission),0);
  await r.getByRole('button',{name:'Включить уведомления',exact:true}).click();await r.locator('#ersi-release-push').waitFor({state:'hidden'});
  assert.deepEqual(await r.evaluate(()=>window.options),{userVisibleOnly:true,keyLength:65});assert.equal(await r.evaluate(()=>window.counts.permission),1);assert.equal(await r.evaluate(()=>window.savedSubscription.language),'ru');console.log('PASS push opt-in requests browser consent only after the user presses the button');await enabled.close();
  const ios=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}),s=await ios.newPage();await s.goto(origin+'/?push');
  await s.getByRole('button',{name:'Добавить на экран «Домой»',exact:true}).click();assert.equal(await s.evaluate(()=>window.installOpened),true);assert.equal(await s.evaluate(()=>window.counts.permission),0);console.log('PASS regular iPhone Safari explains Home Screen installation before push consent');await ios.close();
  const oldIos=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Version/15.0 Mobile/15E148 Safari/604.1'}),t=await oldIos.newPage();
  await t.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});});await t.goto(origin+'/?push');
  await t.evaluate(()=>{delete window.PushManager;delete window.Notification;window.dispatchEvent(new Event('ersi-push-state'));});
  await t.waitForFunction(()=>document.querySelector('#ersi-release-push')?.textContent.includes('16.4'));assert.equal(await t.locator('#ersi-release-push button').first().isDisabled(),true);console.log('PASS unsupported installed iPhone browser explains the limitation without breaking updates');await oldIos.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
