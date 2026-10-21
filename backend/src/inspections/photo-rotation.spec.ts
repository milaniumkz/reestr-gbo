import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { InspectionsService } from './inspections.service';
const user = {sub:'quality',phone:'+77000000000',roles:['inspection_org']};
const photo = {id:'p1',inspectionId:'i1',type:'cylinder_work_record',objectKey:'inspections/i1/original.png',moderationStatus:'manual_review',lat:51,lng:71};
async function setup(options: {member?:boolean;owner?:string;status?:string;input?:Buffer;conflict?:boolean;missing?:boolean}={}) {
 const input=options.input ?? await sharp({create:{width:2,height:3,channels:3,background:'white'}}).composite([{input:Buffer.from([255,0,0]),raw:{width:1,height:1,channels:3},left:0,top:0}]).png().toBuffer();
 const updated={...photo};let output:Buffer=Buffer.alloc(0);
 const tx={inspection:{updateMany:jest.fn(async()=>({count:1}))},inspectionPhoto:{updateMany:jest.fn(async(q:any)=>{Object.assign(updated,q.data);return {count:options.conflict?0:1};}),findUniqueOrThrow:jest.fn(async()=>updated)},auditLog:{create:jest.fn(async()=>({}))}};
 const prisma={inspection:{findUnique:jest.fn(async()=>({id:'i1',organizationId:'org1',status:options.status??'submitted',qualityReviewerId:options.owner??user.sub}))},organizationMember:{findMany:jest.fn(async()=>[{organizationId:'org1'}]),findFirst:jest.fn(async()=>options.member===false?null:{role:'quality_control'})},inspectionPhoto:{findFirst:jest.fn(async()=>options.missing?null:photo)},$transaction:async(fn:any)=>fn(tx)};
 const storage={readObject:jest.fn(async()=>input),putObject:jest.fn(async(q:any)=>{output=q.body;return {id:'stored'};}),objectUrl:(key:string)=>({url:'/private/'+key})};
 return {service:new InspectionsService(prisma as never,storage as never,{} as never),storage,tx,input,get output(){return output;}};
}
describe('quality photo rotation',()=>{
 it('turns pixels clockwise, preserves identity/moderation/GPS and audits the original',async()=>{
  const h=await setup();const result=await h.service.rotatePhoto('i1','p1',1,photo.objectKey,user);
  const pixels=await sharp(h.output).removeAlpha().raw().toBuffer({resolveWithObject:true});
  expect([pixels.info.width,pixels.info.height]).toEqual([3,2]);expect([...pixels.data.subarray(6,9)]).toEqual([255,0,0]);
  expect(result).toMatchObject({id:'p1',moderationStatus:'manual_review',lat:51,lng:71});expect(result.objectKey).not.toBe(photo.objectKey);expect(result.checksum).toBe(createHash('sha256').update(h.output).digest('hex'));
  expect(h.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId:'quality',action:'inspection.photo.rotate',metadata:expect.objectContaining({turns:1,previousObjectKey:photo.objectKey})})}));
 });
 it('four saved left turns preserve every decoded pixel',async()=>{
  let h=await setup();const original=await sharp(h.input).removeAlpha().raw().toBuffer();
  for(let n=0;n<4;n++){await h.service.rotatePhoto('i1','p1',-1,photo.objectKey,user);h=await setup({input:h.output});}
  expect(await sharp(h.input).removeAlpha().raw().toBuffer()).toEqual(original);
 });
 it('normalizes EXIF before applying the requested visible turn',async()=>{
  const input=await sharp({create:{width:20,height:30,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer();const h=await setup({input});await h.service.rotatePhoto('i1','p1',1,photo.objectKey,user);
  const meta=await sharp(h.output).metadata();expect([meta.width,meta.height]).toEqual([20,30]);expect(meta.orientation).toBeUndefined();
 });
 it.each([{member:false,error:ForbiddenException},{owner:'other',error:ConflictException},{status:'approved',error:ConflictException},{missing:true,error:NotFoundException}])('rejects unauthorized or unavailable photos: %j',async options=>{
  const h=await setup(options);await expect(h.service.rotatePhoto('i1','p1',1,photo.objectKey,user)).rejects.toThrow(options.error);expect(h.storage.putObject).not.toHaveBeenCalled();
 });
 it('rejects stale clients before reading storage',async()=>{
  const h=await setup();await expect(h.service.rotatePhoto('i1','p1',1,'old-key',user)).rejects.toThrow(ConflictException);expect(h.storage.readObject).not.toHaveBeenCalled();
 });
 it('rejects concurrent updates without recording successful rotation',async()=>{
  const h=await setup({conflict:true});await expect(h.service.rotatePhoto('i1','p1',1,photo.objectKey,user)).rejects.toThrow(ConflictException);expect(h.tx.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects PDF and invalid turn values',async()=>{
  const h=await setup({input:Buffer.from('%PDF-1.4 document')});await expect(h.service.rotatePhoto('i1','p1',1,photo.objectKey,user)).rejects.toThrow(BadRequestException);expect(h.storage.putObject).not.toHaveBeenCalled();await expect(h.service.rotatePhoto('i1','p1',90,photo.objectKey,user)).rejects.toThrow(BadRequestException);
 });
});
