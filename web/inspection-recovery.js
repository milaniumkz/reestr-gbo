/* Private browser drafts. No authentication tokens, video or network calls. */
(() => {
  'use strict';
  let database, pending=Promise.resolve();
  const savedVersions=new Map();
  const writer=crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const deadline=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Recovery storage timed out')),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});});
  const open=()=>database ||= deadline(new Promise((resolve,reject)=>{
    const request=indexedDB.open('ersi-inspection-recovery',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('files');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Recovery storage blocked'));
  }),5000).catch(error=>{database=undefined;throw error;});
  const get=(store,key)=>new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const all=store=>new Promise((resolve,reject)=>{const q=store.getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  const serial=action=>{const next=pending.then(()=>deadline(action(),8000));pending=next.then(()=>{},()=>{});return next;};
  const key=(owner,id)=>!id||id==='legacy'?owner:owner+'/'+id;
  const records=async(db,owner)=>(await all(db.transaction('state').objectStore('state'))).filter(r=>r.version===1&&r.owner===owner&&typeof r.fields==='string').sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt));
  const write=(db,enqueue)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(['state','files'],'readwrite');
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Recovery write aborted'));
    try{enqueue(tx);}catch(error){tx.abort();reject(error);}
  });
  window.ersiInspectionRecovery={
    list:owner=>serial(async()=>{const db=await open();return (await records(db,owner)).map(r=>({id:r.draftId||'legacy',fields:r.fields,savedAt:r.savedAt}));}),
    read:(owner,id)=>serial(async()=>{
      const db=await open();
      const raw=id?await get(db.transaction('state').objectStore('state'),key(owner,id)):(await records(db,owner))[0];
      if(!raw||raw.version!==1||raw.owner!==owner)return null;
      const recordKey=key(owner,raw.draftId),types=raw.fileTypes||[];
      if(types.length>20)throw Error('Invalid recovery');
      const store=db.transaction('files').objectStore('files');
      const values=await Promise.all(types.map(type=>get(store,recordKey+'/'+type)));
      const files=values.map((bytes,i)=>{if(!(bytes instanceof Uint8Array)||!bytes.byteLength)throw Error('Incomplete recovery');return {type:types[i],bytes};});
      return {fields:raw.fields,files};
    }),
    save:(owner,fields,files)=>serial(async()=>{
      if(!owner||fields.length>150000||files.length>20||files.some(f=>!f.type||f.bytes.byteLength>12*1024*1024))throw Error('Invalid recovery size');
      const draftId=JSON.parse(fields).localDraftId||'legacy';
      if(!/^[a-zA-Z0-9-]{1,80}$/.test(draftId))throw Error('Invalid draft ID');
      const db=await open(),recordKey=key(owner,draftId);
      const previous=await get(db.transaction('state').objectStore('state'),recordKey),versions=previous?.writer===writer?(savedVersions.get(recordKey)||new Map()):new Map();
      await write(db,tx=>{
        const binary=tx.objectStore('files');
        for(const type of previous?.fileTypes||[])if(!files.some(f=>f.type===type))binary.delete(recordKey+'/'+type);
        for(const file of files)if(versions.get(file.type)!==file.version)binary.put(file.bytes,recordKey+'/'+file.type);
        tx.objectStore('state').put({version:1,owner,draftId,writer,savedAt:new Date().toISOString(),fields,fileTypes:files.map(f=>f.type)},recordKey);
      });
      savedVersions.set(recordKey,new Map(files.map(f=>[f.type,f.version])));
    }),
    markVersion:(owner,id,version)=>serial(async()=>{
      const db=await open(),recordKey=key(owner,id);
      const raw=await get(db.transaction('state').objectStore('state'),recordKey);
      if(!raw||raw.owner!==owner||raw.writer!==writer)return;
      const fields=JSON.parse(raw.fields);fields.remoteVersion=version;
      await write(db,tx=>tx.objectStore('state').put({...raw,fields:JSON.stringify(fields)},recordKey));
    }),
    clear:(owner,id)=>serial(async()=>{
      const db=await open(),recordKey=key(owner,id),previous=await get(db.transaction('state').objectStore('state'),recordKey);
      await write(db,tx=>{for(const type of previous?.fileTypes||[])tx.objectStore('files').delete(recordKey+'/'+type);tx.objectStore('state').delete(recordKey);});
      savedVersions.delete(recordKey);
    }),
  };
})();
window.ersiSessionRefreshLock = callback => navigator.locks?.request
  ? navigator.locks.request('ersi-session-refresh', callback)
  : callback(null);
