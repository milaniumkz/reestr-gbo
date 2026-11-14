// Dedicated classic worker: model inference never runs on Flutter's UI thread.
var exports = {};
importScripts('./vision_bundle_classic.js');
let detector;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      if (typeof OffscreenCanvas === 'undefined') throw Error('Offscreen canvas unavailable');
      const files = await exports.FilesetResolver.forVisionTasks(new URL('./wasm',self.location.href).href);
      detector = await exports.FaceDetector.createFromOptions(files, {
        baseOptions: {modelAssetPath:new URL('./blaze_face_short_range.tflite',self.location.href).href,delegate:'CPU'},
        canvas:new OffscreenCanvas(1,1),runningMode:'VIDEO',minDetectionConfidence:.65
      });
      self.postMessage({type:'ready'});
    } catch (_) { self.postMessage({type:'unavailable'}); }
    return;
  }
  if(data.type !== 'frame') return;
  const image=data.image;
  try {
    const width=image.width,height=image.height;
    const result=detector.detectForVideo(image,data.timestamp);
    self.postMessage({type:'result',available:true,faces:result.detections.map(d=>({
      x:d.boundingBox.originX/width,y:d.boundingBox.originY/height,
      w:d.boundingBox.width/width,h:d.boundingBox.height/height
    }))});
  } catch (_) { self.postMessage({type:'result',available:false,faces:[]}); }
  finally { image.close(); }
};
