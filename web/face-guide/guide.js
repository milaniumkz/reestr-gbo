// Local positioning guidance. Only downscaled frames enter the dedicated worker.
let worker, timer, generation=0, recording=false;
function videoElement(root=document) {
  const video=root.querySelector('video');
  if(video) return video;
  for(const element of root.querySelectorAll('*')) if(element.shadowRoot) {
    const found=videoElement(element.shadowRoot);if(found)return found;
  }
}
window.intercityFaceGuide = {
  start(report) {
    this.stop();const current=generation;recording=false;
    return new Promise(resolve=>{
      let ready=false,busy=false,lastTime=-1,lastSent=-Infinity;
      const unavailable=()=>{if(current!==generation)return;clearInterval(timer);worker?.terminate();worker=undefined;report(JSON.stringify({available:false,faces:[]}));resolve();};
      try {
        if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined')return unavailable();
        const active=new Worker(new URL('./worker.js',import.meta.url));worker=active;
        const deadline=setTimeout(()=>{if(!ready&&current===generation)unavailable()},15000);
        active.onerror=()=>{clearTimeout(deadline);unavailable()};
        active.onmessage=({data})=>{
          if(current!==generation)return;
          if(data.type==='unavailable'){clearTimeout(deadline);unavailable();return;}
          if(data.type==='ready'){clearTimeout(deadline);ready=true;resolve();return;}
          if(data.type==='result'){busy=false;report(JSON.stringify({available:data.available,faces:data.faces}));}
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
  stop(){generation++;clearInterval(timer);timer=undefined;worker?.terminate();worker=undefined;}
};
