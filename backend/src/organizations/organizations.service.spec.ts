import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService members', () => {
  it('rejects organization statuses outside active and blocked', async () => {
    const prisma = {
      organization: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.setStatus(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'org_1',
        'pending',
        'test',
      ),
    ).rejects.toThrow('Некорректный статус инспекционного органа');
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires a reason before blocking an organization', async () => {
    const prisma = {
      organization: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.setStatus(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'org_1',
        'blocked',
        '   ',
      ),
    ).rejects.toThrow('Укажите причину блокировки');
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects organization membership roles outside admin and inspector', async () => {
    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn(async () => ({ type: 'inspection_org' })),
      },
      organizationMember: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.addMember(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'org_1',
        { userId: 'user_1', role: 'manager' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('does not allow legacy manager membership to manage organization members', async () => {
    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn(async () => ({ type: 'inspection_org' })),
      },
      organizationMember: {
        findFirst: jest.fn(async () => null),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.addMember(
        { sub: 'manager_1', phone: '+77000000000', roles: ['inspection_org'] },
        'org_1',
        { userId: 'user_2', role: 'inspector' },
      ),
    ).rejects.toThrow('Только руководитель ИО может управлять сотрудниками');
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        userId: 'manager_1',
        role: 'admin',
      },
    });
  });

  it('creates a new member user, attaches membership and writes audit', async () => {
    const prisma = {
      user: {
        upsert: jest.fn(async () => ({ id: 'user_2', phone: '+77011112233' })),
      },
      userRole: {
        upsert: jest.fn(async () => ({})),
      },
      organizationMember: {
        upsert: jest.fn(async () => ({})),
      },
      auditLog: {
        create: jest.fn(async () => ({})),
      },
      organization: {
        findUniqueOrThrow: jest.fn(async () => ({ id: 'org_1', members: [] })),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await service.addMember(
      { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
      'org_1',
      {
        role: 'inspector',
        fullName: 'Иван Иванов',
        phone: '+77011112233',
        iin: '123456789012',
      },
    );

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: '+77011112233' },
      update: { fullName: 'Иван Иванов', iin: '123456789012' },
      create: { phone: '+77011112233', fullName: 'Иван Иванов', iin: '123456789012' },
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_role: { userId: 'user_2', role: 'inspection_org' } },
      update: {},
      create: { userId: 'user_2', role: 'inspection_org' },
    });
    expect(prisma.organizationMember.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_role: {
          organizationId: 'org_1',
          userId: 'user_2',
          role: 'inspector',
        },
      },
      update: {},
      create: { organizationId: 'org_1', userId: 'user_2', role: 'inspector' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'operator_1',
        action: 'organization.member.add',
        entity: 'organization',
        entityId: 'org_1',
        metadata: { userId: 'user_2', role: 'inspector' },
      },
    });
  });
});

describe('OrganizationsService.activity', () => {
  it('returns aggregate inspection stats for the whole organization', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => [{ userId: 'user_1' }]),
      },
      inspection: {
        findMany: jest.fn(async () => []),
        count: jest
          .fn()
          .mockResolvedValueOnce(120)
          .mockResolvedValueOnce(80),
      },
      certificate: {
        count: jest.fn(async () => 75),
      },
      auditLog: {
        findMany: jest.fn(async () => []),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(service.activity('org_1')).resolves.toMatchObject({
      stats: {
        createdCount: 120,
        submittedCount: 80,
        publishedCount: 75,
      },
    });
    expect(prisma.inspection.count).toHaveBeenCalledWith({ where: { organizationId: 'org_1' } });
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: { inspection: { organizationId: 'org_1' } },
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { actorId: { in: ['user_1'] } },
            { entity: 'organization', entityId: 'org_1' },
          ],
        },
      }),
    );
  });
});

describe('OrganizationsService create/update validation', () => {
  it('rejects empty required organization fields before database write', async () => {
    const prisma = {
      organization: {
        create: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.create(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        { type: 'inspection_org', name: '   ', bin: '220340010835' },
      ),
    ).rejects.toThrow('Название ИО обязательно');
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it('rejects coordinates outside valid ranges before update', async () => {
    const prisma = {
      organization: {
        update: jest.fn(),
      },
    };
    const service = new OrganizationsService(prisma as never);

    await expect(
      service.update(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'org_1',
        { lat: '95', lng: '71' },
      ),
    ).rejects.toThrow('Некорректные координаты');
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});
