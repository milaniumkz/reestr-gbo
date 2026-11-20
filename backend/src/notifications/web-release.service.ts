import {BadRequestException,Injectable,Logger,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import webpush from 'web-push';
import {PrismaService} from '../prisma/prisma.service';
import {RequestUser} from '../common/current-user';
import {validPushEndpoint} from '../technical/technical-push.service';
import {encryptSecret,decryptSecret} from '../technical/technical-security';

const origins=new Set(['https://ersigbo.kz','https://89-207-255-42.sslip.io']);
const employeeRoles=['inspection_org','operator','nca','government','super_admin'];
export function releaseVersion(manifest:string,index:string):string|undefined {
  try {const {version}=JSON.parse(manifest);return /^[a-f0-9]{40}$/.test(version)&&index.includes(`name="ersi-release" content="${version}"`)?version:undefined;}catch{return undefined;}
}
export function validAppSubscription(body:any,origin:string){
 return origins.has(origin)&&validPushEndpoint(body?.subscription?.endpoint)&&
  Buffer.byteLength(body.subscription.endpoint,'utf8')<2000&&
  /^[-_A-Za-z0-9]{87}$/.test(body?.subscription?.keys?.p256dh??'')&&/^[-_A-Za-z0-9]{22}$/.test(body?.subscription?.keys?.auth??'');
}
@Injectable()
export class WebReleaseService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;
 private running=false;
 private announced?:string;
 private readonly logger=new Logger(WebReleaseService.name);
 constructor(private readonly db:PrismaService){}
 onModuleInit(){this.timer=setInterval(()=>void this.tick().catch(()=>this.logger.warn('Release notification dispatch unavailable')),15000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async version(){
  const file=process.env.WEB_RELEASE_FILE??'/opt/reestr/app/build/web/release.json';
  try{const [manifest,index]=await Promise.all([readFile(file,'utf8'),readFile(join(dirname(file),'index.html'),'utf8')]);return releaseVersion(manifest,index);}catch{return undefined;}
 }
 private async keys(){
  const key='app-web-push-vapid';
  let row=await this.db.technicalSetting.findUnique({where:{key}});
  if(!row){const generated=webpush.generateVAPIDKeys();row=await this.db.technicalSetting.upsert({where:{key},create:{key,value:{publicKey:generated.publicKey,privateKey:encryptSecret(generated.privateKey)},updatedBy:'system',reason:'Ключи уведомлений об обновлениях сайта'},update:{}});}
  const value=row.value as {publicKey:string;privateKey:string};
  return {publicKey:value.publicKey,privateKey:decryptSecret(value.privateKey)};
 }
 async config(user:RequestUser){
  const keys=await this.keys();
  return {publicKey:keys.publicKey,enabled:true,version:await this.version(),subscriptions:await this.db.webPushSubscription.findMany({where:{userId:user.sub,active:true},select:{endpoint:true,origin:true}})};
 }
 async subscribe(user:RequestUser,body:any,origin:string){
  if(!validAppSubscription(body,origin))throw new BadRequestException('Некорректная подписка браузера');
  const s=body.subscription;
  const existing=await this.db.webPushSubscription.findUnique({where:{endpoint:s.endpoint}});
  if((!existing||!existing.active||existing.userId!==user.sub)&&await this.db.webPushSubscription.count({where:{userId:user.sub,active:true}})>=10)throw new BadRequestException('Не более 10 браузеров для уведомлений');
  const version=await this.version();
  const data={userId:user.sub,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:encryptSecret(s.keys.auth),origin,language:body.language==='kk'?'kk':'ru',active:true,lastRelease:version??null,failures:0,nextAttemptAt:new Date()};
  await this.db.webPushSubscription.upsert({where:{endpoint:s.endpoint},create:data,update:data});
  return {ok:true};
 }
 async unsubscribe(user:RequestUser,body:any){
  await this.db.webPushSubscription.updateMany({where:{userId:user.sub,endpoint:String(body?.endpoint??'')},data:{active:false}});return {ok:true};
 }
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const version=await this.version();if(!version)return;
   if(this.announced!==version){
    const users=await this.db.user.findMany({where:{isBlocked:false,roles:{some:{role:{in:employeeRoles}}}},select:{id:true}});
    for(let i=0;i<users.length;i+=200)await this.db.notification.createMany({skipDuplicates:true,data:users.slice(i,i+200).map(user=>({dedupKey:`web-release:${version}:${user.id}`,userId:user.id,title:'Новая версия сайта',body:'Доступно обновление ЕРСИ ГБО. Если сайт открыт давно, сохраните работу и нажмите «Обновить страницу».',entity:'web_release',entityId:version}))});
    this.announced=version;
   }
   const now=new Date();
   const pending={active:true,user:{isBlocked:false},nextAttemptAt:{lte:now},OR:[{lastRelease:null},{lastRelease:{not:version}}]};
   const rows=await this.db.webPushSubscription.findMany({where:pending,orderBy:{nextAttemptAt:'asc'},take:40});
   if(!rows.length)return;
   const keys=await this.keys();
   for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(async row=>{
    const claimed=await this.db.webPushSubscription.updateMany({where:{id:row.id,...pending},data:{nextAttemptAt:new Date(Date.now()+120000)}});if(!claimed.count)return;
    try{
     if(!validPushEndpoint(row.endpoint))throw Object.assign(new Error('Invalid endpoint'),{statusCode:410});
     const kk=row.language==='kk';
     await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:decryptSecret(row.auth)}},JSON.stringify({type:'web_release',version,title:kk?'Сайттың жаңа нұсқасы':'Новая версия ЕРСИ ГБО',body:kk?'Сайтты ашып, бетті жаңартыңыз.':'Откройте сайт и обновите страницу.'}),{vapidDetails:{subject:'https://ersigbo.kz',...keys},TTL:604800,urgency:'normal',topic:'ersi-web-release',timeout:5000});
     await this.db.webPushSubscription.updateMany({where:{id:row.id,endpoint:row.endpoint,p256dh:row.p256dh,auth:row.auth,userId:row.userId,active:true},data:{lastRelease:version,failures:0,nextAttemptAt:new Date()}});
    }catch(error){
     const expired=[404,410].includes(Number((error as {statusCode?:number}).statusCode));
     await this.db.webPushSubscription.updateMany({where:{id:row.id,endpoint:row.endpoint,p256dh:row.p256dh,auth:row.auth,userId:row.userId,active:true},data:{active:!expired,failures:{increment:1},nextAttemptAt:new Date(Date.now()+Math.min(3600000,15000*2**Math.min(row.failures+1,8)))}});
    }
   }));
  }finally{this.running=false;}
 }
}
