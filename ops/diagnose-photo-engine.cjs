'use strict';
// Read-only server-local calibration. Output aggregate counts only, never images/IDs/keys.
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const sharp=require('/opt/reestr/app/backend/node_modules/sharp');
const fs=require('node:fs/promises'),path=require('node:path');
const db=new PrismaClient({log:[]});
(async()=>{
 const health=await (await fetch('http://127.0.0.1:8093/health')).json();
 if(!health.ready||health.model!=='local-yolox-s-coco-v1'||health.externalServices!==false)throw Error('health');
 const root=await fs.realpath(path.join(process.env.LOCAL_STORAGE_PATH||'/opt/reestr/storage',process.env.S3_BUCKET||'ersi-gbo'));
 const photos=await db.inspectionPhoto.findMany({where:{type:{in:['cylinder_label','cylinder_label_2']}},orderBy:{createdAt:'desc'},take:24,select:{objectKey:true}});
 const counts={sampled:photos.length,checked:0,unreadable:0,deviceEvidence:0,strongDeviceEvidence:0,pageEvidence:0};
 const times=[];
 for(const photo of photos){
  try{
   const file=await fs.realpath(path.resolve(root,photo.objectKey));if(!file.startsWith(root+path.sep))throw Error('path');
   const data=await sharp(await fs.readFile(file),{limitInputPixels:40000000}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
   const start=Date.now();const response=await fetch('http://127.0.0.1:8093/analyze',{method:'POST',body:data,signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('worker');const result=await response.json();
   if(result.model!==health.model||!Array.isArray(result.detections))throw Error('model');
   counts.checked++;times.push(Date.now()-start);
   if(result.detections.some(d=>d.kind!=='book'))counts.deviceEvidence++;
   if(result.detections.some(d=>{const[x,y,w,h]=d.box;return d.kind!=='book'&&d.confidence>=.85&&d.agreement>=.75&&w*h>=.18&&x<=.5&&x+w>=.5&&y<=.5&&y+h>=.5}))counts.strongDeviceEvidence++;
   if(result.pageLikeBorder||result.detections.some(d=>d.kind==='book'&&d.confidence>=.5))counts.pageEvidence++;
  }catch{counts.unreadable++;}
 }
 console.log(JSON.stringify({model:health.model,externalServices:false,readOnly:true,counts,maxAnalysisMs:Math.max(0,...times)}));
 if(counts.sampled>0&&counts.checked===0)throw Error('No readable calibration photos');
})().catch(()=>{console.error('Private photo calibration failed');process.exitCode=1}).finally(()=>db.$disconnect());
