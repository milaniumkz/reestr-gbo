#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?}" 'cd /opt/reestr/app/backend; set -a; source .env; set +a; node' <<'NODE'
const {PrismaClient}=require('@prisma/client');
const {createHash}=require('node:crypto');
const db=new PrismaClient({log:[]});
(async()=>{
 const phones=await db.user.findMany({select:{id:true,phone:true}});
 const target=phones.find(u=>createHash('sha256').update(u.phone).digest('hex')==='f71f7dc2951f16db99b5bbe1f8e0151b80e1392eba29fe8ed2f8aad6bb55eeb0');
 if(!target){console.log(JSON.stringify({found:false}));return;}
 const user=await db.user.findUniqueOrThrow({where:{id:target.id},select:{isBlocked:true,memberships:{select:{role:true,organization:{select:{status:true}}}}}});
 console.log(JSON.stringify({found:true,qualityControl:user.memberships.some(m=>m.role==='quality_control'),inspector:user.memberships.some(m=>['inspector','inspection_org'].includes(m.role)),manager:user.memberships.some(m=>m.role==='admin'),blocked:user.isBlocked,activeQualityMembership:user.memberships.some(m=>m.role==='quality_control'&&m.organization.status==='active')}));
})().catch(()=>{console.error('Read-only role lookup failed');process.exitCode=1}).finally(()=>db.$disconnect());
NODE
