import { describe, expect, it, jest } from '@jest/globals';
import { NotificationsController } from './notifications.controller';

function prisma(visible: boolean) {
  return {
    notification: {
      findFirst: jest.fn(async () => (visible ? { id: 'notification_1', title: 'Test', userId: 'user_1' } : null)),
      update: jest.fn(async () => ({ id: 'notification_1', title: 'Test', readAt: new Date() })),
    },
    auditLog: {
      create: jest.fn(async () => ({})),
    },
  };
}

function listPrisma() {
  return {
    notification: {
      findMany: jest.fn(async () => [
        {
          id: 'notification_1',
          title: 'Manual',
          body: 'Stored notification',
          role: 'inspection_org',
          userId: null,
          readAt: null,
          createdAt: new Date('2026-09-25T10:00:00.000Z'),
        },
      ]),
    },
    organizationMember: {
      findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
    },
    certificate: {
      findMany: jest.fn(async () => []),
    },
    inspection: {
      findMany: jest.fn(async () => []),
    },
  };
}

describe('NotificationsController.list', () => {
  it('returns stable paginated shape and scopes system items to user organizations', async () => {
    const db = listPrisma();
    const controller = new NotificationsController(db as never);

    const result = await controller.list(
      { sub: 'user_1', phone: '+77000000000', roles: ['inspection_org'] },
      '1',
      '50',
      undefined,
    );

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      limit: 50,
      items: [{ id: 'notification_1', entity: 'notification', entityId: 'notification_1' }],
    });
    expect(db.organizationMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: { organizationId: true },
    });
    expect(db.certificate.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: 'active',
      inspection: { organizationId: { in: ['org_1'] } },
    });
    expect(db.inspection.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      organizationId: { in: ['org_1'] },
    });
    expect(db.notification.findMany.mock.calls[0]?.[0]?.take).toBe(150);
    expect(db.certificate.findMany.mock.calls[0]?.[0]?.take).toBe(150);
    expect(db.inspection.findMany.mock.calls[0]?.[0]?.take).toBe(150);
  });

  it('filters mixed notification sources and paginates after sorting', async () => {
    const db = {
      notification: {
        findMany: jest.fn(async () => [
          {
            id: 'notification_1',
            title: 'Manual',
            body: 'Other body',
            role: null,
            userId: null,
            readAt: null,
            createdAt: new Date('2026-09-25T08:00:00.000Z'),
          },
        ]),
      },
      certificate: {
        findMany: jest.fn(async () => [
          {
            id: 'cert_1',
            number: 'CERT-1',
            issuedAt: new Date('2026-09-25T09:00:00.000Z'),
            vehicle: { plateNumber: '111AAA01' },
            inspection: { organization: { name: 'EcoGas' } },
          },
          {
            id: 'cert_2',
            number: 'CERT-2',
            issuedAt: new Date('2026-09-25T11:00:00.000Z'),
            vehicle: { plateNumber: '222BBB01' },
            inspection: { organization: { name: 'BayGazi' } },
          },
        ]),
      },
      inspection: {
        findMany: jest.fn(async () => [
          {
            id: 'inspection_1',
            status: 'submitted',
            updatedAt: new Date('2026-09-25T10:00:00.000Z'),
            vehicle: { plateNumber: '333CCC01' },
            organization: { name: 'EcoGas' },
            certificate: null,
          },
        ]),
      },
    };
    const controller = new NotificationsController(db as never);

    const result = await controller.list(
      { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
      '1',
      '1',
      'cert',
    );

    expect(result).toMatchObject({
      total: 2,
      page: 1,
      limit: 1,
      items: [{ id: 'certificate:cert_2', entity: 'certificate', entityId: 'CERT-2' }],
    });
  });
});

describe('NotificationsController.markRead', () => {
  const user = {
    sub: 'user_1',
    phone: '+77000000000',
    roles: ['government' as const],
  };

  it('marks only personal notifications for the current user', async () => {
    const db = prisma(true);
    const controller = new NotificationsController(db as never);

    await controller.markRead(user, 'notification_1');

    expect(db.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'notification_1',
        userId: 'user_1',
      },
    });
    expect(db.notification.update).toHaveBeenCalled();
  });

  it('does not mark hidden or shared notifications as read', async () => {
    const db = prisma(false);
    const controller = new NotificationsController(db as never);

    await expect(controller.markRead(user, 'notification_1')).rejects.toThrow('Уведомление не найдено');
    expect(db.notification.update).not.toHaveBeenCalled();
  });
});

describe('NotificationsController.create', () => {
  it('rejects notification roles outside system roles', async () => {
    const db = {
      notification: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const controller = new NotificationsController(db as never);

    await expect(
      controller.create(
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
        { title: 'Test', body: 'Body', role: 'manager' },
      ),
    ).rejects.toThrow('Некорректная роль уведомления');
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
