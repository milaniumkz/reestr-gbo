import { BadRequestException } from '@nestjs/common';

export function cylinderProducedAt(value?: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Укажите полную дату выпуска баллона');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==value || date.getUTCFullYear()<1900 || date > new Date()) throw new BadRequestException('Некорректная дата выпуска баллона');
  return date;
}
