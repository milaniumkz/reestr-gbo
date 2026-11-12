'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const {createHash}=require('node:crypto');
const {InspectionsService}=require('/opt/reestr/app/backend/dist/src/inspections/inspections.service');
const number=process.argv[2],expected=process.argv[3];
if(!/^\d{1,30}$/.test(number||'')||!/^[a-f0-9]{64}$/.test(expected||''))process.exit(2);
const db=new PrismaClient({log:[]});
(async()=>{
 const organizationId=process.argv[5]||undefined;
 const matches=await db.inspection.findMany({where:{certificateNumber:number,...(organizationId?{organizationId}:{})},take:2});
 if(matches.length!==1)throw Error('Select the inspection organization for this certificate number');
 const row=matches[0];
 if(!row||row.lat===null||row.lng===null)throw Error('Inspection with saved GPS required');
 if(createHash('sha256').update(row.address||'').digest('hex')!==expected)throw Error('Address changed: refusing repair');
 if(process.argv[4]==='diagnose') {
  const events=await db.technicalEvent.findMany({where:{createdAt:{gte:new Date(Date.now()-6*60*60_000)},action:{contains:'location'}},orderBy:{createdAt:'desc'},take:30,select:{createdAt:true,action:true,details:true}});
  for(const event of events) console.log(JSON.stringify({locationRequest:{at:event.createdAt,route:event.action,status:event.details?.statusCode,durationMs:event.details?.durationMs}}));
  const {geocoderJson}=require('/opt/reestr/app/backend/dist/src/inspections/geocoder-http');
  for(const [provider,url] of [
   ['nominatim',`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${row.lat}&lon=${row.lng}&zoom=18&addressdetails=1`],
   ['photon',`https://photon.komoot.io/reverse?lat=${row.lat}&lon=${row.lng}&radius=0.1&limit=1`],
  ]) {
   const started=Date.now(),data=await geocoderJson(url);
   console.log(JSON.stringify({productionTransport:provider,elapsedMs:Date.now()-started,hasData:Boolean(data?.address||data?.features?.length)}));
  }
  const dns=new (require('node:dns').promises.Resolver)({timeout:2000,tries:1});
  const {execFileSync}=require('node:child_process');
  for(const family of [4,6]) {
    try { console.log(JSON.stringify({dnsFamily:family,records:await (family===4?dns.resolve4('nominatim.openstreetmap.org'):dns.resolve6('nominatim.openstreetmap.org'))})); }
    catch(error) { console.log(JSON.stringify({dnsFamily:family,error:error.code})); }
    try { console.log(JSON.stringify({curlFamily:family,result:execFileSync('curl',['-'+family,'--silent','--show-error','--connect-timeout','5','--max-time','8','--output','/dev/null','--write-out','%{http_code} %{remote_ip} %{time_total}', '-H','User-Agent: ERSI-GBO/1.0 inspection location',`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${row.lat}&lon=${row.lng}&zoom=18&addressdetails=1`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()})); }
    catch(error) { console.log(JSON.stringify({curlFamily:family,exitCode:error.status,error:error.stderr?.toString().trim()})); }
  }

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
