const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('web/face-guide/guide.js','utf8').replaceAll('import.meta.url',JSON.stringify('https://example.test/face-guide/guide.js'));
function fixture({moving=true,paused=false,live=true,visible=true,connected=true,shadow=false}={}){
 let clock=0,plays=0;
 const video={isConnected:connected,srcObject:{getVideoTracks:()=>[{readyState:live?'live':'ended'}]},getBoundingClientRect:()=>({width:visible?320:0}),readyState:2,videoWidth:640,videoHeight:480,ended:false,paused,
  get currentTime(){return moving?clock/1000:0;},setAttribute(){},async play(){plays++;this.paused=false;}};
 const stale={...video,srcObject:{getVideoTracks:()=>[{readyState:'ended'}]}};
 const root={querySelectorAll:selector=>selector==='video'?[stale,...(shadow?[]:[video])]:shadow?[{shadowRoot:{querySelectorAll:selector=>selector==='video'?[video]:[]}}]:[]};
 const window={};vm.runInNewContext(source,{window,document:root,performance:{now:()=>clock},setTimeout:fn=>{clock+=100;queueMicrotask(fn);},clearTimeout(){},setInterval(){},clearInterval(){},URL});
 return {wait:()=>window.intercityFaceGuide.waitForCamera(),plays:()=>plays,time:()=>clock,live:()=>window.intercityFaceGuide.cameraIsLive(),advance:n=>clock+=n};
}
test('recording waits for advancing frames, ignoring ended camera elements',async()=>{const f=fixture();await f.wait();assert(f.time()>=200);});
test('Safari paused preview is played before recording',async()=>{const f=fixture({paused:true});await f.wait();assert.equal(f.plays(),1);});
test('camera inside Flutter shadow DOM is recognized',async()=>{await fixture({shadow:true}).wait();});
for(const [name,options] of Object.entries({frozen:{moving:false},ended:{live:false},hidden:{visible:false},detached:{connected:false}}))test(name+' preview cannot start identity recording',async()=>{await assert.rejects(fixture(options).wait(),/not delivering frames/);});

test('a stalled or ended camera cannot continue verification',async()=>{const f=fixture({moving:false});assert.equal(f.live(),true);f.advance(2100);assert.equal(f.live(),false);assert.equal(fixture({live:false}).live(),false);});
