import { ConflictException } from '@nestjs/common';

export function certificateNumberConflict(error: unknown): never {
  const value = error as { code?: string; meta?: { target?: unknown } };
  const target = Array.isArray(value?.meta?.target) ? value.meta.target.join(',') : String(value?.meta?.target ?? '');
  if (value?.code === 'P2002' && (target.includes('certificateNumber') || (target.includes('organizationId') && target.includes('number')))) {
    throw new ConflictException('Свидетельство с таким номером уже есть в этом инспекционном органе');
  }
  throw error;
}
