// Serve a release web build; SYNTHETIC API responses only. INSPECTION_TEST_ORIGIN defaults to localhost:8795.
const origin=process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8795';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
const context=await browser.newContext();let refresh='r0',n=0,bad=0;
const jwt=()=>['e30',Buffer.from(JSON.stringify({sub:'inspector',sid:'same-session',pv:1,exp:Math.floor(Date.now()/1000)+900,n})).toString('base64url'),'mock'].join('.');
await context.route('**/api/v1/**',async route=>{const path=new URL(route.request().url()).pathname.replace('/api/v1','');let out={items:[]},status=200;
if(path==='/auth/refresh'){await new Promise(r=>setTimeout(r,100));if(JSON.parse(route.request().postData()).refreshToken!==refresh){bad++;status=401;out={message:'stale refresh'};}else{refresh='r'+(++n);out={accessToken:jwt(),refreshToken:refresh,user:{sub:'inspector',phone:'+77000000000',roles:['inspection_org']}};}}
if(path==='/auth/identity/status')out={required:true,verified:true};
if(path==='/organizations')out={items:[{id:'org',bin:'123456789012',type:'inspection_org',name:'Test IO',status:'active',members:[{id:'m',userId:'inspector',role:'inspector',user:{id:'inspector'}}]}]};
await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});
});
const page=await context.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto(origin+'/not-found.html');
await page.evaluate(async token=>{localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));localStorage.setItem('flutter.lastRoleCode',JSON.stringify('inspection_org'));localStorage.setItem('flutter.lastOrganizationBin',JSON.stringify('123456789012'));localStorage.setItem('flutter.diagnosticLocationAsked','true');localStorage.setItem('flutter.accessToken',JSON.stringify(token));localStorage.setItem('flutter.refreshToken',JSON.stringify('r0'));
const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('ersi-inspection-recovery',1);req.onupgradeneeded=()=>{req.result.createObjectStore('state');req.result.createObjectStore('files')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
await new Promise((resolve,reject)=>{const tx=db.transaction(['state','files'],'readwrite');tx.objectStore('state').put({version:1,owner:'inspector',savedAt:new Date().toISOString(),fields:JSON.stringify({screen:15,organizationId:'org',ownerName:'RECOVERY OWNER',ownerKind:'Физическое лицо',inspectionCertificateNumber:'777'}),fileTypes:['primary_cylinder']},'inspector');tx.objectStore('files').put(new Uint8Array([1,2,3,4]),'inspector/primary_cylinder');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();},jwt());
const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await page.goto(origin+'/');
async function enable(p){await p.locator('flt-semantics-placeholder').waitFor({state:'attached',timeout:60000});await p.locator('flt-semantics-placeholder').evaluate(el=>el.click());}
await enable(page);
async function owner(p,value){await p.getByRole('textbox',{name:'ФИО / НАИМЕНОВАНИЕ',exact:true}).click({force:true});for(let i=0;i<100;i++){if(await p.locator('input,textarea').evaluateAll((es,v)=>es.some(e=>e.value===v),value))return;await p.waitForTimeout(100);}throw Error('Missing restored owner '+value);}
await owner(page,'RECOVERY OWNER');console.log('PASS actual Flutter restores inspection, CPU throttled 4x');
await page.keyboard.press('Control+A');await page.keyboard.type('EDITED OWNER');
async function saved(p,name){await p.waitForFunction(async name=>{const db=await new Promise(r=>{const q=indexedDB.open('ersi-inspection-recovery',1);q.onsuccess=()=>r(q.result)});const value=await new Promise(r=>{const q=db.transaction('state').objectStore('state').get('inspector');q.onsuccess=()=>r(q.result)});db.close();return JSON.parse(value.fields).ownerName===name},name,{timeout:30000});}
await saved(page,'EDITED OWNER');await page.keyboard.press('Tab');await page.waitForTimeout(2000);assert.equal(await page.evaluate(()=>window.ersiUpdateBusy),true);
await page.reload();await enable(page);await owner(page,'EDITED OWNER');console.log('PASS reload keeps edited fields and same inspection step');
const bytes=await page.evaluate(async()=>{const r=await window.ersiInspectionRecovery.read('inspector');return Array.from(r.files[0].bytes)});assert.deepEqual(bytes,[1,2,3,4]);console.log('PASS original stored photo bytes preserved');
const second=await context.newPage();await Promise.all([page.reload(),second.goto(origin+'/')]);await Promise.all([enable(page),enable(second)]);await Promise.all([owner(page,'EDITED OWNER'),owner(second,'EDITED OWNER')]);assert.equal(bad,0);console.log('PASS simultaneous tabs serialize refresh rotation; no stale-token rejection');
await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='state')throw new DOMException('Quota','QuotaExceededError');return window.originalPut.apply(this,args)}});
await owner(page,'EDITED OWNER');await page.keyboard.press('Control+A');await page.keyboard.type('QUOTA OWNER');await new Promise(r=>setTimeout(r,1500));await owner(page,'QUOTA OWNER');console.log('PASS storage quota failure does not reset or close form');
console.log('ALL BROWSER CHECKS PASSED');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
