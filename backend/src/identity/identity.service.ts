import {BadRequestException,ConflictException,ForbiddenException,Injectable,OnModuleDestroy,OnModuleInit,UnauthorizedException} from '@nestjs/common';
import {createHash,randomBytes,randomInt} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {RequestUser} from '../common/current-user';
import {enforceRateLimit} from '../technical/rate-limit';
import {IdentityEngine} from './identity-engine';
import {IdentityVault} from './identity-vault';
import {IDENTITY_CONSENT,IDENTITY_SETTING,isInspectorSubject,similarity,repeatedVideo,confidentRecoveryMotion} from './identity-policy';
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const failure='Видеопроверка не пройдена. Запишите новое видео по подсказкам.';
@Injectable()
export class InspectorIdentityService implements OnModuleInit,OnModuleDestroy {
 readonly vault=new IdentityVault();private timer?:ReturnType<typeof setInterval>;
 constructor(private readonly prisma:PrismaService,private readonly engine:IdentityEngine){}
 async onModuleInit(){await this.vault.init();if(process.env.NODE_ENV!=='test'){this.timer=setInterval(()=>void this.maintenance().catch(()=>{}),60_000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async status(actor:RequestUser){
  const user=await this.prisma.user.findUniqueOrThrow({where:{id:actor.sub},include:{roles:true,memberships:{select:{role:true}},identityProfile:{select:{enrolledAt:true}}}});
  const enabled=(await this.prisma.technicalSetting.findUnique({where:{key:IDENTITY_SETTING}}))?.value===true;
  const session=actor.sid?await this.prisma.session.findUnique({where:{id:actor.sid}}):null;
  const required=enabled&&isInspectorSubject(user);
  return {required,verified:!required||!!session?.identityVerifiedAt,enrolled:!!user.identityProfile,consentVersion:IDENTITY_CONSENT,engineReady:required?await this.engine.ready():true};
 }
 private async session(actor:RequestUser){
  const s=actor.sid?await this.prisma.session.findUnique({where:{id:actor.sid},include:{user:true}}):null;
  if(!s||s.userId!==actor.sub||s.revokedAt||s.expiresAt<=new Date()||s.user.isBlocked||s.user.mustChangePassword||s.user.passwordVersion!==actor.pv)throw new UnauthorizedException('Войдите заново');
  return s;
 }
 async challenge(actor:RequestUser,consentVersion:string){
  if(consentVersion!==IDENTITY_CONSENT)throw new BadRequestException('Подтвердите согласие на обработку биометрических данных');
  const status=await this.status(actor);await this.session(actor);
  if(!status.required||status.verified)throw new ConflictException('Видеопроверка для этого сеанса не требуется');
  if(!status.engineReady)throw new ConflictException('Видеопроверка временно недоступна. Повторите позже.');
  await enforceRateLimit(this.prisma,'identity-challenge:'+actor.sub,20,600);
  const pool=['TURN_LEFT','TURN_RIGHT','LOOK_UP','OPEN_MOUTH','BLINK'];
  for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  const actions=pool.slice(0,status.enrolled?3:2),secret=randomBytes(32).toString('base64url');
  const row=await this.prisma.inspectorIdentityChallenge.create({data:{userId:actor.sub,sessionId:actor.sid!,passwordVersion:actor.pv!,secretHash:hash(secret),purpose:status.enrolled?'LOGIN':'ENROLL',actions,consentVersion,expiresAt:new Date(Date.now()+5*60_000)}});
  return {challengeId:row.id,challengeToken:secret,actions,recordingSeconds:2+actions.length*6,expiresAt:row.expiresAt};
 }
 private async challengeRow(actor:RequestUser,id:string,secret:string){
  await this.session(actor);
  if(!/^[a-f0-9-]{36}$/i.test(id)||typeof secret!=='string'||secret.length>100)throw new UnauthorizedException();
  const row=await this.prisma.inspectorIdentityChallenge.findFirst({where:{id,userId:actor.sub,sessionId:actor.sid,passwordVersion:actor.pv,secretHash:hash(secret)}});
  if(!row)throw new UnauthorizedException();return row;
 }
 async result(actor:RequestUser,id:string,secret:string){
  const c=await this.challengeRow(actor,id,secret);
  return {status:c.status,message:c.status==='VERIFIED'?'Личность подтверждена.':c.reason??(c.status==='PROCESSING'?'Проверяем запись…':undefined)};
 }
 private async reject(actor:RequestUser,id:string,reason:string,video:Buffer){
  const path=await this.vault.write(actor.sub,video);
  try{const changed=await this.prisma.inspectorIdentityChallenge.updateMany({where:{id,status:'PROCESSING'},data:{status:'REJECTED',reason:reason.slice(0,500),videoPath:path,completedAt:new Date()}});if(!changed.count)await this.vault.remove(actor.sub,path);}
  catch(error){await this.vault.remove(actor.sub,path);throw error;}
  return {status:'REJECTED',message:reason};
 }
 async submit(actor:RequestUser,id:string,secret:string,video:Buffer){
  const c=await this.challengeRow(actor,id,secret);
  if(c.status!=='READY'||c.expiresAt<=new Date())throw new ConflictException('Задание истекло или уже использовано. Начните новую запись.');
  if(!video||video.length<10_000||video.length>16*1024*1024)throw new BadRequestException('Запишите видео с камеры, не более 16 МБ');
  await enforceRateLimit(this.prisma,'identity-submit:'+actor.sub,10,600);
  try{const claimed=await this.prisma.inspectorIdentityChallenge.updateMany({where:{id,status:'READY',expiresAt:{gt:new Date()}},data:{status:'PROCESSING',videoDigest:this.vault.digest('video:'+hash(video))}});if(claimed.count!==1)throw new ConflictException('Запись уже обрабатывается');}
  catch(error:any){if(error.code==='P2002')throw new ForbiddenException('Эта запись уже использовалась. Снимите новое видео.');throw error;}
  let result;
  try{result=await this.engine.verify(video,c.actions as string[]);}catch(error){await this.prisma.inspectorIdentityChallenge.updateMany({where:{id,status:'PROCESSING'},data:{status:'FAILED',reason:'Сервис видеопроверки недоступен. Повторите запись.',completedAt:new Date()}});throw error;}
  await this.session(actor);
  if(result.verdict==='REJECT')return this.reject(actor,id,result.reason||failure,video);
  const previous=await this.prisma.inspectorIdentityChallenge.findMany({where:{userId:actor.sub,id:{not:id},videoSignature:{not:null},createdAt:{gte:new Date(Date.now()-7*86400000)}},select:{videoSignature:true},take:100});
  if(previous.some(p=>repeatedVideo(result.videoSignature!,JSON.parse(this.vault.open(Buffer.from(p.videoSignature!,'base64'),actor.sub).toString()))))return this.reject(actor,id,'Повтор ранее использованной записи. Снимите новое видео.',video);
  let verdict=result.verdict;
  const profile=await this.prisma.inspectorIdentityProfile.findUnique({where:{userId:actor.sub}});
  if(c.purpose==='LOGIN'){
   if(!profile||profile.model!==result.model)return this.reject(actor,id,'Эталон недоступен. Обратитесь к администратору.',video);
   const score=similarity(JSON.parse(this.vault.open(Buffer.from(profile.template,'base64'),actor.sub).toString()),result.embedding!);
   if(score<.45)return this.reject(actor,id,'Лицо не совпадает с эталоном владельца аккаунта.',video);
   if(score<.60)return this.reject(actor,id,'Недостаточно уверенное совпадение. Повторите запись при ровном освещении.',video);
   if(confidentRecoveryMotion(result,score))verdict='PASS';
  }
  if(verdict!=='PASS')return this.reject(actor,id,result.reason||failure,video);
  let referencePath:string|undefined,videoPath:string|undefined;
  try{
   if(c.purpose==='ENROLL'){
    referencePath=await this.vault.write(actor.sub,Buffer.from(result.reference!,'base64'));
    videoPath=await this.vault.write(actor.sub,video);
   }
   await this.prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.sub}, 812))`;
    const session=await tx.session.findUniqueOrThrow({where:{id:actor.sid},include:{user:true}});
    if(session.revokedAt||session.expiresAt<=new Date()||session.user.isBlocked||session.user.mustChangePassword||session.user.passwordVersion!==c.passwordVersion)throw new UnauthorizedException();
    const current=await tx.inspectorIdentityProfile.findUnique({where:{userId:actor.sub}});
    if(c.purpose==='ENROLL'){
     if(current)throw new ConflictException('Эталон уже создан. Выполните новую проверку входа.');
     await tx.inspectorIdentityProfile.create({data:{userId:actor.sub,template:this.vault.seal(Buffer.from(JSON.stringify(result.embedding)),actor.sub).toString('base64'),referencePath:referencePath!,referenceVideoPath:videoPath!,model:result.model,consentVersion:IDENTITY_CONSENT}});
    }else if(!current||current.enrolledAt.getTime()!==profile!.enrolledAt.getTime())throw new ConflictException('Эталон изменился. Войдите заново.');
    const changed=await tx.inspectorIdentityChallenge.updateMany({where:{id,status:'PROCESSING'},data:{status:'VERIFIED',completedAt:new Date(),videoSignature:this.vault.seal(Buffer.from(JSON.stringify(result.videoSignature)),actor.sub).toString('base64')}});
    if(changed.count!==1)throw new ConflictException('Проверка уже завершена');
    await tx.session.update({where:{id:actor.sid},data:{identityVerifiedAt:new Date()}});
    await tx.auditLog.create({data:{actorId:actor.sub,action:'inspector.identity.verified',entity:'session',entityId:actor.sid,metadata:{purpose:c.purpose,consentVersion:IDENTITY_CONSENT}}});
   });
  }catch(error){await Promise.allSettled([...(referencePath?[this.vault.remove(actor.sub,referencePath)]:[]),...(videoPath?[this.vault.remove(actor.sub,videoPath)]:[])]);throw error;}
  return {status:'VERIFIED',message:'Личность подтверждена.'};
 }
 async adminStatus(userId:string){
  const [profile,rows]=await Promise.all([
   this.prisma.inspectorIdentityProfile.findUnique({where:{userId},select:{enrolledAt:true}}),
   this.prisma.inspectorIdentityChallenge.findMany({where:{userId},orderBy:{createdAt:'desc'},take:30,select:{id:true,status:true,purpose:true,reason:true,createdAt:true,videoPath:true}}),
  ]);
  return {enrolled:!!profile,enrolledAt:profile?.enrolledAt,history:rows.map(({videoPath,...r})=>({...r,hasVideo:!!videoPath}))};
 }
 async adminVideo(actor:RequestUser,userId:string,challengeId?:string){
  let path:string|undefined;
  if(challengeId){const row=await this.prisma.inspectorIdentityChallenge.findFirst({where:{id:challengeId,userId}});path=row?.videoPath??undefined;}
  else path=(await this.prisma.inspectorIdentityProfile.findUnique({where:{userId}}))?.referenceVideoPath;
  if(!path)throw new BadRequestException('Видеозапись недоступна');
  const video=await this.vault.read(userId,path);
  await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'inspector.identity.video.view',entity:'user',entityId:userId}});
  return video;
 }
 async reset(actor:RequestUser,userId:string,reason:string){
  if(!reason?.trim()||reason.trim().length>500)throw new BadRequestException('Укажите причину сброса');
  const oldFiles:string[]=[];
  await this.prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},812))`;
   const old=await tx.inspectorIdentityProfile.findUnique({where:{userId}});
   if(old)oldFiles.push(old.referencePath,old.referenceVideoPath);
   await tx.inspectorIdentityProfile.deleteMany({where:{userId}});
   await tx.session.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
   await tx.inspectorIdentityChallenge.updateMany({where:{userId,status:{in:['READY','PROCESSING']}},data:{status:'EXPIRED',reason:'Привязка сброшена администратором'}});
   await tx.auditLog.create({data:{actorId:actor.sub,action:'inspector.identity.reset',entity:'user',entityId:userId,metadata:{reason:reason.trim()}}});
  });
  await Promise.allSettled(oldFiles.map(path=>this.vault.remove(userId,path)));
  return {ok:true};
 }
 async maintenance(){
  await this.prisma.inspectorIdentityChallenge.updateMany({where:{status:{in:['READY','PROCESSING']},expiresAt:{lt:new Date()}},data:{status:'EXPIRED',reason:'Срок проверки истёк'}});
  const expired=await this.prisma.inspectorIdentityChallenge.findMany({where:{createdAt:{lt:new Date(Date.now()-7*86400000)},videoPath:{not:null}},take:50});
  for(const row of expired){await this.vault.remove(row.userId,row.videoPath!);await this.prisma.inspectorIdentityChallenge.update({where:{id:row.id},data:{videoPath:null,videoSignature:null}});}
 }
}
