import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { InspectionsService } from './inspections.service';

describe('InspectionsService.list', () => {
  it('passes status, organization and date filters to prisma', async () => {
    const prisma = {
      inspection: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await service.list(
      { sub: 'admin', phone: '+77000000000', roles: ['operator'] },
      '1',
      '50',
      'ABC',
      {
        status: 'submitted',
        organizationId: 'org_1',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-25',
      },
    );

    const where = prisma.inspection.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      status: 'submitted',
      organizationId: { in: ['org_1'] },
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-25T23:59:59.999Z'),
      },
    });
    expect(where.OR).toHaveLength(5);
    expect(prisma.inspection.count).toHaveBeenCalledWith({ where });
  });

  it('does not let an inspection_org list inspections outside its organization scope', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
      },
      inspection: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await service.list(
      { sub: 'inspector_1', phone: '+77000000000', roles: ['inspection_org'] },
      '1',
      '50',
      '',
      { organizationId: 'org_2' },
    );

    const where = prisma.inspection.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      organizationId: { in: [] },
    });
    expect(prisma.inspection.count).toHaveBeenCalledWith({ where });
  });
});

describe('InspectionsService.setStatus', () => {
  it('rejects statuses outside the admin workflow', async () => {
    const prisma = {
      inspection: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await expect(
      service.setStatus(
        { sub: 'admin', phone: '+77000000000', roles: ['operator'] },
        'inspection_1',
        'published',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inspection.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });

  it('does not allow legacy manager membership to approve inspection', async () => {
    const prisma = {
      inspection: {
        findUnique: jest.fn(async () => ({
          id: 'inspection_1',
          organizationId: 'org_1',
          status: 'submitted',
        })),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
        findFirst: jest.fn(async () => null),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await expect(
      service.setStatus(
        { sub: 'manager_1', phone: '+77000000000', roles: ['inspection_org'] },
        'inspection_1',
        'approved',
      ),
    ).rejects.toThrow('Только руководитель ИО может отправить свидетельство в реестр');
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        userId: 'manager_1',
        role: 'admin',
      },
    });
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });

  it('does not allow global admin roles to approve without organization leader membership', async () => {
    const prisma = {
      inspection: {
        findUnique: jest.fn(async () => ({
          id: 'inspection_1',
          organizationId: 'org_1',
          status: 'submitted',
        })),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      organizationMember: {
        findFirst: jest.fn(async () => null),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await expect(
      service.setStatus(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'inspection_1',
        'approved',
      ),
    ).rejects.toThrow('Только руководитель ИО может отправить свидетельство в реестр');
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        userId: 'operator_1',
        role: 'admin',
      },
    });
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });

  it('does not approve inspections before they are submitted', async () => {
    const prisma = {
      inspection: {
        findUnique: jest.fn(async () => ({
          id: 'inspection_1',
          organizationId: 'org_1',
          status: 'draft',
        })),
        update: jest.fn(),
      },
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
        findFirst: jest.fn(async () => ({ id: 'member_1' })),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    await expect(
      service.setStatus(
        { sub: 'leader_1', phone: '+77000000000', roles: ['inspection_org'] },
        'inspection_1',
        'approved',
      ),
    ).rejects.toThrow('Отправить в реестр можно только инспекцию в статусе submitted');
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });
});
