import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async publicActive() {
    const item = await this.prisma.legalDocument.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    return { item };
  }

  async list() {
    const items = await this.prisma.legalDocument.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return { items, total: items.length, page: 1, limit: 100 };
  }

  async create(input: { title?: string; excerpt?: string; body?: string }) {
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title) throw new BadRequestException('Введите название закона');
    if (!body) throw new BadRequestException('Введите текст закона');
    return this.prisma.legalDocument.create({
      data: {
        title,
        excerpt: input.excerpt?.trim() || null,
        body,
      },
    });
  }

  async update(id: string, input: { title?: string; excerpt?: string; body?: string; isActive?: boolean }) {
    await this.exists(id);
    return this.prisma.legalDocument.update({
      where: { id },
      data: {
        ...(input.title == null ? {} : { title: input.title.trim() }),
        ...(input.excerpt == null ? {} : { excerpt: input.excerpt.trim() || null }),
        ...(input.body == null ? {} : { body: input.body.trim() }),
        ...(input.isActive == null ? {} : { isActive: Boolean(input.isActive) }),
      },
    });
  }

  async remove(id: string) {
    await this.exists(id);
    await this.prisma.legalDocument.delete({ where: { id } });
    return { ok: true };
  }

  private async exists(id: string) {
    const item = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Закон не найден');
    return item;
  }
}
