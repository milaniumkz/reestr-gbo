import { BadRequestException } from '@nestjs/common';

export type OwnerIdentity = { kind?: string; bin?: string; iin?: string };

export function ownerIdentity(input: OwnerIdentity) {
  const kind = input.kind ?? 'individual';
  if (!['individual', 'legal_entity'].includes(kind)) {
    throw new BadRequestException('Выберите физическое или юридическое лицо');
  }
  if (kind === 'legal_entity') {
    const bin = typeof input.bin === 'string' ? input.bin.trim() : '';
    if (!/^\d{12}$/.test(bin)) throw new BadRequestException('Введите БИН из 12 цифр');
    return { kind, bin, iin: null };
  }
  return { kind, bin: null, iin: input.iin?.trim() || null };
}
