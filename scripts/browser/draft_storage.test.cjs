// Local outbox isolation/atomicity, synthetic bytes only. No Flutter/API required.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await b.newContext();const p=await context.newPage();await p.goto((process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8797')+'/not-found.html');
 const code=fs.readFileSync('web/inspection-recovery.js','utf8');await p.addScriptTag({content:code});
 await p.evaluate(async()=>{const s=window.ersiInspectionRecovery;
  await s.save('a',JSON.stringify({localDraftId:'first',ownerName:'FIRST'}),[{type:'primary_tech',bytes:new Uint8Array([1,2,3]),version:1}]);
  await s.save('a',JSON.stringify({localDraftId:'second',ownerName:'SECOND'}),[{type:'primary_tech',bytes:new Uint8Array([4,5,6]),version:1}]);
 });
 assert.equal(await p.evaluate(async()=>(await window.ersiInspectionRecovery.list('a')).length),2);
 assert.equal(await p.evaluate(async()=>(await window.ersiInspectionRecovery.list('b')).length),0);
 assert.equal(await p.evaluate(async()=>await window.ersiInspectionRecovery.read('b','first')),null);
 assert.deepEqual(await p.evaluate(async()=>Array.from((await window.ersiInspectionRecovery.read('a','first')).files[0].bytes)),[1,2,3]);
 console.log('PASS multiple drafts and exact photo bytes are isolated by owner and draft ID');
 await p.evaluate(async()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...a){if(this.name==='state')throw Error('quota');return original.apply(this,a)};
  try{await window.ersiInspectionRecovery.save('a',JSON.stringify({localDraftId:'first',ownerName:'BROKEN'}),[{type:'primary_tech',bytes:new Uint8Array([9,9]),version:2}]);throw Error('Expected quota error');}catch(e){if(e.message==='Expected quota error')throw e;}finally{IDBObjectStore.prototype.put=original;}
 });
 const after=await p.evaluate(async()=>{const r=await window.ersiInspectionRecovery.read('a','first');return {name:JSON.parse(r.fields).ownerName,bytes:Array.from(r.files[0].bytes)}});
 assert.deepEqual(after,{name:'FIRST',bytes:[1,2,3]});console.log('PASS quota failure preserves the prior fields and original file atomically');
 const other=await p.context().newPage();await other.goto((process.env.INSPECTION_TEST_ORIGIN||'http://127.0.0.1:8797')+'/not-found.html');await other.addScriptTag({content:code});
 await other.evaluate(async()=>window.ersiInspectionRecovery.save('a',JSON.stringify({localDraftId:'first',ownerName:'OTHER TAB'}),[{type:'primary_tech',bytes:new Uint8Array([7,8,9]),version:1}]));
 await p.evaluate(async()=>window.ersiInspectionRecovery.save('a',JSON.stringify({localDraftId:'first',ownerName:'FIRST'}),[{type:'primary_tech',bytes:new Uint8Array([1,2,3]),version:1}]));
 assert.deepEqual(await p.evaluate(async()=>Array.from((await window.ersiInspectionRecovery.read('a','first')).files[0].bytes)),[1,2,3]);await other.close();
 console.log('PASS another tab cannot cause stale binary-version reuse');
 await p.evaluate(async()=>await window.ersiInspectionRecovery.clear('a','first'));
 assert.deepEqual(await p.evaluate(async()=>(await window.ersiInspectionRecovery.list('a')).map(d=>d.id)),['second']);
 await p.reload();await p.addScriptTag({content:code});
 assert.deepEqual(await p.evaluate(async()=>Array.from((await window.ersiInspectionRecovery.read('a','second')).files[0].bytes)),[4,5,6]);
 console.log('PASS clearing a completed draft preserves other drafts and reload restores their files');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
