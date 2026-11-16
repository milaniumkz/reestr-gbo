/* Local pending inspection only; no auth tokens or network requests. */
(() => {
  'use strict';
  let database, pending=Promise.resolve();
  const savedVersions=new Map();
  const deadline=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Recovery storage timed out')),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});});
  const open=()=>database ||= deadline(new Promise((resolve,reject)=>{
    const request=indexedDB.open('ersi-inspection-recovery',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('files');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Recovery storage blocked'));
  }),5000).catch(error=>{database=undefined;throw error;});
  const get=(store,key)=>new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const serial=action=>{const next=pending.then(()=>deadline(action(),8000));pending=next.then(()=>{},()=>{});return next;};
  const write=(db,enqueue)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(['state','files'],'readwrite');
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Recovery write aborted'));
    try{enqueue(tx);}catch(error){tx.abort();reject(error);}
  });
  window.ersiInspectionRecovery={
    read:owner=>serial(async()=>{
      const db=await open(),raw=await get(db.transaction('state').objectStore('state'),owner);
      if(!raw||raw.version!==1||raw.owner!==owner||!Number.isFinite(Date.parse(raw.savedAt))||Date.now()-Date.parse(raw.savedAt)>7*86400000)return null;
      const types=raw.fileTypes||[];if(types.length>20)throw Error('Invalid recovery');
      const tx=db.transaction('files'),store=tx.objectStore('files');
      const values=await Promise.all(types.map(type=>get(store,owner+'/'+type)));
      const files=values.map((bytes,i)=>{if(!(bytes instanceof Uint8Array)||!bytes.byteLength)throw Error('Incomplete recovery');return {type:types[i],bytes};});
      return {fields:raw.fields,files};
    }),
    save:(owner,fields,files)=>serial(async()=>{
      if(!owner||fields.length>150000||files.length>20||files.some(f=>!f.type||f.bytes.byteLength>12*1024*1024))throw Error('Invalid recovery size');
      const db=await open(),previous=await get(db.transaction('state').objectStore('state'),owner),versions=savedVersions.get(owner)||new Map();
      await write(db,tx=>{
        const binary=tx.objectStore('files');
        for(const type of previous?.fileTypes||[])if(!files.some(f=>f.type===type))binary.delete(owner+'/'+type);
        for(const file of files)if(versions.get(file.type)!==file.version)binary.put(file.bytes,owner+'/'+file.type);
        tx.objectStore('state').put({version:1,owner,savedAt:new Date().toISOString(),fields,fileTypes:files.map(f=>f.type)},owner);
      });
      savedVersions.set(owner,new Map(files.map(f=>[f.type,f.version])));
    }),
    clear:owner=>serial(async()=>{
      const db=await open(),previous=await get(db.transaction('state').objectStore('state'),owner);
      await write(db,tx=>{for(const type of previous?.fileTypes||[])tx.objectStore('files').delete(owner+'/'+type);tx.objectStore('state').delete(owner);});
      savedVersions.delete(owner);
    }),
  };
})();
// Coordinate refresh-token rotation across tabs; never move credentials here.
window.ersiSessionRefreshLock = callback => navigator.locks?.request
  ? navigator.locks.request('ersi-session-refresh', callback)
  : callback(null);
