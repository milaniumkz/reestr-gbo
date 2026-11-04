import { describe, it, expect, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { InspectionsService } from '../inspections/inspections.service';
const admin = { sub: 'admin', phone: 'test', roles: ['super_admin'] };

function fixture() {
  const inspections: any[] = ['a', 'b'].map(org => ({ id: `inspection-${org}`, organizationId: org, certificateNumber: '3', vehicleId: `vehicle-${org}`, createdAt: new Date(), photos: [],
    vehicle: { vin: `VIN-${org}`, cylinders: [] }, organization: { id: org, name: `IO ${org}`, bin: org } }));
  const certificates: any[] = [];
  const findInspection = (where: any) => where.id ? inspections.find(i => i.id === where.id)
    : inspections.find(i => i.organizationId === where.organizationId_certificateNumber.organizationId && i.certificateNumber === where.organizationId_certificateNumber.certificateNumber);
  const findCertificate = (where: any) => {
    const row = where.id ? certificates.find(c => c.id === where.id) : where.inspectionId ? certificates.find(c => c.inspectionId === where.inspectionId)
      : certificates.find(c => c.organizationId === where.organizationId_number.organizationId && c.number === where.organizationId_number.number);
    return where.vehicle && row?.vehicle.vin !== where.vehicle.vin ? undefined : row;
  };
  const prisma = {
    organizationMember: { findMany: jest.fn(async () => [{ organizationId: 'a' }]) },
    inspection: { findUnique: jest.fn(async ({ where }: any) => findInspection(where) ?? null),
      create: jest.fn(async ({ data }: any) => { const row = { id: `inspection-${inspections.length}`, ...data }; inspections.push(row); return row; }) },
    certificate: {
      findUnique: jest.fn(async ({ where }: any) => findCertificate(where) ?? null),
      findMany: jest.fn(async ({ where }: any) => certificates.filter(c => (where.qrPayload ? c.qrPayload === where.qrPayload : c.number === where.number) && (!where.organizationId || c.organizationId === where.organizationId)
        && (!where.vehicle || c.vehicle.vin === where.vehicle.vin) && (!where.inspection || where.inspection.organizationId.in.includes(c.organizationId)))),
      create: jest.fn(async ({ data }: any) => { const inspection = inspections.find(i => i.id === data.inspectionId); const row = { ...data, status: 'active', inspection, vehicle: inspection.vehicle }; certificates.push(row); return row; }),
      update: jest.fn(async ({ where, data }: any) => { const row = findCertificate(where); Object.assign(row, data); return row; }),
    },
    certificateView: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const storage = { putObject: jest.fn(async () => ({})), objectUrl: (key: string) => ({ url: key }) };
  const service = new CertificatesService(prisma as never, storage as never);
  return { prisma, storage, service, inspections, certificates };
}

describe('Certificate numbers belong to the issuing IO', () => {
  it('issues number 3 in two IOs and gives each certificate its own ID and QR', async () => {
    const f = fixture();
    const a = await f.service.issueForInspection('inspection-a');
    const b = await f.service.issueForInspection('inspection-b');
    expect([a.number, b.number]).toEqual(['3', '3']);
    expect(a.id).not.toBe(b.id);
    expect(a.qrPayload).not.toBe(b.qrPayload);
    expect(f.certificates.map(c => c.organizationId)).toEqual(['a', 'b']);
    expect((await f.service.issueForInspection('inspection-a')).id).toBe(a.id);
  });
  it('rejects another published number 3 in the same IO', async () => {
    const f = fixture(); await f.service.issueForInspection('inspection-a');
    f.inspections.push({ ...f.inspections[0], id: 'duplicate-a' });
    await expect(f.service.issueForInspection('duplicate-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.certificates).toHaveLength(1);
  });
  it('keeps a new number free in IO b when number 3 is already issued in IO a', async () => {
    const f = fixture(); await f.service.issueForInspection('inspection-a'); f.inspections.splice(1, 1);
    const service = new InspectionsService(f.prisma as never, {} as never, {} as never);
    expect(await service.certificateNumberAvailability('3', undefined, admin, 'b')).toEqual({ available: true });
    expect(await service.certificateNumberAvailability('3', undefined, admin, 'a')).toEqual({ available: false });
    jest.spyOn(service as any, 'reverseGeocode').mockResolvedValue('Test city, Test street, 3');
    await expect(service.create(admin, { organizationId: 'b', vehicleId: 'vehicle-b', certificateNumber: '3', lat: 51.1, lng: 71.4 })).resolves.toMatchObject({ organizationId: 'b', certificateNumber: '3' });
    await expect(service.create(admin, { organizationId: 'b', vehicleId: 'another-vehicle', certificateNumber: '3', lat: 51.1, lng: 71.4 })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('reports a same-IO race as a number conflict rather than accepting a duplicate', async () => {
    const f = fixture(); f.inspections.splice(1, 1);
    const service = new InspectionsService(f.prisma as never, {} as never, {} as never);
    jest.spyOn(service as any, 'reverseGeocode').mockResolvedValue('Test city, Test street, 3');
    f.prisma.inspection.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['organizationId', 'certificateNumber'] } });
    await expect(service.create(admin, { organizationId: 'b', vehicleId: 'vehicle-b', certificateNumber: '3', lat: 51.1, lng: 71.4 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not allow an inspector to check number availability in a foreign IO', async () => {
    const f = fixture(); const service = new InspectionsService(f.prisma as never, {} as never, {} as never);
    await expect(service.certificateNumberAvailability('3', undefined, { sub: 'inspector', phone: 'test', roles: ['inspection_org'] }, 'b')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.certificate.findUnique).not.toHaveBeenCalled();
  });
  it('opens exact IDs or scoped numbers and rejects an ambiguous bare number', async () => {
    const f = fixture(); const a = await f.service.issueForInspection('inspection-a'); const b = await f.service.issueForInspection('inspection-b');
    expect((await f.service.findByNumber(a.id, admin)).id).toBe(a.id);
    expect((await f.service.findByNumber('3', admin, 'b')).id).toBe(b.id);
    await expect(f.service.findByNumber('3', admin)).rejects.toBeInstanceOf(ConflictException);
    expect(await f.service.verify('3')).toEqual({ valid: false, status: 'organization_required' });
    expect((await f.service.verify('3:VIN-a')).number).toBe('3');
    expect((await f.service.verify(b.qrPayload)).number).toBe('3');
  });
  it('preserves an exact legacy QR when another IO reuses the same number and VIN', async () => {
    const f = fixture(); const a = await f.service.issueForInspection('inspection-a');
    a.qrPayload = '3:VIN-a'; f.inspections[1].vehicle.vin = 'VIN-a';
    await f.service.issueForInspection('inspection-b');
    await f.service.verify('3:VIN-a');
    expect(f.prisma.certificateView.create).toHaveBeenCalledWith({ data: { certificateId: a.id } });
  });

  it('imports the same number into IO b without replacing IO a certificate', async () => {
    const f = fixture(); const a = await f.service.issueForInspection('inspection-a');
    Object.assign(f.prisma, {
      vehicle: { upsert: jest.fn(async () => ({ id: 'vehicle-b' })) },
      vehicleOwner: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
      gasCylinder: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
      certificateImportJob: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({ id: 'job-b' })), update: jest.fn(async ({ data }: any) => ({ id: 'job-b', ...data })) },
    });
    Object.assign(f.prisma.inspection, { update: jest.fn(async ({ where, data }: any) => { const row = f.inspections.find(i => i.id === where.id); Object.assign(row, data); return row; }) });
    const upsert = jest.fn(async ({ where, update, create }: any) => {
      const existing = f.certificates.find(c => c.organizationId === where.organizationId_number.organizationId && c.number === where.organizationId_number.number);
      if (existing) { Object.assign(existing, update); return existing; }
      return f.prisma.certificate.create({ data: create });
    });
    Object.assign(f.prisma.certificate, { upsert });
    jest.spyOn(f.service as any, 'tryParseCertificateXlsx').mockResolvedValue({ certificateNumber: '3', organizationName: 'IO b', vin: 'VIN-b', plateNumber: 'TESTB', make: 'Test', model: 'Test', ownerPhone: '+77000000000', ownerName: 'Test owner', ownerAddress: 'Test address', cylinderSerial: 'TEST-B', cylinderManufacturer: 'Test', volumeLiters: 50, issuedAt: new Date(), validUntil: new Date('2030-01-01'), producedAt: new Date('2024-01-01') });
    jest.spyOn(f.service as any, 'resolveImportOrganization').mockResolvedValue({ id: 'b', name: 'IO b' });
    jest.spyOn(f.service as any, 'assertCylinderUnique').mockResolvedValue(undefined);
    const result = await f.service.importXlsx({ originalname: 'same-number.xlsx', buffer: Buffer.from('test workbook') }, admin, { organizationBin: '000000000002' });
    expect(result.certificate).toMatchObject({ number: '3', organizationId: 'b' });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_number: { organizationId: 'b', number: '3' } } }));
    expect(f.certificates).toHaveLength(2);
    expect(a.organizationId).toBe('a'); expect(a.vehicle.vin).toBe('VIN-a');
  });

  it('updates only the selected certificate and keeps PDF object keys separate', async () => {
    const f = fixture(); const a = await f.service.issueForInspection('inspection-a'); const b = await f.service.issueForInspection('inspection-b');
    await f.service.setStatus(b.id, 'revoked', admin, 'Owner requested correction');
    expect(a.status).toBe('active'); expect(b.status).toBe('revoked');
    jest.spyOn(f.service as any, 'renderPdf').mockResolvedValue(Buffer.from('test pdf'));
    await f.service.pdf(a.id); await f.service.pdf(b.id);
    expect(f.storage.putObject.mock.calls.map((call: any) => call[0].key)).toEqual([`certificates/${a.id}.pdf`, `certificates/${b.id}.pdf`]);
  });
});
