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
  return photos.filter(photo => (!secondCylinderDocuments.includes(photo.type) || (inspection.usesTwoCylinders === true && photo.cylinderSerial === inspection.secondCylinderSerial)) && (!key(photo) || latest.get(key(photo)!) === photo));
}
