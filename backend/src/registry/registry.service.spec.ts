import { describe, expect, it, jest } from '@jest/globals';
import { RegistryService } from './registry.service';

describe('RegistryService.search', () => {
  it('does not let an inspection_org search registry outside its organization scope', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
      },
      vehicle: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new RegistryService(prisma as never);

    await service.search(
      { sub: 'inspector_1', phone: '+77000000000', roles: ['inspection_org'] },
      '',
      '50',
      '1',
      { organizationId: 'org_2' },
    );

    const where = prisma.vehicle.findMany.mock.calls[0]?.[0]?.where;
    expect(where.certificates).toMatchObject({
      some: { inspection: { organizationId: { in: [] } } },
    });
    expect(where.AND[0].OR).toEqual([
      { certificates: { some: { inspection: { organizationId: { in: ['org_1'] } } } } },
    ]);
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
  });

  it('scopes vehicle_owner registry search to owned vehicles', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => []),
      },
      vehicle: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new RegistryService(prisma as never);

    await service.search(
      { sub: 'owner_1', phone: '+77000000000', roles: ['vehicle_owner'] },
      'ABC',
      '20',
      '1',
    );

    const where = prisma.vehicle.findMany.mock.calls[0]?.[0]?.where;
    expect(where.AND[0].OR).toEqual([
      { certificates: { some: { inspection: { organizationId: { in: [] } } } } },
      { owners: { some: { userId: 'owner_1' } } },
    ]);
    expect(where.OR).toHaveLength(5);
    expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
  });
});

describe('RegistryService.publicCertificateChecks', () => {
  it('searches public checks by user-agent through q', async () => {
    const prisma = {
      publicCertificateCheck: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new RegistryService(prisma as never);

    await service.publicCertificateChecks('Chrome', undefined, '50', {}, '1');

    const where = prisma.publicCertificateCheck.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { userAgent: { contains: 'Chrome', mode: 'insensitive' } },
      ]),
    );
    expect(prisma.publicCertificateCheck.count).toHaveBeenCalledWith({ where });
  });

  it('passes found, plate, certificate and date filters to prisma', async () => {
    const prisma = {
      publicCertificateCheck: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new RegistryService(prisma as never);

    await service.publicCertificateChecks(
      '',
      'false',
      '25',
      {
        plate: ' 777 aaa 01 ',
        certificateNumber: 'CERT-777',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-25',
      },
      '2',
    );

    const findArg = prisma.publicCertificateCheck.findMany.mock.calls[0]?.[0];
    expect(findArg).toMatchObject({
      where: {
        found: false,
        normalizedPlate: { contains: '777AAA01', mode: 'insensitive' },
        certificateNumber: { contains: 'CERT-777', mode: 'insensitive' },
        createdAt: {
          gte: new Date(2026, 8, 1, 0, 0, 0, 0),
          lte: new Date(2026, 8, 25, 23, 59, 59, 999),
        },
      },
      skip: 25,
      take: 25,
    });
    expect(prisma.publicCertificateCheck.count).toHaveBeenCalledWith({ where: findArg.where });
  });
});
