import { describe, expect, it, jest } from '@jest/globals';
import { VehiclesService } from './vehicles.service';

describe('Inspection vehicle owner data', () => {
  it.each([undefined, '', 'не указан'])('rejects an absent or invalid gas type before saving any data: %s', async fuelType => {
    const prisma = {vehicle:{upsert:jest.fn()}};
    await expect(new VehiclesService(prisma as never).create({vin:'VIN',plateNumber:'123',make:'Toyota',model:'Camry',owner:{phone:'',fullName:'Владелец'},cylinder:{serialNumber:'CYL',manufacturer:'Atiker',volumeLiters:54,producedAt:'2024-07-15',fuelType,validUntil:'2028-10-13'}})).rejects.toThrow('Укажите тип газа');
    expect(prisma.vehicle.upsert).not.toHaveBeenCalled();
  });
  it.each([false, true])('saves owner data without creating or changing accounts (existing owner: %s)', async existing => {
    const prisma = {
      user: {upsert:jest.fn(),create:jest.fn(),update:jest.fn()},
      userRole: {upsert:jest.fn(),create:jest.fn()},
      vehicle: {upsert:jest.fn(async()=>({id:'vehicle',vin:'VIN',plateNumber:'123'})),findUniqueOrThrow:jest.fn(async()=>({id:'vehicle'}))},
      vehicleOwner: {findFirst:jest.fn(async()=>existing ? {id:'owner'} : null),update:jest.fn(async()=>({})),create:jest.fn(async()=>({}))},
      gasCylinder: {findFirst:jest.fn(async()=>null),create:jest.fn(async()=>({}))},
      auditLog: {create:jest.fn(async()=>({}))},
    };
    await new VehiclesService(prisma as never).create({vin:'VIN',plateNumber:'123',make:'Toyota',model:'Camry',owner:{phone:'8 (701) 111-22-33',fullName:'Владелец',address:'Адрес'},cylinder:{serialNumber:'CYL',manufacturer:'Atiker',volumeLiters:54,producedAt:'2024-07-15',fuelType:'СНГ',validUntil:'2028-10-13'}});
    const write = existing ? prisma.vehicleOwner.update : prisma.vehicleOwner.create;
    expect(write).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({phone:'+77011112233',fullName:'Владелец',address:'Адрес'})}));
    expect(prisma.gasCylinder.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({producedAt:new Date('2024-07-15T00:00:00.000Z')})}));
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect(prisma.userRole.create).not.toHaveBeenCalled();
  });
});
