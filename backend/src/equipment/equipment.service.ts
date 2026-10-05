import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const equipmentTypes = ['reducer', 'control_unit', 'cylinder_manufacturer'] as const;

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList() {
    const items = await this.prisma.gboEquipmentItem.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return { items };
  }

  async list() {
    const items = await this.prisma.gboEquipmentItem.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return { items, total: items.length, page: 1, limit: 200 };
  }

  async create(input: { type?: string; name?: string }) {
    const type = this.type(input.type);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Введите название оборудования');
    return this.prisma.gboEquipmentItem.upsert({
      where: { type_name: { type, name } },
      update: { isActive: true },
      create: { type, name },
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.exists(id);
    return this.prisma.gboEquipmentItem.update({
      where: { id },
      data: { isActive },
    });
  }

  async update(id: string, input: { type?: string; name?: string }) {
    await this.exists(id);
    const type = this.type(input.type);
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Введите название оборудования');
    return this.prisma.gboEquipmentItem.update({
      where: { id },
      data: { type, name },
    });
  }

  async remove(id: string) {
    await this.exists(id);
    await this.prisma.gboEquipmentItem.delete({ where: { id } });
    return { ok: true };
  }

  private async exists(id: string) {
    const item = await this.prisma.gboEquipmentItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Оборудование не найдено');
    return item;
  }

  private type(value?: string) {
    if (equipmentTypes.includes(value as (typeof equipmentTypes)[number])) {
      return value as (typeof equipmentTypes)[number];
    }
    throw new BadRequestException('Некорректный тип оборудования');
  }
}
