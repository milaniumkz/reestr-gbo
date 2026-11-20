const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  for(const fixture of [{role:'inspector',enrolled:false},{role:'inspector',enrolled:true,deniedOnce:true},{role:'inspector',enrolled:true,multiple:true},{role:'inspector',enrolled:true,rejected:true},{role:'quality_control'},{role:'admin'},{role:'inspector',enrolled:false,ios:true},{role:'inspector',enrolled:true,ios:true,previewBlockedOnce:true},{role:'inspector',enrolled:true,ios:true,freeze:true}].filter(f=>!process.env.IDENTITY_IOS_ONLY||f.ios)){
   const context=await browser.newContext({viewport:fixture.ios?{width:390,height:844}:fixture.role==='inspector'&&!fixture.enrolled?{width:360,height:640}:{width:430,height:920},...(fixture.ios?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',isMobile:true,hasTouch:true}:{}),permissions:['camera']});
   await context.addInitScript(()=>{for(const [key,value] of Object.entries({accessToken:'identity-test',refreshToken:'identity-test',lastRoleCode:'inspection_org',lastOrganizationBin:'123456789012',diagnosticLocationAsked:true}))localStorage.setItem('flutter.'+key,JSON.stringify(value));localStorage.setItem('ersi-install-dismissed-at',String(Date.now()));});
   await context.addInitScript(()=>{
    window.__identityStreams=[];window.__identityAudio=[];window.__identityRecorderStarts=[];
    const startRecording=MediaRecorder.prototype.start;MediaRecorder.prototype.start=function(...args){window.__identityRecorderStarts.push(Date.now());return startRecording.apply(this,args);};
    const media=navigator.mediaDevices;
    if(media){const capture=media.getUserMedia.bind(media);media.getUserMedia=async constraints=>{const stream=await capture(constraints);window.__identityStreams.push(stream);return stream;};}
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){if(this.tagName==='AUDIO')this.addEventListener('playing',()=>window.__identityAudio.push({src:this.src,at:performance.now()}),{once:true});return play.call(this);};
   });
   // Synthetic camera frames have no human face. Mock only positioning here;
   // real MediaRecorder/readiness and the authorization boundary remain exercised.
   await context.route('**/face-guide/worker.js',route=>route.fulfill({contentType:'application/javascript',body:`self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});else if(data.type==='frame'){data.image.close();self.postMessage({type:'result',available:true,faces:${JSON.stringify(fixture.multiple?[{x:.05,y:.2,w:.35,h:.5},{x:.55,y:.2,w:.35,h:.5}]:[{x:.3,y:.25,w:.4,h:.5}])}});}};`}));
   if(fixture.previewBlockedOnce)await context.addInitScript(()=>{
    window.__nativeUserResumed=false;
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
     if(this.tagName==='VIDEO'&&this.closest('#ersi-identity-native-preview')&&!window.__nativeUserResumed){this.autoplay=false;this.pause();return Promise.reject(new DOMException('Playback needs a tap','NotAllowedError'));}
     return play.call(this);
    };
   });
   let verified=false,uploads=0,challenge,protectedCalls=0;
   const errors=[];
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/api/v1/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let json={items:[]};
    if(path.endsWith('/auth/refresh'))json={accessToken:'identity-test',refreshToken:'identity-test',sessionExpiresAt:new Date(Date.now()+3600000).toISOString(),user:{sub:'inspector-fixture',phone:'+77000000000',roles:['inspection_org']}};
    else if(path.endsWith('/auth/identity/status'))json={required:fixture.role==='inspector',verified:fixture.role!=='inspector'||verified,enrolled:!!fixture.enrolled,engineReady:true};
    else if(path.endsWith('/auth/identity/challenge')){challenge={challengeId:'11111111-1111-4111-8111-111111111111',challengeToken:'synthetic-camera-only',actions:fixture.enrolled?['TURN_RIGHT','BLINK','TURN_LEFT']:['TURN_LEFT','BLINK'],expiresAt:new Date(Date.now()+300000).toISOString()};json=challenge;}
    else if(path.endsWith('/video')){const body=request.postDataBuffer();assert(body&&body.length>10000,'actual MediaRecorder bytes must be uploaded');assert(body.includes(Buffer.from('synthetic-camera-only')),'challenge secret must bind upload');uploads++;verified=!fixture.rejected;json=fixture.rejected?{status:'REJECTED',message:'В кадре должно быть только одно лицо'}:{status:'VERIFIED'};}
    else if(path.endsWith('/organizations')){protectedCalls++;json={items:[{id:'test-org',bin:'123456789012',type:'inspection_org',name:'Учебный орган',status:'active',members:[{id:'member',userId:'inspector-fixture',role:fixture.role,user:{id:'inspector-fixture',fullName:'Учебный сотрудник'}}]}]};}
    return route.fulfill({json});
   });
   try {
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:8787/');
    await page.locator('#startup').waitFor({state:'detached',timeout:60000});
    const semantics=page.locator('flt-semantics-placeholder');if(await semantics.count())await semantics.evaluate(e=>e.click());
    if(fixture.role==='inspector'){
     const consent=page.getByRole('checkbox');await consent.waitFor();
     await page.waitForTimeout(700);await consent.check();
     const open=page.getByRole('button',{name:'ОТКРЫТЬ КАМЕРУ',exact:true});
     const openBox=await open.boundingBox();assert(openBox&&openBox.y+openBox.height<=page.viewportSize().height,'camera button must be visible without scrolling');
     if(fixture.deniedOnce)await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let denied=false;navigator.mediaDevices.getUserMedia=constraints=>{if(!denied){denied=true;return Promise.reject(new DOMException('Permission denied','NotAllowedError'));}return original(constraints);};});
     await open.click();
     if(fixture.deniedOnce){await page.getByRole('button',{name:'ПОВТОРНО ЗАПРОСИТЬ ДОСТУП К КАМЕРЕ',exact:true}).click();assert.equal(uploads,0);}
     if(fixture.multiple){await page.getByText('В КАДРЕ ДОЛЖНО БЫТЬ ТОЛЬКО ОДНО ЛИЦО',{exact:true}).first().waitFor();await page.waitForTimeout(4000);assert.equal(await page.evaluate(()=>window.__identityRecorderStarts.length),0);assert.equal(uploads,0);assert.equal(protectedCalls,0);console.log('PASS multiple faces prevent recording and workspace access');continue;}
     if(fixture.ios){
      const native=page.locator('#ersi-identity-native-preview');await native.waitFor({timeout:30000});
      if(fixture.previewBlockedOnce){
       await native.getByRole('button',{name:'Начать запись',exact:true}).waitFor();
       await page.waitForFunction(()=>!document.querySelector('#ersi-identity-native-preview button').disabled,{},{timeout:30000});
       assert.equal(await page.evaluate(()=>window.__identityRecorderStarts.length),0,'a hidden fallback video must not start the countdown');
       assert.equal(uploads,0);assert.equal(protectedCalls,0);
       await page.evaluate(()=>window.__nativeUserResumed=true);
       await native.getByRole('button',{name:'Начать запись',exact:true}).click();
      }
      await page.waitForFunction(()=>window.__identityRecorderStarts.length===1,{},{timeout:30000});
      const frame=await page.evaluate(()=>{
       const video=window.ersiIdentityPreview.activeVideo,r=video.getBoundingClientRect();
       const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d');c.drawImage(video,0,0,64,64);const data=c.getImageData(0,0,64,64).data;
       let min=255,max=0;for(let i=0;i<data.length;i+=4){min=Math.min(min,data[i]);max=Math.max(max,data[i]);}
       return {top:r.top,bottom:r.bottom,width:r.width,moving:video.currentTime>0,range:max-min};
      });
      assert(frame.top>=0&&frame.bottom<=844&&frame.width>200&&frame.moving&&frame.range>10,'the visible native surface must contain actual camera frames');
      if(fixture.freeze){
       await page.evaluate(()=>window.ersiIdentityPreview.activeVideo.srcObject.getTracks().forEach(t=>t.stop()));
       await native.waitFor({state:'detached',timeout:10000});
       assert.equal(uploads,0);assert.equal(protectedCalls,0);
       console.log('PASS iPhone layout: stopped visible camera discards capture and keeps access blocked');continue;
      }
      await page.waitForFunction(()=>!document.body.innerText.includes('ВИДЕОПРОВЕРКА ИНСПЕКТОРА'),{},{timeout:60000});
      await native.waitFor({state:'detached'});assert.equal(uploads,1);
      assert.equal(await page.evaluate(()=>window.__identityStreams.some(s=>s.getTracks().some(t=>t.readyState==='live'))),false);
      console.log('PASS iPhone layout: visible native frames + capture + camera cleanup'+(fixture.previewBlockedOnce?' after explicit playback retry':''));continue;
     }
     const record=page.getByRole('button',{name:'НАЧАТЬ ЗАПИСЬ',exact:true});await record.waitFor({timeout:30000});
     const recordBox=await record.boundingBox();assert(recordBox&&recordBox.y+recordBox.height<=page.viewportSize().height,'record controls must be next to camera in viewport');
     await page.waitForFunction(()=>window.__identityRecorderStarts.length===1,{},{timeout:15000});
     const start=await page.evaluate(()=>window.__identityRecorderStarts[0]);
     if(fixture.rejected){await page.getByText('В КАДРЕ ДОЛЖНО БЫТЬ ТОЛЬКО ОДНО ЛИЦО',{exact:true}).first().waitFor({timeout:60000});assert.equal(protectedCalls,0);assert.equal(uploads,1);console.log('PASS server rejection keeps inspector outside workspace');continue;}
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
