'use strict';
// Run by the support workflow; personal data comes from its private payload, not Git.
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {PrismaClient} = require(require.resolve('@prisma/client', {paths:[process.cwd()]}));
const digest = value => createHash('sha256').update(value).digest('hex');
const db = new PrismaClient();
function check(condition, message) { if (!condition) throw new Error(message); }
async function snapshot(tx, id) {
  const user = await tx.user.findUniqueOrThrow({where:{id}});
  const roles = await tx.userRole.findMany({where:{userId:id},orderBy:{id:'asc'}});
  const memberships = await tx.organizationMember.findMany({where:{userId:id},orderBy:{id:'asc'}});
  const inspections = await tx.inspection.findMany({where:{OR:['createdById','submittedById','approvedById','qualityReviewerId','qualityConfirmedById'].map(key=>({[key]:id}))},select:{id:true,createdById:true,submittedById:true,approvedById:true,qualityReviewerId:true,qualityConfirmedById:true},orderBy:{id:'asc'}});
  return {user, roles, memberships, inspections};
}
(async()=>{
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const mode = process.argv[3];
  check(['inspect','apply'].includes(mode), 'Invalid mode');
  check(Array.isArray(payload) && payload.length > 0 && payload.length <= 20, 'Invalid batch size');
  check(new Set(payload.map(x=>x.id)).size === payload.length, 'Duplicate accounts');
  check(new Set(payload.map(x=>x.newPhone)).size === payload.length, 'Duplicate destination numbers');
  for (const row of payload) {
    check(/^[a-f0-9-]{36}$/.test(row.id), 'Invalid account ID');
    check(/^\+7\d{10}$/.test(row.newPhone), 'Invalid destination phone');
    check(/^[a-f0-9]{64}$/.test(row.identityHash), 'Missing verified identity');
  }
  const result = await db.$transaction(async tx=>{
    const report=[];
    for (const row of [...payload].sort((a,b)=>a.id.localeCompare(b.id))) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.id},1))`;
      // Lock account rows against concurrent edits as well as password changes.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${row.id} FOR UPDATE`;
      const before = await snapshot(tx,row.id);
      check(digest(before.user.fullName+'|'+before.user.phone.slice(-4))===row.identityHash || before.user.phone===row.newPhone, 'Account identity changed; inspect again');
      check(before.memberships.some(m=>m.organizationId===row.organizationId && m.role==='inspector'), 'Confirmed organization membership missing');
      const conflict=await tx.user.findUnique({where:{phone:row.newPhone},select:{id:true}});
      check(!conflict || conflict.id===row.id, 'Destination phone is already assigned');
      const changed=before.user.phone!==row.newPhone;
      if (mode==='apply' && changed) {
        await tx.user.update({where:{id:row.id},data:{phone:row.newPhone,passwordVersion:{increment:1}}});
        await tx.session.updateMany({where:{userId:row.id,revokedAt:null},data:{revokedAt:new Date()}});
        await tx.passwordRecovery.updateMany({where:{userId:row.id,usedAt:null},data:{usedAt:new Date()}});
        await tx.passwordRecoveryRequest.updateMany({where:{userId:row.id,status:'pending'},data:{status:'completed'}});
        await tx.auditLog.create({data:{action:'user.phone.change',entity:'user',entityId:row.id,metadata:{source:'user-authorized-support',changed:true,oldPhoneHash:digest(before.user.phone),newPhoneHash:digest(row.newPhone),reason:'Employee login phone corrected at account owner request'}}});
        const after=await snapshot(tx,row.id);
        const stable = user=>Object.fromEntries(Object.entries(user).filter(([key])=>!['phone','passwordVersion','updatedAt'].includes(key)));
        check(JSON.stringify(stable(before.user))===JSON.stringify(stable(after.user)), 'Account data preservation failed');
        for(const key of ['roles','memberships','inspections']) check(JSON.stringify(before[key])===JSON.stringify(after[key]),'Linked records preservation failed');
        check(after.user.phone===row.newPhone && after.user.passwordVersion===before.user.passwordVersion+1, 'Phone verification failed');
      }
      report.push({account:row.id,mode,changed:mode==='apply'&&changed,needsChange:changed,inspectionReferences:before.inspections.length,passwordPreserved:true,linkedRecordsPreserved:true});
    }
    return report;
  },{timeout:60000});
  console.log(JSON.stringify({mode,accounts:result.length,results:result}));
})().catch(error=>{console.error(error.code==='P2002'?'Phone conflict; batch rolled back':error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
