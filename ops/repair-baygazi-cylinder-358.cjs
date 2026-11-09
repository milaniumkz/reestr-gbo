'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
 await db.$transaction(async tx=>{
  const rows=await tx.gasCylinder.findMany({where:{serialNumber:'358',manufacturer:'ООО «Балсити» г. Москва, улица Медиков, дом 12, пом. 1 ком. 15',volumeLiters:89,producedAt:new Date('2016-02-27'),vehicle:{inspections:{some:{organizationId:'716c5c26-dfe4-4dce-b9f8-32ce3cf8d85f',certificateNumber:'10314'}}}},select:{id:true,shape:true}});
  if(rows.length!==1)throw Error('Expected exactly one scoped cylinder');
  const row=rows[0];
  if(row.shape==='Тороидальный'){console.log('Already corrected');return;}
  if(row.shape!==null)throw Error('Shape changed; refusing overwrite');
  const result=await tx.gasCylinder.updateMany({where:{id:row.id,shape:null},data:{shape:'Тороидальный'}});
  if(result.count!==1)throw Error('Concurrent change');
  await tx.auditLog.create({data:{action:'cylinder.shape.corrected',entity:'gasCylinder',entityId:row.id,metadata:{previousShape:null,shape:'Тороидальный',reason:'Owner confirmed existing cylinder 358 is toroidal; new cylinder is cylindrical',workflowRun:process.env.GITHUB_RUN_ID}}});
  console.log('Updated one cylinder shape; audited; all other fields retained');
 });
})().catch(()=>{console.error('Scoped cylinder correction failed');process.exitCode=1}).finally(()=>db.$disconnect());
