const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  for(const fixture of [{role:'inspector',enrolled:false},{role:'inspector',enrolled:true},{role:'quality_control'},{role:'admin'}]){
   const context=await browser.newContext({viewport:{width:430,height:920},permissions:['camera']});
   await context.addInitScript(()=>{for(const [key,value] of Object.entries({accessToken:'identity-test',refreshToken:'identity-test',lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+key,JSON.stringify(value));localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));});
   let verified=false,uploads=0,challenge;
   const errors=[];
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/api/v1/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let json={items:[]};
    if(path.endsWith('/auth/refresh'))json={accessToken:'identity-test',refreshToken:'identity-test',sessionExpiresAt:new Date(Date.now()+3600000).toISOString(),user:{sub:'inspector-fixture',phone:'+77000000000',roles:['inspection_org']}};
    else if(path.endsWith('/auth/identity/status'))json={required:fixture.role==='inspector',verified:fixture.role!=='inspector'||verified,enrolled:!!fixture.enrolled,engineReady:true};
    else if(path.endsWith('/auth/identity/challenge')){challenge={challengeId:'11111111-1111-4111-8111-111111111111',challengeToken:'synthetic-camera-only',actions:fixture.enrolled?['OPEN_MOUTH','BLINK','TURN_LEFT']:['OPEN_MOUTH','BLINK'],expiresAt:new Date(Date.now()+300000).toISOString()};json=challenge;}
    else if(path.endsWith('/video')){const body=request.postDataBuffer();assert(body&&body.length>10000,'actual MediaRecorder bytes must be uploaded');assert(body.includes(Buffer.from('synthetic-camera-only')),'challenge secret must bind upload');uploads++;verified=true;json={status:'VERIFIED'};}
    else if(path.endsWith('/organizations'))json={items:[{id:'test-org',bin:'123456789012',type:'inspection_org',name:'Учебный орган',status:'active',members:[{id:'member',userId:'inspector-fixture',role:fixture.role,user:{id:'inspector-fixture',fullName:'Учебный сотрудник'}}]}]};
    return route.fulfill({json});
   });
   try {
    await page.goto('http://127.0.0.1:8787/');
    await page.locator('#startup').waitFor({state:'detached',timeout:60000});
    const semantics=page.locator('flt-semantics-placeholder');if(await semantics.count())await semantics.evaluate(e=>e.click());
    if(fixture.role==='inspector'){
     const consent=page.getByRole('checkbox');await consent.waitFor();
     await consent.check();
     await page.getByRole('button',{name:'ОТКРЫТЬ КАМЕРУ',exact:true}).click();
     const record=page.getByRole('button',{name:'НАЧАТЬ ЗАПИСЬ',exact:true});await record.waitFor({timeout:30000});
     await record.click();
     await page.waitForFunction(()=>document.querySelectorAll('video').length>0);
     const start=Date.now();
     await page.waitForFunction(()=>!document.body.innerText.includes('ВИДЕОПРОВЕРКА ИНСПЕКТОРА'),{},{timeout:60000});
     assert.equal(uploads,1);assert(Date.now()-start>=(fixture.enrolled?19000:13000));
     const live=await page.evaluate(()=>[...document.querySelectorAll('video')].some(v=>v.srcObject?.getTracks().some(t=>t.readyState==='live')));
     assert.equal(live,false,'camera must be released after completion');
     console.log('PASS real browser capture + mocked verification:',fixture.enrolled?'new login 20s':'enrollment 14s');
    }else{
     await page.getByText('МОИ ИНСПЕКЦИИ',{exact:true}).first().waitFor();
     assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(uploads,0);
     console.log('PASS video identity exempt:',fixture.role);
    }
    assert(!errors.some(v=>/SyntaxError|ReferenceError|TypeError/.test(v)),errors.join('\n'));
   }catch(error){console.error('UI:',(await page.locator('body').innerText()).slice(0,2200));console.error('Browser errors:',errors);throw error;}
   finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
