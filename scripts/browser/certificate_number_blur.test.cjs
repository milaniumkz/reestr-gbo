const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8797';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const requests=[];let created=0,locations=0,latestFields=null,holdFree=false;const held=[];
 const context=await browser.newContext({viewport:{width:430,height:1000}});
 await context.addInitScript(()=>{
  for(const [key,value]of Object.entries({accessToken:'synthetic',refreshToken:'synthetic',lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+key,JSON.stringify(value));
  localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));
 });
 await context.route('**/api/v1/**',async route=>{
  const r=route.request(),u=new URL(r.url()),p=u.pathname.replace('/api/v1','');let data={items:[]};
  if(p==='/auth/refresh')data={accessToken:'synthetic',refreshToken:'synthetic',user:{sub:'inspector',phone:'+77000000000',roles:['inspection_org']}};
  if(p==='/auth/identity/status')data={required:true,verified:true};
  if(p==='/organizations')data={items:[{id:'org',bin:'123456789012',type:'inspection_org',name:'Synthetic IO',status:'active',members:[{id:'m',userId:'inspector',role:'inspector',user:{id:'inspector'}}]}]};
  const number=p.match(/^\/inspections\/certificate-number\/([^/]+)\/availability$/);
  if(number){const value=decodeURIComponent(number[1]);requests.push({value,organizationId:u.searchParams.get('organizationId')});if(value==='10967'&&holdFree)await new Promise(resolve=>held.push(resolve));data={available:value==='10967'};}
  if(p.startsWith('/inspection-drafts/')&&r.method()==='PUT'){const b=r.postDataJSON();latestFields=b.fields;data={id:p.split('/').pop(),organizationId:b.organizationId,version:b.version+1,fields:b.fields,files:{},updatedAt:new Date().toISOString()};}
  if(p==='/inspections'&&r.method()==='POST')created++;
  if(p.includes('/location/resolve'))locations++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 try{
  const page=await context.newPage();page.on('pageerror',e=>console.error('PAGEERROR',e.message));await page.goto(origin);
  await page.locator('flt-semantics-placeholder').waitFor({state:'attached',timeout:60000});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
  await page.getByRole('button',{name:'НОВАЯ ИНСПЕКЦИЯ',exact:true}).click();
  const number=page.getByRole('textbox',{name:'НОМЕР СВИДЕТЕЛЬСТВА',exact:true}),owner=page.getByRole('textbox',{name:'ФИО / НАИМЕНОВАНИЕ',exact:true});
  await number.fill('10966');await page.waitForTimeout(300);assert.equal(requests.length,0);
  await owner.click();await page.keyboard.type('PARTIAL OWNER');
  await page.locator('flt-semantics').getByText('Свидетельство с таким номером уже есть в этом инспекционном органе',{exact:true}).first().waitFor();
  assert.deepEqual(requests,[{value:'10966',organizationId:'org'}]);
  for(let n=0;n<150&&latestFields?.ownerName!=='PARTIAL OWNER';n++)await page.waitForTimeout(100);
  assert.equal(latestFields?.ownerName,'PARTIAL OWNER');assert.equal(latestFields?.inspectionCertificateNumber,'10966');
  assert.equal(created,0);assert.equal(locations,0);console.log('PASS real owner page checks on blur before Continue, preserves input and avoids geolocation/submission');
  await page.getByRole('textbox').nth(0).fill('10967');await page.getByRole('textbox').nth(1).click();await page.locator('flt-semantics').getByText('Номер свидетельства доступен',{exact:true}).first().waitFor();
  assert.equal(requests.at(-1).value,'10967');assert.equal(await page.getByRole('textbox').nth(1).inputValue(),'PARTIAL OWNER');assert.equal(created,0);
  console.log('PASS changing to a free number clears the conflict without resetting the form');
  holdFree=true;const before=requests.length;
  await page.getByRole('button',{name:'ПРОДОЛЖИТЬ',exact:true}).click();
  for(let n=0;n<100&&requests.length===before;n++)await page.waitForTimeout(50);
  assert.equal(requests.length,before+1);
  await page.getByRole('textbox').nth(0).fill('10966');await page.getByRole('textbox').nth(1).click();
  await page.locator('flt-semantics').getByText('Свидетельство с таким номером уже есть в этом инспекционном органе',{exact:true}).first().waitFor();
  holdFree=false;for(const resolve of held)resolve();await page.waitForTimeout(500);
  assert.equal(locations,0);assert.equal(created,0);assert.equal(await page.getByRole('textbox').nth(1).inputValue(),'PARTIAL OWNER');
  console.log('PASS late Continue response for the previous number cannot advance the changed form or ask for location');

 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
