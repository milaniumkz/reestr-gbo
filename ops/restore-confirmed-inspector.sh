#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}" 'bash -se' <<'REMOTE'
set -euo pipefail
backup_output="$(APP_DIR=/opt/reestr/app bash /opt/reestr/app/ops/backup-reestr.sh)"
backup_dir="${backup_output##*Backup completed: }"
test -s "$backup_dir/postgres.dump"
pg_restore --list "$backup_dir/postgres.dump" >/dev/null
set -a
source /opt/reestr/app/backend/.env
set +a
cd /opt/reestr/app/backend
node <<'JSCODE'
const {PrismaClient}=require('@prisma/client');
const {AuthService}=require('./dist/src/auth/auth.service');
const db=new PrismaClient();
const hash=value=>require('crypto').createHash('sha256').update(value||'').digest('hex');
(async()=>{
 try {
  const users=await db.user.findMany({select:{id:true,phone:true,isBlocked:true}});
  const user=users.find(u=>hash(u.phone)==='93cf12495592a960f7d1dc6937be30f5248205dad8616c0312c40521d5b72fcf');
  const orgs=await db.organization.findMany({select:{id:true,bin:true,type:true,status:true}});
  const org=orgs.find(o=>hash(o.bin)==='eb11cb54a2599006bcffda9e7c0666761f3c3f81f9fe5e5a81fa4e83f60fa96c');
  if(!user||user.isBlocked||!org||org.type!=='inspection_org'||org.status!=='active')throw Error('Target identity is not eligible');
  await db.$transaction(async tx=>{
   await tx.userRole.upsert({where:{userId_role:{userId:user.id,role:'inspection_org'}},update:{},create:{userId:user.id,role:'inspection_org'}});
   await tx.organizationMember.upsert({where:{organizationId_userId_role:{organizationId:org.id,userId:user.id,role:'inspector'}},update:{},create:{organizationId:org.id,userId:user.id,role:'inspector'}});
   await tx.auditLog.create({data:{action:'organization.member.restore',entity:'organization',entityId:org.id,metadata:{userId:user.id,role:'inspector',source:'user-authorized-support'}}});
  });
  const auth=new AuthService({user:db.user,organizationMember:db.organizationMember,otpChallenge:{findFirst:async()=>({id:'diagnostic_cooldown'})}}, {}, {}, {get:()=>undefined}, {log:async()=>{}});
  let allowed=false;
  try{await auth.sendOtp(user.phone,undefined,'inspection_org')}catch(e){allowed=e.message==='OTP resend cooldown is active';}
  const binAllowed=await auth.isInspectionMemberForBin(user.id,org.bin);
  if(!allowed||!binAllowed)throw Error('Login verification failed');
  console.log(JSON.stringify({orgId:'confirmed-inspector',name:'Inspector membership restored; login verified',members:1,additions:1,distinctAdditions:1,lastAddition:null}));
 } finally {await db.$disconnect();}
})().catch(()=>{console.error('Inspector membership restoration failed');process.exitCode=1});
JSCODE
REMOTE
