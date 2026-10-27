import { BadRequestException } from '@nestjs/common';

export const secondCylinderDocuments = ['cylinder_label_2', 'cylinder_work_record_2', 'cylinder_inspection_report_2'];
export type CylinderPairInput = { usesTwoCylinders?: boolean; secondCylinderSerial?: string | null };
export function cylinderPair(input: CylinderPairInput, primarySerial: string, previous?: CylinderPairInput) {
  const enabled = input.usesTwoCylinders ?? previous?.usesTwoCylinders ?? false;
  if (typeof enabled !== 'boolean') throw new BadRequestException('Некорректная отметка количества баллонов');
  if (!enabled) return { usesTwoCylinders: false, secondCylinderSerial: null };
  const value = input.secondCylinderSerial === undefined ? previous?.secondCylinderSerial : input.secondCylinderSerial;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new BadRequestException('Укажите номер второго баллона');
  const serial = value.trim();
  if (serial.toUpperCase() === primarySerial.trim().toUpperCase()) throw new BadRequestException('Номера первого и второго баллонов должны отличаться');
  return { usesTwoCylinders: true, secondCylinderSerial: serial };
}

export function activeCylinderPhotos<T extends { type: string; cylinderSerial?: string | null }>(inspection: CylinderPairInput, photos: T[]): T[] {
  return photos.filter(photo => !secondCylinderDocuments.includes(photo.type) || (inspection.usesTwoCylinders === true && photo.cylinderSerial === inspection.secondCylinderSerial));
}
