const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker(windows=[]){
 const events={},shown=[],opened=[],self={location:{origin:'https://ersigbo.kz'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync('web/ersi-pwa-sw.js','utf8'),{self,URL});
 return {events,shown,opened};
}
const version='b'.repeat(40);
test('release push produces a visible coalesced public notification',async()=>{
 const f=worker();let work;f.events.push({data:{json:()=>({type:'web_release',version,title:'Новая версия',body:'Обновите страницу'})},waitUntil:p=>work=p});await work;
 assert.equal(f.shown.length,1);assert.equal(f.shown[0][1].tag,'ersi-web-release');assert.equal(f.shown[0][1].data.version,version);
});
for(const payload of [{type:'other',version},{type:'web_release',version:'bad'},{}])test('malformed push is ignored: '+JSON.stringify(payload),()=>{const f=worker();f.events.push({data:{json:()=>payload},waitUntil(){throw Error('unexpected')}});assert.equal(f.shown.length,0);});
test('push click focuses and informs an existing form without navigating it',async()=>{
 let focused=0,messages=[],closed=0,work;const f=worker([{url:'https://ersigbo.kz/',postMessage:message=>messages.push(message),focus:async()=>focused++,navigate(){throw Error('must not discard a form')}}]);
 f.events.notificationclick({notification:{data:{version},close:()=>closed++},waitUntil:p=>work=p});await work;
 assert.equal(focused,1);assert.equal(closed,1);assert.equal(messages[0].type,'ersi-release-available');assert.equal(f.opened.length,0);
});
test('closed app opens only its own site, never a payload URL or technical panel',async()=>{
 let work;const f=worker([{url:'https://ersigbo.kz/technical',focus(){throw Error('wrong app')}}]);
 f.events.notificationclick({notification:{data:{version,url:'https://evil.test/'},close(){}},waitUntil:p=>work=p});await work;
 assert.deepEqual(f.opened,['https://ersigbo.kz/?_ersi_release='+version]);
});
test('push never adds a navigation/API fetch interceptor',()=>{
 const f=worker();let intercepted=false;f.events.fetch({respondWith(){intercepted=true}});assert.equal(intercepted,false);
});
