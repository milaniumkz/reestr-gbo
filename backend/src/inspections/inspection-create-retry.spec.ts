import {describe,it,expect,jest} from '@jest/globals';
import {BadRequestException,ForbiddenException} from '@nestjs/common';
import {InspectionsService} from './inspections.service';

const actor={sub:'inspector',phone:'test',roles:['inspection_org']};
const input={organizationId:'org',vehicleId:'vehicle',certificateNumber:'10801,10801.1',lat:43.2,lng:76.9};
function fixture(overrides:Record<string,unknown>={}){
 const draft={id:'existing',organizationId:'org',vehicleId:'vehicle',createdById:'inspector',certificateNumber:input.certificateNumber,status:'draft',lat:43.2,lng:76.9,address:'Алматы, место инспекции',...overrides};
 const db={organizationMember:{findMany:jest.fn(async()=>[{organizationId:'org'}])},
  certificate:{findUnique:jest.fn(async()=>null as unknown)},
  inspection:{findUnique:jest.fn(async()=>draft as unknown),create:jest.fn(async()=>({...draft,id:'new'}))},
  auditLog:{create:jest.fn(async()=>({}))}};
 const service=new InspectionsService(db as never,{} as never,{} as never);
 const update=jest.spyOn(service,'updateData').mockResolvedValue(draft as never);
 const geocode=jest.spyOn(service as any,'reverseGeocode').mockResolvedValue('Алматы, место инспекции');
 return {db,service,draft,update,geocode};
}
describe('retry inspection creation after a lost response',()=>{
 it('resumes the same inspector draft and keeps the composite certificate number',async()=>{
  const f=fixture();
  expect(await f.service.create(actor,input)).toMatchObject({id:'existing',status:'draft'});
  expect(f.update).toHaveBeenCalledWith(actor,'existing',expect.objectContaining(input));
  expect(f.db.inspection.create).not.toHaveBeenCalled();
  expect(f.geocode).not.toHaveBeenCalled();
  expect(f.db.auditLog.create).not.toHaveBeenCalled();
 });
 it.each([{createdById:'another-inspector'},{vehicleId:'another-vehicle'},{status:'submitted'},{status:'approved'},{status:'rejected'},{createdById:null}])('refuses to adopt an unrelated or sent record: %j',async(overrides)=>{
  const f=fixture(overrides);
  await expect(f.service.create(actor,input)).rejects.toBeInstanceOf(BadRequestException);
  expect(f.update).not.toHaveBeenCalled();expect(f.db.inspection.create).not.toHaveBeenCalled();
 });
 it('never resumes a draft with an issued certificate',async()=>{
  const f=fixture();f.db.certificate.findUnique.mockResolvedValue({id:'issued'});
  await expect(f.service.create(actor,input)).rejects.toThrow('уже есть');expect(f.update).not.toHaveBeenCalled();
 });
 it('still checks organization membership before resuming',async()=>{
  const f=fixture();f.db.organizationMember.findMany.mockResolvedValue([]);
  await expect(f.service.create(actor,input)).rejects.toBeInstanceOf(ForbiddenException);
  expect(f.db.inspection.findUnique).not.toHaveBeenCalled();
 });
 it('keeps the address requirement when resuming a legacy GPS-only record',async()=>{
  const f=fixture({address:'GPS 43.2,76.9'});
  jest.spyOn(f.service,'resolveLocation').mockRejectedValue(new BadRequestException('Адрес инспекции не определился'));
  await expect(f.service.create(actor,input)).rejects.toThrow('Адрес инспекции не определился');
  expect(f.update).not.toHaveBeenCalled();
 });
 it('propagates validation of changed cylinder data instead of ignoring it',async()=>{
  const f=fixture();f.update.mockRejectedValue(new BadRequestException('Заполните все данные второго баллона'));
  await expect(f.service.create(actor,{...input,usesTwoCylinders:true,secondCylinderSerial:'B'})).rejects.toThrow('второго баллона');
 });
 it('recovers when another identical request wins the unique-key race',async()=>{
  const f=fixture();f.db.inspection.findUnique.mockResolvedValueOnce(null);
  f.db.inspection.create.mockRejectedValue({code:'P2002',meta:{target:['organizationId','certificateNumber']}});
  expect(await f.service.create(actor,input)).toMatchObject({id:'existing'});
  expect(f.update).toHaveBeenCalledTimes(1);
  expect(f.db.auditLog.create).not.toHaveBeenCalled();
 });
 it('does not turn a competing inspector creation into a resumed draft',async()=>{
  const f=fixture({createdById:'another-inspector'});f.db.inspection.findUnique.mockResolvedValueOnce(null);
  f.db.inspection.create.mockRejectedValue({code:'P2002',meta:{target:['organizationId','certificateNumber']}});
  await expect(f.service.create(actor,input)).rejects.toThrow('уже есть');expect(f.update).not.toHaveBeenCalled();
 });
});
