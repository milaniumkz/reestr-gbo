'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const since=new Date(day+'T00:00:00+05:00');
 const counts=await db.inspectionPhoto.groupBy({by:['moderationStatus','moderationModel'],where:{type:{in:['cylinder_label','cylinder_label_2']},createdAt:{gte:since}},_count:{_all:true}});
 console.log(JSON.stringify({day,openaiKeyConfigured:!!process.env.OPENAI_API_KEY,mode:process.env.PHOTO_MODERATION_MODE??'auto',todayLabelCounts:counts}));
})().catch(()=>{console.error('Aggregate label diagnostics failed');process.exitCode=1}).finally(()=>db.$disconnect());
