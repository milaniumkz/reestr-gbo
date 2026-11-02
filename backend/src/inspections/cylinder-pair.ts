import { BadRequestException } from '@nestjs/common';
import { cylinderProducedAt } from '../common/cylinder-date';
import { inspectionPeriod } from '../common/inspection-period';

export const secondCylinderDocuments = ['cylinder_label_2', 'cylinder_work_record_2', 'cylinder_inspection_report_2'];
export const allSecondCylinderDocuments = [...secondCylinderDocuments,'certificate_document_2'];
export type SecondCylinderInput = {manufacturer:string;volumeLiters:number;shape:string;producedAt:string};
export type CylinderPairInput = { usesTwoCylinders?: boolean; secondCylinderSerial?: string | null; secondCylinder?: SecondCylinderInput | null };
export type CylinderPairStored = Omit<CylinderPairInput,'secondCylinder'> & {
 secondCylinderManufacturer?:string|null;secondCylinderVolumeLiters?:number|null;secondCylinderShape?:string|null;secondCylinderProducedAt?:Date|null;secondCylinderInspectedAt?:Date|null;secondCylinderValidUntil?:Date|null;
};
const emptySecond = {secondQualityDocumentUploadedAt:null,secondCylinderManufacturer:null,secondCylinderVolumeLiters:null,secondCylinderShape:null,secondCylinderProducedAt:null,secondCylinderInspectedAt:null,secondCylinderValidUntil:null};
export function cylinderShape(value:unknown) {
 if(value === undefined || value === null) return undefined; // Preserve legacy clients.
 if(!['Тороидальный','Цилиндрический'].includes(String(value))) throw new BadRequestException('Выберите тип баллона: тороидальный либо цилиндрический');
 return String(value);
}
export function cylinderPair(input: CylinderPairInput, primarySerial: string, previous?: CylinderPairStored, inspectedAt?:Date|string, requireDetails=false, sharedFuelType?:string) {
  const enabled = input.usesTwoCylinders ?? previous?.usesTwoCylinders ?? false;
  if (typeof enabled !== 'boolean') throw new BadRequestException('Некорректная отметка количества баллонов');
  if (!enabled) return { usesTwoCylinders: false, secondCylinderSerial: null, ...emptySecond };
  const value = input.secondCylinderSerial === undefined ? previous?.secondCylinderSerial : input.secondCylinderSerial;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new BadRequestException('Укажите номер второго баллона');
  const serial = value.trim();
  if (serial.toUpperCase() === primarySerial.trim().toUpperCase()) throw new BadRequestException('Номера первого и второго баллонов должны отличаться');
  const details=input.secondCylinder;
  if(details == null) {
    if(requireDetails || (previous?.secondCylinderManufacturer && serial!==previous.secondCylinderSerial)) throw new BadRequestException('Заполните все данные второго баллона. Обновите приложение или используйте веб-версию');
    // Legacy update: retain known fields, never copy the first cylinder's values.
    const period = previous?.secondCylinderManufacturer && inspectedAt && sharedFuelType ? inspectionPeriod(sharedFuelType,inspectedAt) : undefined;
    return {usesTwoCylinders:true,secondCylinderSerial:serial,...(period ? {secondCylinderInspectedAt:period.inspectedAt,secondCylinderValidUntil:period.validUntil} : {})};
  }
  const text=(value:unknown,label:string)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>200) throw new BadRequestException('Заполните: '+label+' второго баллона');return value.trim();};
  const manufacturer=text(details.manufacturer,'производитель');
  if(!Number.isInteger(details.volumeLiters)||details.volumeLiters<=0||details.volumeLiters>10000) throw new BadRequestException('Укажите положительный объем второго баллона');
  const shape=cylinderShape(details.shape);
  if(!shape) throw new BadRequestException('Выберите тип второго баллона');
  const period=inspectionPeriod(sharedFuelType??'',inspectedAt??previous?.secondCylinderInspectedAt??new Date());
  return {usesTwoCylinders:true,secondCylinderSerial:serial,secondQualityDocumentUploadedAt:serial===previous?.secondCylinderSerial?undefined:null,secondCylinderManufacturer:manufacturer,secondCylinderVolumeLiters:details.volumeLiters,secondCylinderShape:shape,secondCylinderProducedAt:cylinderProducedAt(details.producedAt),secondCylinderInspectedAt:period.inspectedAt,secondCylinderValidUntil:period.validUntil};
}

export function activeCylinderPhotos<T extends { type: string; cylinderSerial?: string | null; checksum?: string | null; createdAt?: Date | string }>(inspection: CylinderPairInput, photos: T[]): T[] {
  // Keep the latest exact copy in each document slot. Different documents,
  // cylinder serials and images without a checksum must remain independent.
  const latest = new Map<string, T>();
  const key = (photo: T) => photo.checksum
    ? JSON.stringify([photo.type, photo.cylinderSerial ?? null, photo.checksum])
    : undefined;
  for (const photo of photos) {
    const identity = key(photo);
    if (!identity) continue;
    const previous = latest.get(identity);
    if (!previous || new Date(photo.createdAt ?? 0).getTime() > new Date(previous.createdAt ?? 0).getTime()) latest.set(identity, photo);
  }
  return photos.filter(photo => (!allSecondCylinderDocuments.includes(photo.type) || (inspection.usesTwoCylinders === true && photo.cylinderSerial === inspection.secondCylinderSerial)) && (!key(photo) || latest.get(key(photo)!) === photo));
}
