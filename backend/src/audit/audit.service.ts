import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(action: string, entity: string, entityId?: string, actorId?: string, metadata?: object, ipAddress?: string) {
    return this.prisma.auditLog.create({
      data: { action, entity, entityId, actorId, metadata: metadata ?? undefined, ipAddress },
    });
  }
}
