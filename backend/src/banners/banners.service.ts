import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RequestUser } from '../common/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export type UploadedBannerFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async publicList() {
    const now = new Date();
    const items = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((item) => this.withUrl(item)) };
  }

  async list() {
    const items = await this.prisma.banner.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map((item) => this.withUrl(item)), total: items.length, page: 1, limit: 100 };
  }

  async create(user: RequestUser | undefined, file: UploadedBannerFile, input: {
    title?: string;
    linkUrl?: string;
    durationSeconds?: string;
    startsAt?: string;
    endsAt?: string;
  }) {
    if (!file?.buffer?.length) throw new BadRequestException('Загрузите фотографию баннера');
    const extension = this.extension(file.originalname);
    const objectKey = `banners/${randomUUID()}.${extension}`;
    await this.storage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType: file.mimetype,
      createdById: user?.sub,
    });
    const banner = await this.prisma.banner.create({
      data: {
        title: input.title?.trim() || 'Баннер',
        linkUrl: input.linkUrl?.trim() || null,
        objectKey,
        durationSeconds: this.duration(input.durationSeconds),
        startsAt: this.date(input.startsAt),
        endsAt: this.date(input.endsAt),
      },
    });
    return this.withUrl(banner);
  }

  async setActive(id: string, isActive: boolean) {
    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Баннер не найден');
    return this.withUrl(await this.prisma.banner.update({
      where: { id },
      data: { isActive },
    }));
  }

  async remove(id: string) {
    const exists = await this.prisma.banner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Баннер не найден');
    await this.prisma.banner.delete({ where: { id } });
    return { ok: true };
  }

  private withUrl<T extends { objectKey: string }>(item: T) {
    return { ...item, imageUrl: this.storage.objectUrl(item.objectKey).url };
  }

  private duration(value?: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 5;
    return Math.min(Math.round(parsed), 120);
  }

  private date(value?: string) {
    if (!value?.trim()) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private extension(filename?: string) {
    const value = filename?.split('.').pop()?.toLowerCase() ?? 'jpg';
    return ['jpg', 'jpeg', 'png', 'webp'].includes(value) ? value : 'jpg';
  }
}
