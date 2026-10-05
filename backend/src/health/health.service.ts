import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  basic() {
    return {
      ok: true,
      service: 'ersi-gbo-backend',
      timestamp: new Date().toISOString(),
    };
  }

  async deep() {
    const checks = {
      database: 'ok',
      storage: 'ok',
    };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'error';
    }
    try {
      const probeKey = `health/${Date.now()}.txt`;
      await this.storage.putObject({
        key: probeKey,
        body: Buffer.from('ok'),
        contentType: 'text/plain',
      });
    } catch {
      checks.storage = 'error';
    }
    return {
      ...this.basic(),
      ok: checks.database === 'ok' && checks.storage === 'ok',
      ...checks,
    };
  }
}
