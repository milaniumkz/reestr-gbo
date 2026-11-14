'use strict';
const {PrismaClient}=require('/opt/reestr/app/backend/node_modules/@prisma/client');
const {isInspectorSubject,IDENTITY_SETTING}=require('/opt/reestr/app/backend/dist/src/identity/identity-policy');
const db=new PrismaClient({log:[]});
const operation=process.argv[2];
(async()=>{
 if(!['status','activate','deactivate','pilot'].includes(operation))throw Error('Unsupported operation');
 if(operation==='status'){
  const setting=await db.technicalSetting.findUnique({where:{key:IDENTITY_SETTING}});
  console.log(JSON.stringify({enabled:setting?.value===true,profiles:await db.inspectorIdentityProfile.count()}));return;
 }
 if(operation==='activate'||operation==='pilot'){
  const health=await fetch('http://127.0.0.1:8091/health',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  if(!health.ready||!health.liveness)throw Error('Identity engine is not ready');
  const fs=require('node:fs');
  const release=JSON.parse(fs.readFileSync('/opt/reestr/app/build/web/release.json','utf8'));
  const version=fs.readFileSync('/opt/reestr/app/VERSION','utf8').trim();
  if(release.version!==version||!fs.existsSync('/opt/reestr/app/build/web/face-guide/guide.js'))throw Error('Deploy matching backend and web before activation');
 }
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(8121401)`;
  const before=await tx.technicalSetting.findUnique({where:{key:IDENTITY_SETTING}});
  if(operation==='activate'&&before?.value===true){console.log('Already enabled; sessions retained');return;}
  let revoked=0;
  if(operation==='pilot') {
   if(before?.value===true)throw Error('Global policy already enabled');
   const id=process.argv[3];if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Select an inspector UUID');
   const user=await tx.user.findUniqueOrThrow({where:{id},select:{id:true,roles:{select:{role:true}},memberships:{select:{role:true}}}});
   if(!isInspectorSubject(user))throw Error('Selected account is exempt');
   const value={pilotUserIds:[id]};
   await tx.technicalSetting.upsert({where:{key:IDENTITY_SETTING},create:{key:IDENTITY_SETTING,value,updatedBy:'deployment',reason:'Owner-requested trial on own inspector account'},update:{value,updatedBy:'deployment',reason:'Owner-requested trial on own inspector account'}});
   revoked=(await tx.session.updateMany({where:{userId:id,revokedAt:null,expiresAt:{gt:new Date()}},data:{revokedAt:new Date()}})).count;
   await tx.auditLog.create({data:{action:'inspector.identity.pilot',entity:'setting',entityId:IDENTITY_SETTING,metadata:{revokedSessions:revoked}}});
   console.log(JSON.stringify({pilotEnabled:true,revokedInspectorSessions:revoked,otherAccountsUnchanged:true}));return;
  }
  if(operation==='activate'){
   const users=await tx.user.findMany({where:{memberships:{some:{role:{in:['inspector','inspection_org']}}}},select:{id:true,roles:{select:{role:true}},memberships:{select:{role:true}}}});
   const ids=users.filter(isInspectorSubject).map(u=>u.id);
   if(ids.length)revoked=(await tx.session.updateMany({where:{userId:{in:ids},revokedAt:null,expiresAt:{gt:new Date()}},data:{revokedAt:new Date()}})).count;
  }
  await tx.technicalSetting.upsert({where:{key:IDENTITY_SETTING},create:{key:IDENTITY_SETTING,value:operation==='activate',updatedBy:'deployment',reason:'Owner-approved inspector-only video identity rollout'},update:{value:operation==='activate',updatedBy:'deployment',reason:'Owner-approved inspector-only video identity rollout'}});
  await tx.auditLog.create({data:{action:'inspector.identity.'+operation,entity:'setting',entityId:IDENTITY_SETTING,metadata:{revokedSessions:revoked,workflowRun:process.env.GITHUB_RUN_ID}}});
  console.log(JSON.stringify({enabled:operation==='activate',revokedInspectorSessions:revoked,otherRolesUnchanged:true}));
 });
})().catch(()=>{console.error('Identity operation failed; no automatic bypass');process.exitCode=1}).finally(()=>db.$disconnect());
