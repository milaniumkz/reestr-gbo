// Local positioning guidance. Only downscaled frames enter the dedicated worker.
let worker, timer, startDeadline, cancelStart, generation=0, recording=false;
function cameraVideos(root=document) {
  const videos=[...root.querySelectorAll('video')];
  for(const element of root.querySelectorAll('*')) if(element.shadowRoot) videos.push(...cameraVideos(element.shadowRoot));
  return videos;
}
function videoElement() {
  return cameraVideos().find(video=>video.isConnected && video.srcObject?.getVideoTracks?.().some(track=>track.readyState==='live') && video.getBoundingClientRect().width>0);
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
