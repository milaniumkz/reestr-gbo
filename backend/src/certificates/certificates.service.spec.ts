import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { CertificatesService } from './certificates.service';

describe('CertificatesService.list', () => {
  it('filters certificate list by normalized plate and VIN last 3 in prisma query', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new CertificatesService(prisma as never, storageMock());

    await service.list('2', '25', 'BayGazi', {
      plateNumber: ' 777 aaa 01 ',
      vinLast3: 'x9z',
      status: 'active',
      organizationId: 'org_1',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-25',
    });

    const findArg = prisma.certificate.findMany.mock.calls[0]?.[0];
    expect(findArg).toMatchObject({
      where: {
        status: 'active',
        inspection: { organizationId: 'org_1' },
        vehicle: {
          normalizedPlate: '777AAA01',
          vinLast3: 'X9Z',
        },
      },
      skip: 25,
      take: 25,
    });
    expect(findArg.where.issuedAt).toMatchObject({
      gte: new Date(2026, 8, 1, 0, 0, 0, 0),
      lte: new Date(2026, 8, 25, 23, 59, 59, 999),
    });
    expect(findArg.where.OR).toHaveLength(4);
    expect(prisma.certificate.count).toHaveBeenCalledWith({ where: findArg.where });
  });

  it('treats organizationId=all as no organization filter', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new CertificatesService(prisma as never, storageMock());

    await service.list('1', '50', '', {
      organizationId: 'all',
      status: 'all',
    });

    const where = prisma.certificate.findMany.mock.calls[0]?.[0]?.where;
    expect(where.inspection).toBeUndefined();
    expect(where.status).toBeUndefined();
    expect(prisma.certificate.count).toHaveBeenCalledWith({ where });
  });
});

describe('CertificatesService.listImportJobs', () => {
  it('passes organization, status, query and date filters to prisma', async () => {
    const prisma = {
      certificateImportJob: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    const service = new CertificatesService(prisma as never, {} as never);

    await service.listImportJobs(
      { sub: 'admin', phone: '+77000000000', roles: ['operator'] },
      '1',
      '50',
      {
        q: '9435',
        status: 'completed',
        organizationId: 'org_1',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-25',
      },
    );

    const where = prisma.certificateImportJob.findMany.mock.calls[0]?.[0]?.where;
    const include = prisma.certificateImportJob.findMany.mock.calls[0]?.[0]?.include;
    expect(where).toMatchObject({
      organizationId: { in: ['org_1'] },
      status: 'completed',
      createdAt: {
        gte: new Date(2026, 8, 1, 0, 0, 0, 0),
        lte: new Date(2026, 8, 25, 23, 59, 59, 999),
      },
    });
    expect(include.organization).toBe(true);
    expect(where.OR).toHaveLength(3);
    expect(prisma.certificateImportJob.count).toHaveBeenCalledWith({ where });
  });
});

describe('CertificatesService.setStatus', () => {
  it('rejects statuses outside active, suspended and revoked', async () => {
    const prisma = {
      certificate: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new CertificatesService(prisma as never, {} as never);

    await expect(
      service.setStatus('CERT-1', 'blocked', { sub: 'admin', phone: '+77000000000', roles: ['operator'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certificate.findUnique).not.toHaveBeenCalled();
    expect(prisma.certificate.update).not.toHaveBeenCalled();
  });

  it('requires a reason before suspending a certificate', async () => {
    const prisma = {
      certificate: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const service = new CertificatesService(prisma as never, {} as never);

    await expect(
      service.setStatus('CERT-1', 'suspended', { sub: 'admin', phone: '+77000000000', roles: ['operator'] }, ' '),
    ).rejects.toThrow('Укажите причину ограничения свидетельства');
    expect(prisma.certificate.findUnique).not.toHaveBeenCalled();
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('CertificatesService.findByNumber', () => {
  it('allows global admin roles to open any certificate', async () => {
    const prisma = {
      certificate: {
        findUnique: jest.fn(async () => certificateFixture('org_foreign')),
      },
      organizationMember: {
        findMany: jest.fn(),
      },
    };
    const service = new CertificatesService(prisma as never, storageMock());

    const result = await service.findByNumber('CERT-1', {
      sub: 'government_1',
      phone: '+77000000000',
      roles: ['government'],
    });

    expect(result.number).toBe('CERT-1');
    expect(result.inspection.photos[0].viewUrl).toBe('/objects/photo_1.jpg');
    expect(result.inspection.createdBy?.phone).toBe('+77011110000');
    expect(result.inspection.submittedBy?.phone).toBe('+77022220000');
    expect(result.inspection.approvedBy?.phone).toBe('+77033330000');
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it('rejects inspection organization access outside its organizations', async () => {
    const prisma = {
      certificate: {
        findUnique: jest.fn(async () => certificateFixture('org_foreign')),
      },
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_own' }]),
      },
    };
    const service = new CertificatesService(prisma as never, storageMock());

    await expect(
      service.findByNumber('CERT-1', {
        sub: 'inspector_1',
        phone: '+77000000000',
        roles: ['inspection_org'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CertificatesService.importXlsx', () => {
  it('returns cached completed jobs with organization included', async () => {
    const completedJob = {
      id: 'job_1',
      status: 'completed',
      certificate: { id: 'cert_1' },
      organization: { id: 'org_1', name: 'ТОО ИО' },
    };
    const prisma = {
      certificateImportJob: {
        findUnique: jest.fn(async () => completedJob),
      },
    };
    const service = new CertificatesService(prisma as never, storageMock());

    await expect(
      service.importXlsx(
        {
          buffer: Buffer.from('same workbook'),
          originalname: 'cached.xlsx',
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
      ),
    ).resolves.toMatchObject({
      ok: true,
      job: {
        organization: { id: 'org_1', name: 'ТОО ИО' },
      },
      certificate: { id: 'cert_1' },
    });
    expect(prisma.certificateImportJob.findUnique).toHaveBeenCalledWith({
      where: {
        fileHash_filename: {
          fileHash: expect.any(String),
          filename: 'cached.xlsx',
        },
      },
      include: expect.objectContaining({
        organization: true,
      }),
    });
  });

  it('stores a failed import job with an error when XLSX parsing fails', async () => {
    const prisma = {
      certificateImportJob: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'job_1' })),
        update: jest.fn(async () => ({ id: 'job_1', status: 'failed' })),
      },
    };
    const storage = {
      putObject: jest.fn(async () => ({})),
    };
    const service = new CertificatesService(prisma as never, storage as never);

    await expect(
      service.importXlsx(
        {
          buffer: Buffer.from('not a zip'),
          originalname: 'broken.xlsx',
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        { sub: 'operator_1', phone: '+77000000000', roles: ['operator'] },
      ),
    ).rejects.toThrow();

    expect(storage.putObject).toHaveBeenCalled();
    expect(prisma.certificateImportJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        filename: 'broken.xlsx',
        createdById: 'operator_1',
        status: 'processing',
      }),
    });
    expect(prisma.certificateImportJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: expect.objectContaining({
        status: 'failed',
        errorCount: 1,
        errors: { create: [{ message: expect.any(String) }] },
      }),
    });
  });
});

function certificateFixture(organizationId: string) {
  return {
    id: 'cert_1',
    number: 'CERT-1',
    inspection: {
      id: 'inspection_1',
      organizationId,
      photos: [{ id: 'photo_1', type: 'certificate', objectKey: 'photo_1.jpg' }],
      createdBy: { id: 'user_created', phone: '+77011110000', fullName: 'Сотрудник' },
      submittedBy: { id: 'user_submitted', phone: '+77022220000', fullName: 'Отправил' },
      approvedBy: { id: 'user_approved', phone: '+77033330000', fullName: 'Руководитель' },
    },
  };
}

function storageMock() {
  return {
    objectUrl: (objectKey: string) => ({ url: `/objects/${objectKey}` }),
  } as never;
}
