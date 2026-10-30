'use strict';
const crypto = require('node:crypto');
const { PrismaClient } = require('/opt/reestr/app/backend/node_modules/@prisma/client');
const serial = process.argv[2];
const key = process.argv[3];
const kind = process.argv[4] || 'cylinder';
if (!['cylinder','inspection'].includes(kind)) process.exit(2);
if (!/^[0-9A-Za-z._/-]{1,100}$/.test(serial || '') || !/^[A-Za-z0-9+/=]+$/.test(key || '')) process.exit(2);
const db = new PrismaClient({log:[]});
const person = {select:{id:true,fullName:true,phone:true}};
(async()=>{
  const cylinders = kind === 'inspection' ? [] : await db.gasCylinder.findMany({where:{serialNumber:{contains:serial,mode:'insensitive'}},take:200,include:{vehicle:{include:{owners:true,inspections:{include:{organization:true,certificate:true,createdBy:person,submittedBy:person,qualityConfirmedBy:person,approvedBy:person,_count:{select:{photos:true}}},orderBy:{createdAt:'desc'}}}}}});
  const inspections = kind === 'inspection' ? await db.inspection.findMany({where:{certificateNumber:serial},include:{photos:{orderBy:{createdAt:'desc'}},createdBy:person,submittedBy:person,qualityConfirmedBy:person,approvedBy:person,certificate:true,organization:{select:{name:true,bin:true}}}}) : [];
  const {activeCylinderPhotos} = require('/opt/reestr/app/backend/dist/src/inspections/cylinder-pair');
  const checks=[];
  if (kind === 'inspection') {
    const {InspectionsService} = require('/opt/reestr/app/backend/dist/src/inspections/inspections.service');
    const service=new InspectionsService(db,{objectUrl:key=>({url:key})},{},{});
    const diagnostic={sub:'read-only-diagnostic',phone:'',roles:['super_admin']};
    for (const inspection of inspections) {
      const detail=await service.detail(inspection.id,diagnostic);
      const photos=await service.photos(inspection.id,diagnostic);
      checks.push({inspectionId:inspection.id,detailPhotoCount:detail.photos.length,photosEndpointCount:photos.length});
    }
  }
  const report={checks,queriedAt:new Date().toISOString(),query:serial,cylinders,inspections:inspections.map(i=>({...i,storedPhotoCount:i.photos.length,visiblePhotoCount:activeCylinderPhotos(i,i.photos).length}))};
  const secret=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(report),'utf8'),cipher.final()]);
  const wrapped=crypto.publicEncrypt({key:Buffer.from(key,'base64'),oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},secret);
  process.stdout.write(JSON.stringify({key:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
})().catch(()=>{process.stderr.write('Read-only lookup failed\n');process.exitCode=1}).finally(()=>db.$disconnect());
