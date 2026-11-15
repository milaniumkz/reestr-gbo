'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
 const rows=await db.technicalEvent.findMany({where:{createdAt:{gte:new Date(Date.now()-30*60_000)},OR:[{action:{contains:'certificate-number'}},{action:{contains:'organizations'}},{action:{contains:'identity'}}]},select:{action:true,details:true},take:3000,orderBy:{createdAt:'desc'}});
 const counts={};for(const row of rows){const d=row.details??{};const msg=String(d.message??'');const category=row.action.includes('certificate-number')?'number-check':row.action.includes('organizations')?'organizations':'identity';const reason=/видеопровер|видеоидентиф/i.test(msg)?'identity-required':/прав|доступ/i.test(msg)?'permission':/сесси|войд|Unauthorized/i.test(msg)?'session':/организ/i.test(msg)?'organization':'other';const key=category+':'+String(d.statusCode??'unknown')+':'+reason;counts[key]=(counts[key]??0)+1;}
 console.log(JSON.stringify({recentRequestStatusCounts:counts}));
})().catch(e=>{console.error(JSON.stringify({diagnosticFailed:true,code:e.code??null}));process.exitCode=1}).finally(()=>db.$disconnect());
