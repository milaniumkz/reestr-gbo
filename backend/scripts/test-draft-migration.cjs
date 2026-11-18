'use strict';
const assert=require('node:assert/strict');
if(process.env.DRAFT_MIGRATION_TEST!=='isolated-only'||!/^postgresql:\/\/[^/]+@127\.0\.0\.1:5432\/migration_test(?:\?|$)/.test(process.env.DATABASE_URL||''))throw Error('Ephemeral CI database required');
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
 await db.$transaction(async tx=>{
  const user=await tx.user.create({data:{phone:'+70000000001',fullName:'Isolated migration test'}});
  const org=await tx.organization.create({data:{type:'inspection_org',name:'Isolated migration org',bin:'000000000001'}});
  const draft=await tx.inspectionDraft.create({data:{userId:user.id,organizationId:org.id,fields:{screen:15,ownerName:'Partial'}}});
  assert.equal(draft.version,1);assert.deepEqual(draft.files,{});
  await tx.inspectionDraft.update({where:{id:draft.id},data:{version:{increment:1}}});
  assert.equal((await tx.inspectionDraft.findUnique({where:{id:draft.id}})).version,2);
  await tx.user.delete({where:{id:user.id}});
  assert.equal(await tx.inspectionDraft.count({where:{id:draft.id}}),0);
  await tx.organization.delete({where:{id:org.id}});
 });
 console.log('Ephemeral PostgreSQL migration, defaults and ownership cascade verified');
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());
