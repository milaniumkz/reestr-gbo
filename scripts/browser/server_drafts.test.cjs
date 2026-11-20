// Synthetic API state shared across isolated browser contexts (devices).
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const origin=process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8797';
const org='22222222-2222-4222-8222-222222222222',first='11111111-1111-4111-8111-111111111111';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const rows=new Map(),blobs=new Map();let submissions=0;
async function device(owner){const c=await browser.newContext();await c.addInitScript(owner=>{for(const[k,v]of Object.entries({accessToken:'a-'+owner,refreshToken:'r-'+owner,lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+k,JSON.stringify(v));localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));},owner);
 await c.route('**/api/v1/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname.replace('/api/v1',''),method=r.method();let value={items:[]},status=200;
 if(path==='/auth/refresh')value={accessToken:'a-'+owner,refreshToken:'r-'+owner,user:{sub:owner,phone:'+77000000000',roles:['inspection_org']}};
 if(path==='/auth/identity/status')value={required:true,verified:true};
 if(path==='/organizations')value={items:[{id:org,bin:'123456789012',type:'inspection_org',name:'Test IO',status:'active',members:[{id:'m',userId:owner,role:'inspector',user:{id:owner}}]}]};
 if(path==='/inspection-drafts')value={items:[...rows.values()].filter(x=>x.userId===owner).map(x=>({...x}))};
 const m=path.match(/^\/inspection-drafts\/([^/]+)(?:\/files\/([^/]+))?$/);
 if(m){const id=m[1],type=m[2],old=rows.get(id);
  if(method==='PUT'){const body=r.postDataJSON();if((old&&old.userId!==owner)||(old?.version||0)!==body.version){status=409;value={message:'Changed on another device'};}else{value={id,userId:owner,organizationId:org,version:(old?.version||0)+1,fields:body.fields,files:old?.files||{},updatedAt:new Date().toISOString()};rows.set(id,value);}}
  else if(!old||old.userId!==owner){status=404;value={message:'Not found'};}
  else if(type&&method==='GET'){return route.fulfill({status:200,contentType:'application/octet-stream',body:blobs.get(id+'/'+type)});}
  else if(type&&method==='POST'){
   const raw=r.postDataBuffer(),boundary=r.headers()['content-type'].match(/boundary=(.*)/)[1];
   const start=raw.indexOf(Buffer.from('filename=')),bodyStart=raw.indexOf(Buffer.from('\r\n\r\n'),start)+4,end=raw.lastIndexOf(Buffer.from('\r\n--'+boundary));const bytes=raw.subarray(bodyStart,end);
   const version=Number(raw.toString('latin1').match(/name="version"\r\n\r\n(\d+)/)[1]);if(version!==old.version){status=409;value={message:'Changed'};}else{blobs.set(id+'/'+type,Buffer.from(bytes));value={...old,version:old.version+1,files:{...old.files,[type]:{name:'original.jpg',checksum:createHash('sha256').update(bytes).digest('hex')}},updatedAt:new Date().toISOString()};rows.set(id,value);}
  }else value=old;
 }
 if(method==='POST'&&path.startsWith('/inspections')&&!path.includes('photo-moderation'))submissions++;
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 });return c;}
async function ready(page){await page.locator('flt-semantics-placeholder').waitFor({state:'attached',timeout:60000});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());await page.waitForTimeout(700);}
async function until(fn){for(let n=0;n<150;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for draft synchronization');}
try{
 const a=await device('inspector-a'),p=await a.newPage();p.on('pageerror',e=>console.error('PAGEERROR',e.message));await p.goto(origin+'/not-found.html');
 const original=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='#eeeece';x.fillRect(0,0,1200,800);x.fillStyle='#303030';for(let y=30;y<750;y+=35)x.fillRect(30,y,900,5);return c.toDataURL('image/jpeg',.95).split(',')[1]}),'base64');
 await p.addScriptTag({path:'web/inspection-recovery.js'});
 await p.evaluate(async arg=>window.ersiInspectionRecovery.save('inspector-a',JSON.stringify({localDraftId:arg.id,screen:20,organizationId:arg.org,ownerName:'FIRST DRAFT',inspectionCertificateNumber:'777',techPassportPhotoName:'original.jpg'}),[{type:'primary_tech',bytes:new Uint8Array(arg.bytes),version:1}]),{id:first,org,bytes:Array.from(original)});
 await p.goto(origin+'/');await ready(p);
 await until(()=>rows.get(first)?.files.primary_tech!=null);assert.deepEqual(blobs.get(first+'/primary_tech'),original);console.log('PASS partial form and original photo synchronize to the private server draft');
 const saved=await p.evaluate(()=>new Promise(resolve=>{
  const id='release-save-test';const listener=e=>{const result=JSON.parse(e.detail);if(result.id===id){window.removeEventListener('ersi-update-response',listener);resolve(result)}};
  window.addEventListener('ersi-update-response',listener);
  window.dispatchEvent(new CustomEvent('ersi-update-request',{detail:JSON.stringify({id,action:'save',payload:{}})}));
 }));
 assert.equal(saved.ok,true);assert.deepEqual(blobs.get(first+'/primary_tech'),original);assert.equal(submissions,0);
 console.log('PASS release update handshake waits for the private draft and original bytes to be saved');
 await p.getByText('ПРОФИЛЬ',{exact:true}).last().click();await p.getByText('ГЛАВНАЯ',{exact:true}).last().click();await p.getByText('ЧЕРНОВИКИ',{exact:true}).waitFor();
 await p.getByRole('button',{name:'НОВАЯ ИНСПЕКЦИЯ',exact:true}).click();
 await p.getByRole('textbox',{name:'ФИО / НАИМЕНОВАНИЕ',exact:true}).click();await p.keyboard.type('SECOND DRAFT');await p.keyboard.press('Tab');
 await until(()=>[...rows.values()].some(x=>x.fields.ownerName==='SECOND DRAFT'));assert.equal(rows.get(first).fields.screen,20);assert.deepEqual(blobs.get(first+'/primary_tech'),original);console.log('PASS profile/home navigation and a new inspection preserve the previous draft and exact step');
 const second=await device('inspector-a'),q=await second.newPage();await q.goto(origin+'/');await ready(q);await q.getByText('FIRST DRAFT',{exact:false}).first().click();
 await until(async()=>{const r=await q.evaluate(async()=>await window.ersiInspectionRecovery.read('inspector-a', '11111111-1111-4111-8111-111111111111'));return r&&JSON.parse(r.fields).screen===20&&r.files.some(f=>f.type==='primary_tech')});
 const restored=await q.evaluate(async()=>Array.from((await window.ersiInspectionRecovery.read('inspector-a','11111111-1111-4111-8111-111111111111')).files.find(f=>f.type==='primary_tech').bytes));assert.deepEqual(Buffer.from(restored),original);console.log('PASS separate device restores the selected server draft, original image and saved photo step');
 const other=await device('inspector-b'),z=await other.newPage();await z.goto(origin+'/');await ready(z);await z.getByText('МОИ ИНСПЕКЦИИ',{exact:true}).first().waitFor();assert.equal(await z.getByText('FIRST DRAFT',{exact:false}).count(),0);assert.equal(await z.getByText('SECOND DRAFT',{exact:false}).count(),0);assert.equal(submissions,0);console.log('PASS another inspector cannot see drafts; saving never creates/submits a business inspection');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
