import {describe,it,expect,jest,beforeEach,afterEach} from '@jest/globals';
import webpush from 'web-push';
import {WebReleaseService,releaseVersion,validAppSubscription} from './web-release.service';
import {encryptSecret} from '../technical/technical-security';
const version='a'.repeat(40),origin='https://ersigbo.kz';
const actor={sub:'user',phone:'test',roles:['inspection_org']};
const body={subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'x'.repeat(87),auth:'a'.repeat(22)}},language:'kk'};
let previous:string|undefined;
beforeEach(()=>{previous=process.env.TECH_PANEL_ENCRYPTION_KEY;process.env.TECH_PANEL_ENCRYPTION_KEY='a'.repeat(64);});
afterEach(()=>{if(previous===undefined)delete process.env.TECH_PANEL_ENCRYPTION_KEY;else process.env.TECH_PANEL_ENCRYPTION_KEY=previous;jest.restoreAllMocks();});
function fixture(){
 const row={id:'sub',userId:'user',...body.subscription,origin,language:'ru',p256dh:'x'.repeat(87),auth:encryptSecret('a'.repeat(22)),failures:0};
 const db={user:{findMany:jest.fn(async()=>[{id:'user'}])},notification:{createMany:jest.fn(async()=>({count:1}))},technicalSetting:{findUnique:jest.fn(async()=>null as any),upsert:jest.fn(async(args:any)=>args.create)},webPushSubscription:{findUnique:jest.fn(async()=>null as any),count:jest.fn(async()=>0),findMany:jest.fn(async(args:any)=>args.select?[{endpoint:row.endpoint,origin}]:[row]),upsert:jest.fn(async()=>({id:'sub'})),updateMany:jest.fn(async()=>({count:1}))}};
 const service=new WebReleaseService(db as never);jest.spyOn(service,'version').mockResolvedValue(version);
 const keys=jest.spyOn(service as any,'keys').mockResolvedValue({publicKey:'public',privateKey:'private'});
 const send=jest.spyOn(webpush,'sendNotification').mockResolvedValue({statusCode:201,body:'',headers:{}});
 return {service,db,row,keys,send};
}
describe('published web release announcements',()=>{
 it('accepts only a matching complete entrypoint and release manifest',()=>{
  expect(releaseVersion(JSON.stringify({version}),`<meta name="ersi-release" content="${version}">`)).toBe(version);
  for(const manifest of ['bad',JSON.stringify({version:'bad'}),JSON.stringify({version})])expect(releaseVersion(manifest,'old index')).toBeUndefined();
 });
 it.each(['http://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x'])('rejects untrusted push endpoints %s',endpoint=>{expect(validAppSubscription({...body,subscription:{...body.subscription,endpoint}},origin)).toBe(false);});
 it('requires a known app origin and valid key lengths',()=>{
  expect(validAppSubscription(body,origin)).toBe(true);
  expect(validAppSubscription(body,'https://other.test')).toBe(false);
  expect(validAppSubscription({...body,subscription:{...body.subscription,keys:{auth:'bad',p256dh:'bad'}}},origin)).toBe(false);
 });
 it('binds subscriptions to the signed-in user and encrypts the auth secret',async()=>{
  const f=fixture();await f.service.subscribe(actor,body,origin);
  const data=f.db.webPushSubscription.upsert.mock.calls[0][0] as any;
  expect(data.create).toMatchObject({userId:actor.sub,origin,language:'kk',lastRelease:version});
  expect(data.create.auth).not.toBe(body.subscription.keys.auth);
 });
 it('limits newly registered browsers and reactivation without deleting existing devices',async()=>{
  const f=fixture();f.db.webPushSubscription.count.mockResolvedValue(10);
  await expect(f.service.subscribe(actor,body,origin)).rejects.toThrow('10');
  f.db.webPushSubscription.findUnique.mockResolvedValue({userId:actor.sub,active:false});
  await expect(f.service.subscribe(actor,body,origin)).rejects.toThrow('10');
  f.db.webPushSubscription.findUnique.mockResolvedValue({userId:actor.sub,active:true});
  expect(await f.service.subscribe(actor,body,origin)).toEqual({ok:true});
 });
 it('unsubscribe is scoped to the requesting account',async()=>{
  const f=fixture();await f.service.unsubscribe(actor,{endpoint:body.subscription.endpoint});
  expect(f.db.webPushSubscription.updateMany).toHaveBeenCalledWith({where:{userId:actor.sub,endpoint:body.subscription.endpoint},data:{active:false}});
 });
 it('creates private unread announcements with stable per-user deduplication',async()=>{
  const f=fixture();await f.service.tick();await f.service.tick();
  expect(f.db.notification.createMany).toHaveBeenCalledTimes(1);
  expect(f.db.notification.createMany).toHaveBeenCalledWith({skipDuplicates:true,data:[expect.objectContaining({userId:'user',dedupKey:`web-release:${version}:user`,entity:'web_release',entityId:version})]});
 });
 it('sends only public release data and acknowledges delivery after success',async()=>{
  const f=fixture();await f.service.tick();
  const args=f.send.mock.calls[0];expect(JSON.parse(args[1]!)).toMatchObject({type:'web_release',version});
  expect(args[1]).not.toContain('userId');expect(args[1]).not.toContain('endpoint');
  expect(args[2]).toMatchObject({TTL:604800,timeout:5000,topic:'ersi-web-release'});
  expect(f.db.webPushSubscription.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({userId:'user',active:true,auth:f.row.auth}),data:expect.objectContaining({lastRelease:version,failures:0})}));
 });
 it('does not send if another worker already claimed the subscription',async()=>{
  const f=fixture();f.db.webPushSubscription.updateMany.mockResolvedValue({count:0});await f.service.tick();expect(f.send).not.toHaveBeenCalled();
 });
 it.each([404,410])('disables expired subscription for status %s',async(statusCode)=>{
  const f=fixture();f.send.mockRejectedValue({statusCode});await f.service.tick();
  expect(f.db.webPushSubscription.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({active:false,failures:{increment:1}})}));
 });
 it('retries temporary delivery errors without marking the release delivered',async()=>{
  const f=fixture();f.send.mockRejectedValue({statusCode:503});await f.service.tick();
  const last=(f.db.webPushSubscription.updateMany.mock.calls.at(-1)?.[0] as any).data;
  expect(last).not.toHaveProperty('lastRelease');expect(last.active).toBe(true);expect(last.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
 });
 it('skips partial or missing published releases',async()=>{
  const f=fixture();jest.spyOn(f.service,'version').mockResolvedValue(undefined);await f.service.tick();expect(f.db.user.findMany).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
 });
 it('exposes only a public VAPID key and encrypted storage for private material',async()=>{
  const f=fixture();f.keys.mockRestore();const config=await f.service.config(actor);
  expect(config.publicKey).toHaveLength(87);expect(config).not.toHaveProperty('privateKey');
  const stored=f.db.technicalSetting.upsert.mock.calls[0][0] as any;expect(stored.create.value.privateKey).not.toHaveLength(43);
 });
});
