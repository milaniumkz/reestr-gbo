import { BadRequestException } from '@nestjs/common';

export function ownerPhone(value?: string | null): string | null {
  if (!value?.trim() || value.startsWith('owner:')) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new BadRequestException('Проверьте телефон владельца');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}
