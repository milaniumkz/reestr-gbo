'use strict';
const fs=require('node:fs');
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[process.cwd()]}));
const bcrypt=require(require.resolve('bcryptjs',{paths:[process.cwd()]}));
const db=new PrismaClient();
(async()=>{
 const v=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 if(!/^\+7\d{10}$/.test(v.phone)||!/^\d{12}$/.test(v.bin)||typeof v.password!=='string'||v.password.length<12||Buffer.byteLength(v.password)>72)throw Error('Invalid test-account configuration');
 const name='ТЕСТОВЫЙ ИО — проверка функций';const fullName='Тестовый руководитель ЕРСИ ГБО';
 const hash=await bcrypt.hash(v.password,12);
 await db.$transaction(async tx=>{
  const previousOrg=await tx.organization.findUnique({where:{bin:v.bin}});
  const previousUser=await tx.user.findUnique({where:{phone:v.phone}});
  if(previousOrg&&previousOrg.name!==name)throw Error('Test BIN is already assigned');
  if(previousUser&&previousUser.fullName!==fullName)throw Error('Test phone is already assigned');
  if(previousUser){const others=await tx.organizationMember.findMany({where:{userId:previousUser.id}});if(others.some(m=>m.organizationId!==previousOrg?.id))throw Error('Account belongs to another organization');}
  const org=previousOrg??await tx.organization.create({data:{type:'inspection_org',name,bin:v.bin,status:'active',region:'Астана',address:'Тестовая запись — не использовать для реальных инспекций'}});
  const user=previousUser??await tx.user.create({data:{phone:v.phone,fullName,passwordHash:hash,mustChangePassword:false}});
  if(previousUser&&!await bcrypt.compare(v.password,previousUser.passwordHash))throw Error('Existing test account password differs; no reset performed');
  await tx.userRole.upsert({where:{userId_role:{userId:user.id,role:'inspection_org'}},update:{},create:{userId:user.id,role:'inspection_org'}});
  await tx.organizationMember.upsert({where:{organizationId_userId_role:{organizationId:org.id,userId:user.id,role:'admin'}},update:{},create:{organizationId:org.id,userId:user.id,role:'admin'}});
  await tx.balance.upsert({where:{organizationId:org.id},update:{},create:{organizationId:org.id,amount:0,currency:'KZT'}});
  await tx.auditLog.create({data:{action:'support.test_manager.provision',entity:'organization',entityId:org.id,metadata:{source:'owner-requested-test-account',role:'admin'}}});
  console.log(JSON.stringify({testManagerReady:true,organizationId:org.id,userId:user.id,realOrganizationsUnchanged:true}));
 });
})().catch(()=>{console.error('Test manager provisioning failed without changing real accounts');process.exitCode=1;}).finally(()=>db.$disconnect());
