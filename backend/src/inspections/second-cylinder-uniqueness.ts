import type { PrismaService } from '../prisma/prisma.service';
import type { CylinderPairStored } from './cylinder-pair';
import { assertCylinderAvailable } from './cylinder-uniqueness';
export async function assertSecondCylinderUnique(db: Pick<PrismaService,'gasCylinder'|'inspection'>,pair:CylinderPairStored,vehicleId:string) {
 if(!pair.usesTwoCylinders || !pair.secondCylinderSerial || !pair.secondCylinderManufacturer) return;
 await assertCylinderAvailable(db,{serialNumber:pair.secondCylinderSerial,manufacturer:pair.secondCylinderManufacturer,shape:pair.secondCylinderShape},vehicleId);
}
