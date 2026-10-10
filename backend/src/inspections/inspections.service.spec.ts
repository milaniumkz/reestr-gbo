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
    ).rejects.toThrow('Отправить в реестр можно только после подтверждения контроля качества');
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });
});

describe('Inspection quality control workflow', () => {
  function fixture() {
    const state = {
      id: 'inspection_1', organizationId: 'org_1', status: 'draft', certificateNumber: 'TEST-1',
      qualityDocumentUploadedAt: null as Date | null,
      qualityConfirmedAt: null as Date | null,
      qualityConfirmedById: null as string | null,
      photos: ['cylinder_label','vehicle_photo','tech_passport','gas_work_record','cylinder_work_record','gas_inspection_report','cylinder_inspection_report'].map(type => ({ id:type, type, objectKey:type })),
      vehicle: { cylinders:[{}], owners:[{}] },
    };
    const prisma = {
      inspection: {
        findUnique: jest.fn(async () => state),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state,Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)));
          return {...state};
        }),
      },
      inspectionPhoto: { create: jest.fn(async ({ data }: { data: { type:string; objectKey:string } }) => {
        const photo={id:'certificate-photo',...data}; state.photos.push(photo); return photo;
      }) },
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId:'org_1' }]),
        findFirst: jest.fn(async ({ where }: { where: { userId:string; role:string } }) =>
          (where.userId==='qc' && where.role==='quality_control') || (where.userId==='leader' && where.role==='admin') ? {id:'membership'} : null),
      },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (action: (tx: unknown) => Promise<unknown>) => action(prisma)),
    };
    const storage={putObject:jest.fn(async()=>({}))};
    const certificates={issueForInspection:jest.fn(async()=>({id:'certificate_1'}))};
    const service=new InspectionsService(prisma as never,storage as never,certificates as never);
    const user=(id:string)=>({sub:id,phone:'test',roles:['inspection_org']});
    return {state,prisma,storage,certificates,service,user};
  }
  it('requires inspector -> uploaded certificate + confirmation -> leader -> registry',async()=>{
    const f=fixture();
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).ready).toBe(true);
    await f.service.setStatus(f.user('inspector'),'inspection_1','submitted');
    expect(f.certificates.issueForInspection).not.toHaveBeenCalled();
    await expect(f.service.setStatus(f.user('leader'),'inspection_1','approved')).rejects.toThrow('после подтверждения контроля качества');
    await expect(f.service.uploadPhoto('inspection_1','certificate_document',{originalname:'doc.pdf',buffer:Buffer.from('document')},f.user('inspector'))).rejects.toThrow('Только контроль качества');
    expect(f.storage.putObject).not.toHaveBeenCalled();
    await f.service.uploadPhoto('inspection_1','certificate_document',{originalname:'doc.pdf',buffer:Buffer.from('document')},f.user('qc'));
    await expect(f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',false)).rejects.toThrow('Подтверждаю');
    await f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true);
    expect(f.state.qualityConfirmedById).toBe('qc');
    expect(f.certificates.issueForInspection).not.toHaveBeenCalled();
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','approved')).rejects.toThrow('Только руководитель');
    await f.service.setStatus(f.user('leader'),'inspection_1','approved');
    expect(f.state.status).toBe('approved');
    expect(f.certificates.issueForInspection).toHaveBeenCalledTimes(1);
  });
  it('rejects confirmation without an upload by quality control',async()=>{
    const f=fixture(); f.state.status='submitted';
    f.state.photos.push({id:'old-doc',type:'certificate_document',objectKey:'old-doc'});
    await expect(f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true)).rejects.toThrow('должен загрузить');
    expect(f.prisma.inspection.update).not.toHaveBeenCalled();
  });
  it('requires a fresh review and upload after correction',async()=>{
    const f=fixture(); f.state.status='quality_approved';
    f.state.qualityConfirmedAt=new Date(); f.state.qualityDocumentUploadedAt=new Date();
    f.state.qualityConfirmedById='qc';
    await f.service.setStatus(f.user('leader'),'inspection_1','rejected');
    expect(f.state.qualityConfirmedAt).toBeNull();
    expect(f.state.qualityDocumentUploadedAt).toBeNull();
    await f.service.setStatus(f.user('inspector'),'inspection_1','submitted');
    await expect(f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true)).rejects.toThrow('должен загрузить');
  });
  it('rejects submission of an incomplete inspector package',async()=>{
    const f=fixture();f.state.photos=[];
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','submitted')).rejects.toThrow('Не хватает данных');
    expect(f.prisma.inspection.update).not.toHaveBeenCalled();
  });
  it('locks inspector documents after submission',async()=>{
    const f=fixture();f.state.status='submitted';
    await expect(f.service.uploadPhoto('inspection_1','gas_work_record',{originalname:'doc.pdf',buffer:Buffer.from('document')},f.user('inspector'))).rejects.toThrow('зафиксированы');
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
});
