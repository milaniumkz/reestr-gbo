import { describe, expect, it, jest } from '@jest/globals';
import { AuditController } from './audit.controller';

function prisma() {
  return {
    organizationMember: {
      findMany: jest.fn(async () => [{ userId: 'user_1' }]),
    },
    inspection: {
      findMany: jest.fn(async () => [{ id: 'inspection_1' }]),
    },
    certificate: {
      findMany: jest.fn(async () => [{ id: 'certificate_id_1', number: 'CERT-001' }]),
    },
    auditLog: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
  };
}

describe('AuditController.list', () => {
  it('scopes certificate audit events by certificate id and number', async () => {
    const db = prisma();
    const controller = new AuditController(db as never);

    await controller.list(
      { sub: 'inspector_1', phone: '+77000000000', roles: ['inspection_org'] },
      '1',
      '50',
    );

    const where = db.auditLog.findMany.mock.calls[0]?.[0]?.where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: expect.arrayContaining([
            {
              entity: 'certificate',
              entityId: { in: ['certificate_id_1', 'CERT-001'] },
            },
          ]),
        },
      ]),
    );
    expect(db.auditLog.count).toHaveBeenCalledWith({ where });
  });

  it('does not use broad member actor scope when an entity filter is selected', async () => {
    const db = prisma();
    const controller = new AuditController(db as never);

    await controller.list(
      { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
      '1',
      '50',
      'certificate',
      undefined,
      undefined,
      undefined,
      'org_1',
    );

    const where = db.auditLog.findMany.mock.calls[0]?.[0]?.where;
    const scope = where.AND.find((item: { OR?: unknown[] }) => Array.isArray(item.OR));
    expect(scope.OR).not.toContainEqual({ actorId: { in: ['user_1'] } });
    expect(scope.OR).toEqual(
      expect.arrayContaining([
        { entity: 'certificate', entityId: { in: ['certificate_id_1', 'CERT-001'] } },
      ]),
    );
  });
});

describe('AuditController.myViews', () => {
  it('returns view history as stable paginated list response', async () => {
    const db = prisma();
    db.auditLog.findMany.mockResolvedValueOnce([{ id: 'audit_1' }]);
    db.auditLog.count.mockResolvedValueOnce(1);
    const controller = new AuditController(db as never);

    await expect(
      controller.myViews(
        { sub: 'user_1', phone: '+77000000000', roles: ['inspection_org'] },
        '2',
        '10',
      ),
    ).resolves.toEqual({
      items: [{ id: 'audit_1' }],
      total: 1,
      page: 2,
      limit: 10,
    });
    const where = {
      actorId: 'user_1',
      action: { in: ['view.certificate', 'view.organization'] },
    };
    expect(db.auditLog.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(db.auditLog.count).toHaveBeenCalledWith({ where });
  });
});
