import { describe, expect, it, jest } from '@jest/globals';
import { UsersController } from './users.controller';

function prisma(memberOrganizationIds: string[]) {
  return {
    organizationMember: {
      findMany: jest.fn(async () =>
        memberOrganizationIds.map((organizationId) => ({ organizationId })),
      ),
    },
    user: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
  };
}

describe('UsersController.list', () => {
  const user = {
    sub: 'inspector',
    phone: '+77000000000',
    roles: ['inspection_org' as const],
  };

  it('filters users by requested organization inside user scope', async () => {
    const db = prisma(['org_1', 'org_2']);
    const controller = new UsersController(db as never);

    await controller.list(user, '1', '50', '', '+7701', 'Иван', undefined, 'active', 'org_2', '2026-09-01', '2026-09-25');

    const where = db.user.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      memberships: { some: { organizationId: { in: ['org_2'] } } },
      phone: { contains: '+7701', mode: 'insensitive' },
      fullName: { contains: 'Иван', mode: 'insensitive' },
      isBlocked: false,
      lastLoginAt: {
        gte: new Date(2026, 8, 1, 0, 0, 0, 0),
        lte: new Date(2026, 8, 25, 23, 59, 59, 999),
      },
    });
    expect(db.user.count).toHaveBeenCalledWith({ where });
  });

  it('returns no users when requested organization is outside user scope', async () => {
    const db = prisma(['org_1']);
    const controller = new UsersController(db as never);

    await controller.list(user, '1', '50', '', undefined, undefined, undefined, undefined, 'org_2');

    const where = db.user.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      memberships: { some: { organizationId: { in: [] } } },
    });
  });

  it('treats role=all as no role filter', async () => {
    const db = prisma(['org_1']);
    const controller = new UsersController(db as never);

    await controller.list(user, '1', '50', '', undefined, undefined, 'all' as never);

    const where = db.user.findMany.mock.calls[0]?.[0]?.where;
    expect(where.roles).toBeUndefined();
    expect(db.user.count).toHaveBeenCalledWith({ where });
  });

  it('treats organizationId=all as the current scoped organization list', async () => {
    const db = prisma(['org_1', 'org_2']);
    const controller = new UsersController(db as never);

    await controller.list(user, '1', '50', '', undefined, undefined, undefined, undefined, 'all');

    const where = db.user.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      memberships: { some: { organizationId: { in: ['org_1', 'org_2'] } } },
    });
    expect(db.user.count).toHaveBeenCalledWith({ where });
  });

  it('rejects invalid role filters before prisma query', async () => {
    const db = prisma(['org_1']);
    const controller = new UsersController(db as never);

    await expect(
      controller.list(user, '1', '50', '', undefined, undefined, 'manager' as never),
    ).rejects.toThrow('Некорректная системная роль');

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.user.count).not.toHaveBeenCalled();
  });
});

describe('UsersController.create role assignment', () => {
  it('requires a reason before blocking a user', async () => {
    const db = {
      user: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const controller = new UsersController(db as never);

    await expect(
      controller.setBlocked(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        'user_1',
        true,
        '',
      ),
    ).rejects.toThrow('Укажите причину блокировки');
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects admin role assignment from non-super-admin users', async () => {
    const db = prisma([]);
    const controller = new UsersController(db as never);

    await expect(controller.create(
      { sub: 'operator', phone: '+77000000000', roles: ['operator'] },
      { phone: '+77011111111', fullName: 'Operator User', role: 'operator' },
    )).rejects.toThrow('Недостаточно прав для назначения роли');
  });

  it('rejects invalid runtime roles before user writes', async () => {
    const db = {
      user: {
        upsert: jest.fn(),
      },
      userRole: {
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const controller = new UsersController(db as never);

    await expect(controller.create(
      { sub: 'super_1', phone: '+77000000000', roles: ['super_admin'] },
      { phone: '+77011111111', fullName: 'Invalid Role User', role: 'manager' as never },
    )).rejects.toThrow('Некорректная системная роль');

    expect(db.user.upsert).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('UsersController system role management', () => {
  it('adds a valid system role and writes audit', async () => {
    const db = {
      userRole: {
        upsert: jest.fn(async () => ({ userId: 'user_1', role: 'government' })),
      },
      auditLog: {
        create: jest.fn(async () => ({})),
      },
    };
    const controller = new UsersController(db as never);

    await controller.addRole(
      { sub: 'super_1', phone: '+77000000000', roles: ['super_admin'] },
      'user_1',
      'government',
    );

    expect(db.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_role: { userId: 'user_1', role: 'government' } },
      update: {},
      create: { userId: 'user_1', role: 'government' },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'super_1',
        action: 'user.role.add',
        entity: 'user',
        entityId: 'user_1',
        metadata: { role: 'government' },
      },
    });
  });

  it('rejects invalid system roles before writing', async () => {
    const db = {
      userRole: {
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const controller = new UsersController(db as never);
    const actor = { sub: 'super_1', phone: '+77000000000', roles: ['super_admin'] };

    await expect(controller.addRole(actor, 'user_1', 'manager' as never)).rejects.toThrow('Некорректная системная роль');
    await expect(controller.removeRole(actor, 'user_1', 'manager' as never)).rejects.toThrow('Некорректная системная роль');
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.userRole.delete).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
