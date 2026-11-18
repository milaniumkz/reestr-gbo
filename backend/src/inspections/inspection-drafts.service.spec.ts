import {describe,it,expect,jest} from '@jest/globals';
import {InspectionDraftsService} from './inspection-drafts.service';
import {InspectionDraftsController} from './inspection-drafts.controller';
const id='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222';
const actor={sub:'inspector-a',phone:'+77000000000',roles:['inspection_org']};
function fixture(){
 let row:any=null,role='inspector',member=true;
 const db:any={user:{findUnique:jest.fn(async()=>({isBlocked:false,roles:[{role:'inspection_org'}],memberships:[{role}]}))},organizationMember:{findFirst:jest.fn(async()=>member?{}:null)},inspectionDraft:{
  findFirst:jest.fn(async({where}:any)=>row?.id===where.id&&row.userId===where.userId?structuredClone(row):null),
  create:jest.fn(async({data}:any)=>{if(row)throw Object.assign(new Error('exists'),{code:'P2002'});row={...data,version:1,files:{},updatedAt:new Date()};return structuredClone(row)}),
  updateMany:jest.fn(async({where,data}:any)=>{if(!row||row.id!==where.id||row.userId!==where.userId||row.version!==where.version)return{count:0};row={...row,...data,version:row.version+1};return{count:1}}),
  findMany:jest.fn(async()=>row?[row]:[]),deleteMany:jest.fn(async({where}:any)=>{if(row?.id===where.id&&row.userId===where.userId)row=null;return{count:1}})},inspection:{create:jest.fn(),update:jest.fn()}};
 const blobs=new Map<string,Buffer>();const storage:any={putObject:jest.fn(async(v:any)=>{blobs.set(v.key,Buffer.from(v.body));return{id:'file'}}),readObject:jest.fn(async(key:string)=>blobs.get(key))};
 const moderation:any={check:jest.fn(async()=>({moderationStatus:'manual_review'}))};
 const service=new InspectionDraftsService(db,storage,moderation);
 const fields={screen:18,organizationId:org,ownerName:'Partial owner',localDraftId:id};
 return {service,db,storage,moderation,fields,blobs,setRole:(v:string)=>{role=v},setMember:(v:boolean)=>{member=v},create:()=>service.save(actor,id,{organizationId:org,version:0,fields})};
}
describe('Private server inspection drafts',()=>{
 it('saves incomplete fields without creating/sending an inspection',async()=>{const f=fixture();expect(await f.create()).toMatchObject({userId:actor.sub,version:1,fields:{screen:18}});expect(f.db.inspection.create).not.toHaveBeenCalled();expect(f.db.inspection.update).not.toHaveBeenCalled();});
 it('enforces owner isolation for reads, files and deletion',async()=>{const f=fixture();await f.create();const other={...actor,sub:'inspector-b'};await expect(f.service.detail(other,id)).rejects.toThrow('не найден');await expect(f.service.file(other,id,'primary_tech')).rejects.toThrow('не найден');await expect(f.service.remove(other,id)).rejects.toThrow('не найден');expect(await f.service.detail(actor,id)).toHaveProperty('version',1);});
 it.each(['quality_control','admin'])('refuses %s accounts even inside the same organization',async role=>{const f=fixture();f.setRole(role);await expect(f.create()).rejects.toThrow('только инспектору');expect(f.db.inspectionDraft.create).not.toHaveBeenCalled();});
 it('refuses inactive or unrelated organization membership',async()=>{const f=fixture();f.setMember(false);await expect(f.create()).rejects.toThrow('Нет доступа');});
 it('rejects stale writes from another device without overwriting the newer form',async()=>{const f=fixture();await f.create();await f.service.save(actor,id,{organizationId:org,version:1,fields:{...f.fields,ownerName:'new'}});await expect(f.service.save(actor,id,{organizationId:org,version:1,fields:{...f.fields,ownerName:'stale'}})).rejects.toThrow('другом устройстве');expect((await f.service.detail(actor,id)).fields).toMatchObject({ownerName:'new'});});
 it('rejects duplicate UUID creation instead of replacing another draft',async()=>{const f=fixture();await f.create();await expect(f.create()).rejects.toThrow('другом устройстве');});
 it('never accepts authentication data, an unknown step, or user-controlled file paths',async()=>{const f=fixture();for(const fields of [{...f.fields,password:'private'},{...f.fields,files:{path:'/etc/passwd'}},{...f.fields,screen:99}])await expect(f.service.save(actor,id,{organizationId:org,version:0,fields})).rejects.toThrow();expect(f.db.inspectionDraft.create).not.toHaveBeenCalled();});
 it('stores and returns the original photo, verifies its checksum and avoids duplicate storage',async()=>{const f=fixture();await f.create();const file={buffer:Buffer.from('original-photo-data'),originalname:'original.jpg',mimetype:'image/jpeg'};
  const row=await f.service.upload(actor,id,'primary_tech',1,file);expect(row.version).toBe(2);expect((await f.service.file(actor,id,'primary_tech')).buffer.equals(file.buffer)).toBe(true);
  await f.service.upload(actor,id,'primary_tech',2,file);expect(f.storage.putObject).toHaveBeenCalledTimes(1);expect(f.moderation.check).toHaveBeenCalledWith(file.buffer,'original.jpg','tech_passport');
  f.blobs.set((row.files as any).primary_tech.objectKey,Buffer.from('tampered'));await expect(f.service.file(actor,id,'primary_tech')).rejects.toThrow('повреждён');
 });
 it('does not store a rejected photo or update its draft',async()=>{const f=fixture();await f.create();f.moderation.check.mockRejectedValue(new Error('screen detected'));await expect(f.service.upload(actor,id,'primary_cylinder',1,{buffer:Buffer.from('screen'),originalname:'x.jpg',mimetype:'image/jpeg'})).rejects.toThrow('screen detected');expect(f.storage.putObject).not.toHaveBeenCalled();expect(f.db.inspectionDraft.updateMany).not.toHaveBeenCalled();});
 it('lists drafts only in the authenticated owner namespace and removes only that owner record',async()=>{const f=fixture();await f.create();await f.service.list(actor);expect(f.db.inspectionDraft.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({userId:actor.sub})}));await f.service.remove(actor,id);await expect(f.service.detail(actor,id)).rejects.toThrow('не найден');});
 it('attaches staged originals through normal inspection authorization and screening',async()=>{const draft:any={file:jest.fn(async()=>({file:{name:'tag.jpg',mime:'image/jpeg'},buffer:Buffer.from('original')}))};const inspections:any={uploadPhoto:jest.fn(async()=>({ok:true}))};const controller=new InspectionDraftsController(draft,inspections);await controller.attach(actor,id,'inspection-id',{type:'primary_cylinder',lat:43,lng:76});expect(inspections.uploadPhoto).toHaveBeenCalledWith('inspection-id','cylinder_label',expect.objectContaining({buffer:Buffer.from('original')}),actor,{lat:43,lng:76});});
});
