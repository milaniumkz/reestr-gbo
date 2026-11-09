import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

// Unknown legacy shapes remain potential matches until explicitly corrected.
export async function assertCylinderAvailable(
  db: Pick<PrismaService, 'gasCylinder' | 'inspection'>,
  input: {serialNumber:string; manufacturer:string; shape?:string|null},
  vehicleId:string,
) {
  const serial = input.serialNumber.trim(), maker = input.manufacturer.trim();
  if (!serial || !maker) return;
  const serialFilter = {equals:serial,mode:'insensitive' as const};
  const manufacturer = {equals:maker,mode:'insensitive' as const};
  const [first,second] = await Promise.all([
    db.gasCylinder.findFirst({where:{serialNumber:serialFilter,manufacturer,vehicleId:{not:vehicleId},...(input.shape ? {OR:[{shape:input.shape},{shape:null}]} : {})},select:{id:true}}),
    db.inspection.findFirst({where:{usesTwoCylinders:true,secondCylinderSerial:serialFilter,secondCylinderManufacturer:manufacturer,vehicleId:{not:vehicleId},...(input.shape ? {OR:[{secondCylinderShape:input.shape},{secondCylinderShape:null}]} : {})},select:{id:true}}),
  ]);
  if (first || second) throw new BadRequestException('Баллон с таким номером, производителем и формой уже привязан к другому автомобилю. Если форма старой записи не указана, обратитесь к администратору');
}
