// Local positioning guidance. Only downscaled frames enter the dedicated worker.
let worker, timer, startDeadline, cancelStart, generation=0, recording=false;
function cameraVideos(root=document) {
  const videos=[...root.querySelectorAll('video')];
  for(const element of root.querySelectorAll('*')) if(element.shadowRoot) videos.push(...cameraVideos(element.shadowRoot));
  return videos;
}
function visibleCamera(video) {
  if(!video?.isConnected || document.hidden || !video.srcObject?.getVideoTracks?.().some(track=>track.readyState==='live'))return false;
  const r=video.getBoundingClientRect();
  if(r.width<=0 || r.height<=0)return false;
  const style=typeof getComputedStyle==='function'?getComputedStyle(video):null;
  if(style && (style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0))return false;
  const height=window.innerHeight||Infinity,width=window.innerWidth||Infinity;
  return Math.min(r.bottom,height)-Math.max(r.top,0)>=r.height*.7 && Math.min(r.right,width)-Math.max(r.left,0)>=r.width*.7;
}
function videoElement() {
  const native=window.ersiIdentityPreview?.activeVideo;
  if(native)return visibleCamera(native)?native:undefined;
  return cameraVideos().find(visibleCamera);
}
let liveVideo,lastFrameTime,lastFrameAt;
function cameraIsLive() {
  const video=videoElement(),now=performance.now();
  if(!video || video.paused || video.ended || video.readyState<2 || !video.videoWidth)return false;
  if(video!==liveVideo || video.currentTime!==lastFrameTime){liveVideo=video;lastFrameTime=video.currentTime;lastFrameAt=now;}
  return now-lastFrameAt<2000;
}
async function waitForCamera() {
  const started=performance.now();let firstTime=null,lastVideo=null;
  while(performance.now()-started<20000) {
    if(window.ersiIdentityPreview?.needsGesture)throw new Error('Camera preview needs a playback tap');
    const video=videoElement();
    if(video && video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0 && !video.ended) {
      video.muted=true;video.setAttribute('playsinline','');
      if(video.paused)await video.play().catch(()=>{});
      if(video!==lastVideo){lastVideo=video;firstTime=video.currentTime;}
      if(!video.paused && video.currentTime-firstTime>=.2)return;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Camera preview is not delivering frames');
}
window.intercityFaceGuide = {
  waitForCamera,
  cameraIsLive,
  start(report) {
    this.stop();const current=generation;recording=false;
    return new Promise(resolve=>{
      cancelStart=resolve;
      let ready=false,busy=false,lastTime=-1,lastSent=-Infinity;
      const unavailable=()=>{if(current!==generation)return;clearInterval(timer);worker?.terminate();worker=undefined;report(JSON.stringify({available:false,faces:[]}));resolve();};
      try {
        if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined')return unavailable();
        const active=new Worker(new URL('./worker.js',import.meta.url));worker=active;
        const deadline=startDeadline=setTimeout(()=>{if(current===generation)unavailable()},15000);
        active.onerror=()=>{clearTimeout(deadline);unavailable()};
        active.onmessage=({data})=>{
          if(current!==generation)return;
          if(data.type==='unavailable'){clearTimeout(deadline);unavailable();return;}
          if(data.type==='ready'){ready=true;return;}
          if(data.type==='result'){clearTimeout(deadline);busy=false;report(JSON.stringify({available:data.available,faces:data.faces}));resolve();}
        };
        active.postMessage({type:'init'});
        timer=setInterval(async()=>{
          const now=performance.now();
          if(current!==generation||!ready||busy||now-lastSent<(recording?800:400))return;
          const video=videoElement();
          if(!video||video.readyState<2||!video.videoWidth)return;
          if(video.paused&&!document.hidden){video.muted=true;video.play().catch(()=>{});}
          if(video.currentTime===lastTime)return;
          busy=true;lastTime=video.currentTime;lastSent=now;
          try {
            const scale=Math.min(1,384/Math.max(video.videoWidth,video.videoHeight));
            const image=await createImageBitmap(video,{resizeWidth:Math.max(1,Math.round(video.videoWidth*scale)),resizeHeight:Math.max(1,Math.round(video.videoHeight*scale))});
            if(current!==generation){image.close();busy=false;return;}
            active.postMessage({type:'frame',image,timestamp:performance.now()},[image]);
          } catch(_){busy=false;report(JSON.stringify({available:false,faces:[]}));}
        },100);
      } catch(_){unavailable();}
    });
  },
  recording(){recording=true},
  stop(){generation++;cancelStart?.();cancelStart=undefined;clearTimeout(startDeadline);clearInterval(timer);timer=undefined;worker?.terminate();worker=undefined;}
};

// iOS uses a browser-native video surface above Flutter's composited scene.
// It shares the existing camera stream: no second getUserMedia or video upload.
window.ersiIdentityPreview = (()=>{
  let root,video,title,cue,face,message,progress,start,cancel,oval,poll,state,needsGesture=false;
  function hide(){
    clearInterval(poll);poll=undefined;needsGesture=false;
    if(video){video.pause();video.srcObject=null;}
    root?.remove();root=video=title=cue=face=message=progress=start=cancel=oval=state=undefined;
  }
  function enabled(){return /iPhone|iPad|iPod/.test(window.navigator?.userAgent||'') || (window.navigator?.platform==='MacIntel'&&window.navigator.maxTouchPoints>1);}
  function connect(){
    if(!video || video.srcObject)return;
    const source=cameraVideos().find(v=>v!==video&&v.srcObject?.getVideoTracks?.().some(t=>t.readyState==='live'));
    if(!source)return;
    const target=video;target.srcObject=source.srcObject;
    target.play().catch(error=>{if(video===target){needsGesture=error?.name==='NotAllowedError';if(message)message.textContent=state.message||state.playError||'';}});
  }
  function node(tag,parent,css){const n=document.createElement(tag);if(css)n.style.cssText=css;parent.appendChild(n);return n;}
  function show(raw,onStart,onCancel){
    state=JSON.parse(raw);
    if(!root){
      root=node('section',document.body,'position:fixed;inset:0;z-index:2147483000;overflow:auto;box-sizing:border-box;background:#f0f8f4;color:#153b30;padding:calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));font:16px system-ui,-apple-system,sans-serif');
      root.id='ersi-identity-native-preview';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
      title=node('h2',root,'margin:0 auto 12px;max-width:520px;font-size:21px');
      const frame=node('div',root,'position:relative;width:100%;height:min(52vh,420px);min-height:220px;max-width:520px;margin:auto;border-radius:20px;overflow:hidden;background:#000');
      video=node('video',frame,'display:block;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);-webkit-transform:scaleX(-1)');
      video.muted=true;video.autoplay=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('aria-label','Camera preview');
      oval=node('div',frame,'position:absolute;pointer-events:none;left:50%;top:54%;transform:translate(-50%,-50%);width:44%;height:70%;border:3px solid white;border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.38)');
      cue=node('div',frame,'position:absolute;top:12px;left:12px;right:12px;padding:9px;text-align:center;background:rgba(0,0,0,.82);border-radius:10px;color:white;font-weight:700;font-size:19px');
      face=node('div',root,'margin:10px auto;text-align:center;max-width:520px');
      progress=node('div',root,'text-align:center;font-weight:700;font-size:20px');
      message=node('div',root,'margin:10px auto;max-width:520px;color:#a22828');message.setAttribute('role','status');
      start=node('button',root,'display:block;width:100%;max-width:520px;min-height:48px;margin:10px auto;border:0;border-radius:12px;background:#007b55;color:white;font:700 17px system-ui');
      cancel=node('button',root,'display:block;min-height:44px;margin:auto;border:0;background:transparent;color:#153b30;font:16px system-ui');
      start.onclick=()=>{if(!start.disabled){root.scrollTop=0;needsGesture=false;video.play().catch(error=>{needsGesture=error?.name==='NotAllowedError';});onStart();}};
      cancel.onclick=()=>{if(!cancel.disabled)onCancel();};
      connect();poll=setInterval(connect,100);
    }
    root.setAttribute('aria-label',state.title);title.textContent=state.title;
    cue.textContent=state.instruction;face.textContent=state.face;message.textContent=state.message||'';
    oval.style.borderColor=state.centered?'#69f0ae':'white';progress.textContent=state.progress||'';
    start.textContent=state.start;start.disabled=state.busy||state.recording;start.hidden=!!state.recording;start.style.display=state.recording?'none':'block';
    start.style.opacity=start.disabled?'.55':'1';cancel.textContent=state.cancel;cancel.disabled=state.busy||state.recording;
    connect();
  }
  return {enabled,show,hide,get needsGesture(){return needsGesture;},get activeVideo(){return video;}};
})();
