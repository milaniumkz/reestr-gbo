'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const {createHash}=require('node:crypto');
const {InspectionsService}=require('/opt/reestr/app/backend/dist/src/inspections/inspections.service');
const number=process.argv[2],expected=process.argv[3];
if(!/^\d{1,30}$/.test(number||'')||!/^[a-f0-9]{64}$/.test(expected||''))process.exit(2);
const db=new PrismaClient({log:[]});
(async()=>{
 const row=await db.inspection.findUnique({where:{certificateNumber:number}});
 if(!row||row.lat===null||row.lng===null)throw Error('Inspection with saved GPS required');
 if(createHash('sha256').update(row.address||'').digest('hex')!==expected)throw Error('Address changed: refusing repair');
 if(process.argv[4]==='diagnose') {
  for(const [provider,url] of [
   ['nominatim',`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${row.lat}&lon=${row.lng}&zoom=18&addressdetails=1`],
   ['photon',`https://photon.komoot.io/reverse?lat=${row.lat}&lon=${row.lng}&radius=0.1&limit=1`],
  ]) {
   const started=Date.now();
   try {
    const response=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'ERSI-GBO/1.0 inspection location','Accept-Language':'ru,kk,en'}});
    const data=await response.json().catch(()=>null);
    console.log(JSON.stringify({provider,status:response.status,elapsedMs:Date.now()-started,found:Boolean(data?.display_name||data?.features?.length),hasStreet:Boolean(data?.address?.road||data?.features?.[0]?.properties?.street),hasHouse:Boolean(data?.address?.house_number||data?.features?.[0]?.properties?.housenumber)}));
   } catch(error) { console.log(JSON.stringify({provider,elapsedMs:Date.now()-started,error:error.name,code:error.cause?.code})); }
  }
  return;
 }
 const service=new InspectionsService(db,{},{});
 const address=await service.reverseGeocode(row.lat,row.lng);
 if(!address)throw Error('Address lookup unavailable: original record retained');
 await db.$transaction(async tx=>{
  const result=await tx.inspection.updateMany({where:{id:row.id,address:row.address,lat:row.lat,lng:row.lng},data:{address}});
  if(result.count!==1)throw Error('Concurrent change: refusing repair');
  await tx.auditLog.create({data:{action:'inspection.location.address_repaired',entity:'inspection',entityId:row.id,metadata:{certificateNumber:number,previousAddress:row.address,address,lat:row.lat,lng:row.lng,reason:'Resolve stored inspection GPS to an actual address',source:'reverse_geocoding',workflowRun:process.env.GITHUB_RUN_ID}}});
 });
 console.log(JSON.stringify({certificateNumber:number,updated:1,coordinatesUnchanged:true,audited:true}));
})().catch(()=>{console.error('Scoped address repair failed; inspect protected diagnostics');process.exitCode=1}).finally(()=>db.$disconnect());
