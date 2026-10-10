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
    const service = new RegistryService(prisma as never, { objectUrl: (key: string) => ({ url: `/storage/ersi-gbo/${key}` }) } as never);

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
    const service = new RegistryService(prisma as never, { objectUrl: (key: string) => ({ url: `/storage/ersi-gbo/${key}` }) } as never);

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
    const service = new RegistryService(prisma as never, { objectUrl: (key: string) => ({ url: `/storage/ersi-gbo/${key}` }) } as never);

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
    const service = new RegistryService(prisma as never, { objectUrl: (key: string) => ({ url: `/storage/ersi-gbo/${key}` }) } as never);

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


describe('RegistryService attachment viewing', () => {
  const vehicle = { id: 'vehicle_1', certificates: [{ id: 'cert_1', number: 'CERT-1', inspection: {
    organization: { name: 'IO' }, photos: [
      { id: 'photo_1', objectKey: 'inspection/certificate.jpg', type: 'certificate_document' },
      { id: 'photo_2', objectKey: 'inspection/passport.jpg', type: 'tech_passport' },
      { id: 'photo_3', objectKey: 'inspection/vehicle.jpg', type: 'vehicle_photo' },
      { id: 'photo_4', objectKey: 'inspection/report.pdf', type: 'gas_inspection_report' },
      { id: 'photo_5', objectKey: 'inspection/unknown.jpg', type: 'future_private_type' },
    ],
  } }] };
  const storage = { objectUrl: jest.fn((key: string) => ({ url: `https://files.example/ersi-gbo/${key}` })) };
  it('returns working photo URLs for observer public certificate lookup', async () => {
    const prisma = { vehicle: { findFirst: jest.fn(async () => vehicle) }, publicCertificateCheck: { create: jest.fn(async () => ({ id: 'check_1' })) } };
    const result = await new RegistryService(prisma as never, storage as never).publicCertificateCheck('123ABC', '456');
    expect(result.found).toBe(true);
    expect(result.item?.certificates[0].inspection.photos[0]).toMatchObject({ id: 'photo_1', viewUrl: 'https://files.example/ersi-gbo/inspection/certificate.jpg' });
    expect(vehicle.certificates[0].inspection.photos[0]).not.toHaveProperty('viewUrl');
    expect(result.item?.certificates[0].inspection.photos.map(p => p.type)).toEqual(['certificate_document', 'tech_passport']);
  });
  it('returns the same photo URLs in scoped registry search', async () => {
    const prisma = { vehicle: { findMany: jest.fn(async () => [vehicle]), count: jest.fn(async () => 1) } };
    const result = await new RegistryService(prisma as never, storage as never).search({ sub: 'admin', phone: 'test', roles: ['super_admin'] }, '123ABC');
    expect(result.items[0].certificates[0].inspection.photos[0].viewUrl).toBe('https://files.example/ersi-gbo/inspection/certificate.jpg');
    expect(result.items[0].certificates[0].inspection.photos).toHaveLength(5);
  });
  it('limits authenticated observer search to certificate and technical passport', async () => {
    const prisma = { organizationMember: { findMany: jest.fn(async () => []) }, vehicle: { findMany: jest.fn(async () => [vehicle]), count: jest.fn(async () => 1) } };
    const result = await new RegistryService(prisma as never, storage as never).search({ sub: 'observer', phone: 'test', roles: ['vehicle_owner'] }, '123ABC');
    expect(result.items[0].certificates[0].inspection.photos.map(p => p.type)).toEqual(['certificate_document', 'tech_passport']);
  });
  it.each(['nca', 'government', 'inspection_org'])('preserves all documents for %s', async (role) => {
    const prisma = { organizationMember: { findMany: jest.fn(async () => [{organizationId:'org_1'}]) }, vehicle: { findMany: jest.fn(async () => [vehicle]), count: jest.fn(async () => 1) } };
    const result = await new RegistryService(prisma as never, storage as never).search({ sub: 'staff', phone: 'test', roles: [role] }, '123ABC');
    expect(result.items[0].certificates[0].inspection.photos).toHaveLength(5);
  });

});
