const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  for(const fixture of [{role:'inspector',enrolled:false},{role:'inspector',enrolled:true},{role:'quality_control'},{role:'admin'}]){
   const context=await browser.newContext({viewport:fixture.role==='inspector'&&!fixture.enrolled?{width:360,height:640}:{width:430,height:920},permissions:['camera']});
   await context.addInitScript(()=>{for(const [key,value] of Object.entries({accessToken:'identity-test',refreshToken:'identity-test',lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+key,JSON.stringify(value));localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));});
   await context.addInitScript(()=>{
    window.__identityStreams=[];window.__identityAudio=[];window.__identityRecorderStarts=[];
    const startRecording=MediaRecorder.prototype.start;MediaRecorder.prototype.start=function(...args){window.__identityRecorderStarts.push(Date.now());return startRecording.apply(this,args);};
    const media=navigator.mediaDevices;
    if(media){const capture=media.getUserMedia.bind(media);media.getUserMedia=async constraints=>{const stream=await capture(constraints);window.__identityStreams.push(stream);return stream;};}
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){if(this.tagName==='AUDIO')this.addEventListener('playing',()=>window.__identityAudio.push({src:this.src,at:performance.now()}),{once:true});return play.call(this);};
   });
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
     const open=page.getByRole('button',{name:'ОТКРЫТЬ КАМЕРУ',exact:true});
     const openBox=await open.boundingBox();assert(openBox&&openBox.y+openBox.height<=page.viewportSize().height,'camera button must be visible without scrolling');
     await open.click();
     const record=page.getByRole('button',{name:'НАЧАТЬ ЗАПИСЬ',exact:true});await record.waitFor({timeout:30000});
     const recordBox=await record.boundingBox();assert(recordBox&&recordBox.y+recordBox.height<=page.viewportSize().height,'record controls must be next to camera in viewport');
     await page.waitForFunction(()=>window.__identityRecorderStarts.length===1,{},{timeout:15000});
     const start=await page.evaluate(()=>window.__identityRecorderStarts[0]);
     await page.waitForFunction(()=>!document.body.innerText.includes('ВИДЕОПРОВЕРКА ИНСПЕКТОРА'),{},{timeout:60000});
     assert.equal(uploads,1);assert.equal(await page.evaluate(()=>window.__identityRecorderStarts.length),1);assert(Date.now()-start>=(fixture.enrolled?19000:13000));
     const live=await page.evaluate(()=>window.__identityStreams.some(stream=>stream.getTracks().some(t=>t.readyState==='live')));
     assert.equal(live,false,'camera must be released after completion');
     const audio=await page.evaluate(()=>window.__identityAudio);assert(audio.some(v=>v.src.startsWith('data:audio/wav;base64,')),'prerecorded prompts must play from prefetched memory');
     console.log('PASS automatic browser capture + visible controls + mocked verification:',fixture.enrolled?'new login 20s':'enrollment 14s');
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
