const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const url=process.env.APP_URL||'http://127.0.0.1:8791/';const origin=new URL(url).origin;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{for(const [key,value] of Object.entries({accessToken:'synthetic',refreshToken:'synthetic',lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+key,JSON.stringify(value));localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));});
  const calls=[],forbidden=[];
  await context.route('**/api/v1/**',route=>{
   const request=route.request(),u=new URL(request.url());calls.push(u.pathname);
   if(u.origin!==origin){forbidden.push(u.origin);return route.abort();}
   let json={items:[]};
   if(u.pathname.endsWith('/auth/refresh'))json={accessToken:'synthetic',refreshToken:'synthetic',user:{sub:'synthetic-user',phone:'+77000000000',roles:['inspection_org']}};
   if(u.pathname.endsWith('/auth/identity/status'))json={required:false,verified:true,enrolled:false};
   if(u.pathname.endsWith('/organizations'))json={items:[{id:'synthetic-org',bin:'123456789012',type:'inspection_org',name:'Учебная организация',status:'active',members:[{id:'synthetic-member',userId:'synthetic-user',role:'quality_control',user:{id:'synthetic-user'}}]}]};
   return route.fulfill({json});
  });
  const page=await context.newPage();await page.goto(url);await page.locator('#startup').waitFor({state:'detached',timeout:60000});
  const semantics=page.locator('flt-semantics-placeholder');if(await semantics.count())await semantics.evaluate(e=>e.click());
  await page.getByText('МОИ ИНСПЕКЦИИ',{exact:true}).first().waitFor({timeout:30000});
  assert(calls.length>=4);assert.deepEqual(forbidden,[]);
  console.log('PASS app restores authorization and loads the workspace using only the opened site origin');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
