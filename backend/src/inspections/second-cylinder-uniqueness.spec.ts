import {jest} from '@jest/globals';
import {assertSecondCylinderUnique} from './second-cylinder-uniqueness';
describe('Second cylinder assignment',()=>{
 it.each(['first','second'])('rejects a cylinder already used as the %s cylinder of another car',async slot=>{
  const db={gasCylinder:{findFirst:jest.fn(async()=>slot==='first'?{id:'other'}:null)},inspection:{findFirst:jest.fn(async()=>slot==='second'?{id:'other'}:null)}};
  await expect(assertSecondCylinderUnique(db as never,{usesTwoCylinders:true,secondCylinderSerial:'CYL',secondCylinderManufacturer:'MAKER'},'vehicle')).rejects.toThrow('другому автомобилю');
  expect(db.inspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({vehicleId:{not:'vehicle'}})}));
 });
});
