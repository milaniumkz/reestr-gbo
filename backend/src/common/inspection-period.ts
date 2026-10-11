import { BadRequestException } from '@nestjs/common';
export function inspectionPeriod(fuelType: string, inspectedAt: string | Date) {
  const fuel = fuelType.trim().toUpperCase();
  const normalized = ['СНГ', 'LPG'].includes(fuel) ? 'СНГ' : ['КПГ', 'CNG'].includes(fuel) ? 'КПГ' : null;
  if (!normalized) throw new BadRequestException('Укажите тип газа: СНГ или КПГ');
  const date = inspectedAt instanceof Date ? new Date(inspectedAt) : new Date(inspectedAt);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Некорректная дата инспекции');
  const validUntil = new Date(date);
  const month = date.getUTCMonth();
  validUntil.setUTCFullYear(date.getUTCFullYear() + (normalized === 'СНГ' ? 2 : 3));
  if (validUntil.getUTCMonth() !== month) validUntil.setUTCDate(0);
  return { fuelType: normalized, inspectedAt: date, validUntil };
}
