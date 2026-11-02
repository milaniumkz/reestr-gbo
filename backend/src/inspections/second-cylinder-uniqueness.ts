import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { CylinderPairStored } from './cylinder-pair';
export async function assertSecondCylinderUnique(db: Pick<PrismaService,'gasCylinder'|'inspection'>,pair:CylinderPairStored,vehicleId:string) {
 if(!pair.usesTwoCylinders || !pair.secondCylinderSerial || !pair.secondCylinderManufacturer) return;
 const serial={equals:pair.secondCylinderSerial,mode:'insensitive' as const},manufacturer={equals:pair.secondCylinderManufacturer,mode:'insensitive' as const};
 const [first,second]=await Promise.all([
  db.gasCylinder.findFirst({where:{serialNumber:serial,manufacturer,vehicleId:{not:vehicleId}},select:{id:true}}),
  db.inspection.findFirst({where:{usesTwoCylinders:true,secondCylinderSerial:serial,secondCylinderManufacturer:manufacturer,vehicleId:{not:vehicleId}},select:{id:true}}),
 ]);
 if(first || second) throw new BadRequestException('Второй баллон уже привязан к другому автомобилю');
}
