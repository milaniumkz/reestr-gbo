#!/usr/bin/env bash
set -euo pipefail
SERVER="${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST is required}"
APP_DIR="${APP_DIR:-/opt/reestr/app}"
ssh "$SERVER" "cd '$APP_DIR/backend'; set -a; . ./.env; set +a; node" <<'NODE'
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const db=new PrismaClient();
(async()=>{
 const users=await db.user.findMany({select:{id:true,passwordHash:true,mustChangePassword:true,passwordChangedAt:true,isBlocked:true,lastLoginAt:true}});
 const report={total:users.length,temporaryPassword:0,temporaryWithoutRequirement:0,personalWithRequirement:0,requirement:0,changed:0,activeSessionsRequiringChange:0};
 for(const u of users){const temporary=await bcrypt.compare('123456',u.passwordHash);report.temporaryPassword+=Number(temporary);report.temporaryWithoutRequirement+=Number(temporary&&!u.mustChangePassword);report.personalWithRequirement+=Number(!temporary&&u.mustChangePassword);report.requirement+=Number(u.mustChangePassword);report.changed+=Number(!!u.passwordChangedAt);}
 report.activeSessionsRequiringChange=await db.session.count({where:{revokedAt:null,expiresAt:{gt:new Date()},user:{mustChangePassword:true}}});
 console.log(JSON.stringify(report));
})().catch(()=>{console.error('Password diagnostics failed');process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
