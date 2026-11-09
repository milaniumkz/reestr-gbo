import {jest} from '@jest/globals';
import {assertCylinderAvailable} from './cylinder-uniqueness';
import {requiredCylinderShape} from './cylinder-pair';

describe('Cylinder identity includes shape',()=>{
 it.each(['Тороидальный','Цилиндрический',null])('compares a cylindrical 358 with existing shape %s',async shape=>{
  const findFirst=jest.fn(async (args:any)=>args.where.OR.some((v:any)=>v.shape===shape)?{id:'existing'}:null);
  const db={gasCylinder:{findFirst},inspection:{findFirst:jest.fn(async()=>null)}};
  const result=assertCylinderAvailable(db as never,{serialNumber:'358',manufacturer:'Балсити',shape:'Цилиндрический'},'new-vehicle');
  if(shape==='Тороидальный') await expect(result).resolves.toBeUndefined();
  else await expect(result).rejects.toThrow('другому автомобилю');
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({vehicleId:{not:'new-vehicle'}})}));
 });
 it('checks the second-cylinder slot with the same shape rule',async()=>{
  const second=jest.fn(async()=>({id:'second'}));
  await expect(assertCylinderAvailable({gasCylinder:{findFirst:jest.fn(async()=>null)},inspection:{findFirst:second}} as never,{serialNumber:'358',manufacturer:'Балсити',shape:'Цилиндрический'},'new')).rejects.toThrow('другому автомобилю');
  expect(second).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{secondCylinderShape:'Цилиндрический'},{secondCylinderShape:null}]})}));
 });
 it.each([undefined,null,'','не указан'])('requires a valid shape: %s',value=>{
  expect(()=>requiredCylinderShape(value)).toThrow('Выберите тип баллона');
 });
});
