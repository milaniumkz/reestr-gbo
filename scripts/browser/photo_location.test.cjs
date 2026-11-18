// Serve a release web build; SYNTHETIC API responses only. INSPECTION_TEST_ORIGIN defaults to localhost:8795.
const origin=process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8795';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
const context=await browser.newContext();
await context.addInitScript(()=>{window.pendingGPS=[];navigator.geolocation.getCurrentPosition=(success,error)=>window.pendingGPS.push({success,error});});
let refresh='r0',n=0,bad=0;
const jwt=()=>['e30',Buffer.from(JSON.stringify({sub:'inspector',sid:'same-session',pv:1,exp:Math.floor(Date.now()/1000)+900,n})).toString('base64url'),'mock'].join('.');
await context.route('**/api/v1/**',async route=>{const path=new URL(route.request().url()).pathname.replace('/api/v1','');let out={items:[]},status=200;if(path==='/inspections/photo-moderation/check')out={moderationStatus:'manual_review',moderationReason:'Synthetic quality-review test'};
if(path==='/auth/refresh'){await new Promise(r=>setTimeout(r,100));if(JSON.parse(route.request().postData()).refreshToken!==refresh){bad++;status=401;out={message:'stale refresh'};}else{refresh='r'+(++n);out={accessToken:jwt(),refreshToken:refresh,user:{sub:'inspector',phone:'+77000000000',roles:['inspection_org']}};}}
if(path==='/auth/identity/status')out={required:true,verified:true};
if(path==='/organizations')out={items:[{id:'org',bin:'123456789012',type:'inspection_org',name:'Test IO',status:'active',members:[{id:'m',userId:'inspector',role:'inspector',user:{id:'inspector'}}]}]};
await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});
});
const page=await context.newPage();page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto(origin+'/not-found.html');
await page.evaluate(async token=>{localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));localStorage.setItem('flutter.lastRoleCode',JSON.stringify('inspection_org'));localStorage.setItem('flutter.lastOrganizationBin',JSON.stringify('123456789012'));localStorage.setItem('flutter.diagnosticLocationAsked','true');localStorage.setItem('flutter.accessToken',JSON.stringify(token));localStorage.setItem('flutter.refreshToken',JSON.stringify('r0'));
const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('ersi-inspection-recovery',1);req.onupgradeneeded=()=>{req.result.createObjectStore('state');req.result.createObjectStore('files')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
await new Promise((resolve,reject)=>{const tx=db.transaction(['state','files'],'readwrite');tx.objectStore('state').put({version:1,owner:'inspector',savedAt:new Date().toISOString(),fields:JSON.stringify({screen:20,organizationId:'org',ownerName:'RECOVERY OWNER',ownerKind:'Физическое лицо',inspectionCertificateNumber:'777'}),fileTypes:[]},'inspector');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();},jwt());
await page.goto(origin+'/');await page.locator('flt-semantics-placeholder').waitFor({state:'attached',timeout:60000});await page.locator('flt-semantics-placeholder').evaluate(el=>el.click());
const capture=page.getByRole('button',{name:'ЗАГРУЗИТЬ ФОТО ТЕХПАСПОРТА',exact:true});
const chooserEvent=page.waitForEvent('filechooser');await page.waitForTimeout(1000);await capture.click();const chooser=await chooserEvent;
const original=process.env.PHOTO_TEST_FILE?require('node:fs').readFileSync(process.env.PHOTO_TEST_FILE):Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='#eeeece';x.fillRect(0,0,1200,800);x.fillStyle='#303030';for(let y=40;y<750;y+=35)for(let a=40;a<1140;a+=60)x.fillRect(a,y,30,7);return c.toDataURL('image/jpeg',.95).split(',')[1]}),'base64');
const start=Date.now();await chooser.setFiles({name:'synthetic-original.jpg',mimeType:'image/jpeg',buffer:original});
async function recovered(){return page.evaluate(async()=>{const r=await window.ersiInspectionRecovery.read('inspector');return JSON.parse(r.fields)});}
async function waitStored(predicate){for(let n=0;n<80;n++){const r=await page.evaluate(async()=>{const s=await window.ersiInspectionRecovery.read('inspector');return {fields:JSON.parse(s.fields),types:s.files.map(f=>f.type)}});if(predicate(r))return r;await page.waitForTimeout(100);}throw Error('Recovery snapshot not complete');}
await waitStored(r=>r.fields.techPassportPhotoName==='synthetic-original.jpg'&&r.types.includes('primary_tech'));
assert.equal(await page.evaluate(()=>window.pendingGPS.length),1);
assert.equal((await recovered()).techPassportPhotoPosition,null);
console.log('PASS accepted photo is saved before slow GPS completes; '+(Date.now()-start)+' ms');
const stored=await page.evaluate(async()=>Array.from((await window.ersiInspectionRecovery.read('inspector')).files.find(f=>f.type==='primary_tech').bytes));
assert.deepEqual(Buffer.from(stored),original);console.log('PASS original bytes unchanged');
await page.evaluate(()=>window.pendingGPS[0].success({coords:{latitude:43.2,longitude:76.9,accuracy:5,altitude:0,altitudeAccuracy:0,heading:0,speed:0},timestamp:Date.now()}));
await waitStored(r=>r.fields.techPassportPhotoPosition?.latitude===43.2);
console.log('PASS fresh photo coordinates attach in background and persist');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
