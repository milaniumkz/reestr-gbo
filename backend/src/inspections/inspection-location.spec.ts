import {describe,it,expect,jest} from '@jest/globals';
import {InspectionsService} from './inspections.service';

function fixture() {
 const db={organization:{findUnique:jest.fn(async()=>({address:'Астана, Карталы 5/2'}))},certificate:{findUnique:jest.fn(async()=>null)},inspection:{findUnique:jest.fn(async()=>null),create:jest.fn(async({data}:any)=>({id:'inspection',...data}))},auditLog:{create:jest.fn(async()=>({}))}};
 const service=new InspectionsService(db as never,{} as never,{} as never);
 return {db,service};
}
const user={sub:'admin',phone:'test',roles:['super_admin']};
const input={organizationId:'org',vehicleId:'vehicle',certificateNumber:'10425',lat:49.9431171,lng:82.6561906,address:'Астана, подставленный адрес'};
describe('Actual inspection location',()=>{
 it('resolves address from GPS and ignores organization/client address',async()=>{
  const f=fixture();const lookup=jest.spyOn(f.service as any,'reverseGeocode').mockResolvedValue('Өскемен, фактическое место');
  expect(await f.service.create(user,input)).toMatchObject({address:'Өскемен, фактическое место',lat:input.lat,lng:input.lng});
  expect(lookup).toHaveBeenCalledWith(input.lat,input.lng);
  expect(f.db.organization.findUnique).not.toHaveBeenCalled();
  expect(f.db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:expect.objectContaining({addressSource:'reverse_geocoding'})})}));
 });
 it('keeps actual coordinates when reverse geocoding is unavailable, never the office address',async()=>{
  const f=fixture();jest.spyOn(f.service as any,'reverseGeocode').mockResolvedValue(undefined);
  expect(await f.service.create(user,input)).toMatchObject({address:'GPS: 49.943117, 82.656191'});
 });
 it.each([{lat:undefined},{lng:undefined},{lat:91},{lng:181},{lat:''},{lat:NaN}])('rejects absent or invalid GPS: %p',async bad=>{
  const f=fixture();await expect(f.service.create(user,{...input,...bad})).rejects.toThrow('место проведения инспекции');
  expect(f.db.inspection.create).not.toHaveBeenCalled();
 });
 it('clears geocoding timeout and treats network failure as unavailable',async()=>{
  const f=fixture();const original=global.fetch;
  global.fetch=jest.fn(async()=>{throw new Error('offline')}) as never;
  try{expect(await (f.service as any).reverseGeocode(input.lat,input.lng)).toBeUndefined();}finally{global.fetch=original;}
 });
});
