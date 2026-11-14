import {describe,it,expect,jest} from '@jest/globals';
import {InspectorIdentityService} from './identity.service';
import {createHash} from 'node:crypto';
const actor={sub:'a',sid:'s',pv:1,phone:'+7',roles:['inspection_org']},vector=[1,...Array(127).fill(0)];
function fixture(purpose='ENROLL'){
 const secret='secret',now=new Date();let profile:any=purpose==='LOGIN'?{userId:'a',template:'template',model:'model',enrolledAt:now}:null;
 const row:any={id:'11111111-1111-4111-8111-111111111111',userId:'a',sessionId:'s',passwordVersion:1,secretHash:createHash('sha256').update(secret).digest('hex'),status:'READY',expiresAt:new Date(Date.now()+60_000),actions:['BLINK','TURN_LEFT'],purpose};
 const session:any={id:'s',userId:'a',revokedAt:null,expiresAt:new Date(Date.now()+60_000),user:{isBlocked:false,mustChangePassword:false,passwordVersion:1},identityVerifiedAt:null};
 const db:any={technicalRateLimit:{upsert:jest.fn(async()=>({count:1}))},session:{findUnique:jest.fn(async()=>session),findUniqueOrThrow:jest.fn(async()=>session),update:jest.fn(async({data}:any)=>Object.assign(session,data))},inspectorIdentityProfile:{findUnique:jest.fn(async()=>profile),create:jest.fn(async({data}:any)=>{profile={...data,enrolledAt:now};return profile;})},inspectorIdentityChallenge:{findFirst:jest.fn(async({where}:any)=>where.sessionId==='s'&&where.secretHash===row.secretHash?row:null),findMany:jest.fn(async()=>[]),updateMany:jest.fn(async({where,data}:any)=>{if(where.status!==row.status)return{count:0};Object.assign(row,data);return{count:1};})},auditLog:{create:jest.fn(async()=>({}))},$executeRaw:jest.fn(async()=>1)};
 db.$transaction=jest.fn(async(fn:any)=>fn(db));
 const engine:any={verify:jest.fn(async()=>({verdict:'PASS',model:'model',reference:Buffer.from('photo').toString('base64'),embedding:vector,videoSignature:Array(40).fill('0123456789abcdef')}))};
 const service=new InspectorIdentityService(db,engine);
 service.vault.digest=()=> 'video-hash';service.vault.seal=()=>Buffer.from('encrypted');service.vault.open=()=>Buffer.from(JSON.stringify(vector));service.vault.write=jest.fn(async()=> '11111111-1111-4111-8111-111111111111.bin');service.vault.remove=jest.fn(async()=>{});
 return {service,db,engine,row,session,secret};
}
describe('Session-bound video proof',()=>{
 it('enrolls once and verifies only the current session',async()=>{const f=fixture();await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).resolves.toMatchObject({status:'VERIFIED'});expect(f.db.inspectorIdentityProfile.create).toHaveBeenCalledTimes(1);expect(f.db.session.update).toHaveBeenCalledWith({where:{id:'s'},data:{identityVerifiedAt:expect.any(Date)}});});
 it('compares a new login without replacing the template',async()=>{const f=fixture('LOGIN');await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).resolves.toMatchObject({status:'VERIFIED'});expect(f.db.inspectorIdentityProfile.create).not.toHaveBeenCalled();});
 it('rejects a different face',async()=>{const f=fixture('LOGIN');f.engine.verify.mockResolvedValue({verdict:'PASS',model:'model',embedding:[0,1,...Array(126).fill(0)],videoSignature:Array(40).fill('0123456789abcdef')});await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).resolves.toMatchObject({status:'REJECTED'});expect(f.db.session.update).not.toHaveBeenCalled();});
 it('rejects another session',async()=>{const f=fixture();await expect(f.service.submit({...actor,sid:'other'},f.row.id,f.secret,Buffer.alloc(10001))).rejects.toThrow();expect(f.engine.verify).not.toHaveBeenCalled();});
 it.each(['VERIFIED','EXPIRED'])('does not reuse a %s challenge',async status=>{const f=fixture();f.row.status=status;await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).rejects.toThrow();expect(f.engine.verify).not.toHaveBeenCalled();});
 it('fails closed when the engine is unavailable',async()=>{const f=fixture();f.engine.verify.mockRejectedValue(new Error('offline'));await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).rejects.toThrow();expect(f.db.session.update).not.toHaveBeenCalled();expect(f.row.status).toBe('FAILED');});
 it('does not grant a revoked session access after processing',async()=>{const f=fixture();f.engine.verify.mockImplementation(async()=>{f.session.revokedAt=new Date();return {verdict:'PASS'};});await expect(f.service.submit(actor,f.row.id,f.secret,Buffer.alloc(10001))).rejects.toThrow();expect(f.db.session.update).not.toHaveBeenCalled();});
});
