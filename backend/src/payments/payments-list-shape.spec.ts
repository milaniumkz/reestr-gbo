import { describe, expect, it, jest } from '@jest/globals';
import { PaymentsService } from './payments.service';
import { TariffsController } from './tariffs.controller';

describe('payments list API shape', () => {
  it('returns payments as stable paginated list response', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => []),
      },
      payment: {
        findMany: jest.fn(async () => [{ id: 'pay_1' }]),
        count: jest.fn(async () => 1),
      },
    };
    const service = new PaymentsService(prisma as never, {} as never, {} as never);

    await expect(
      service.list({ sub: 'admin_1', phone: '+77000000000', roles: ['super_admin'] }, '2', '10'),
    ).resolves.toEqual({
      items: [{ id: 'pay_1' }],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('returns tariffs as stable paginated list response', async () => {
    const prisma = {
      tariff: {
        findMany: jest.fn(async () => [{ code: 'base' }]),
        count: jest.fn(async () => 1),
      },
    };
    const controller = new TariffsController(prisma as never);

    await expect(controller.list('1', '20')).resolves.toEqual({
      items: [{ code: 'base' }],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(prisma.tariff.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});
