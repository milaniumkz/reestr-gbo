import { codeHash } from '../tech-passport/passport-content';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { InspectionsService } from './inspections.service';

describe('InspectionsService.list', () => {
  it('passes status, organization and date filters to prisma', async () => {
    const prisma = {
      inspection: {
        findMany: jest.fn(async () => []),
        groupBy: jest.fn(async () => [{ status: "submitted", _count: { _all: 150 } }]),
        count: jest.fn(async (args: { where: { certificate?: unknown } }) => args.where.certificate ? 120 : 150),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never, {} as never);

    const result = await service.list(
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
    expect(prisma.inspection.groupBy).toHaveBeenCalledWith({ by: ["status"], where: where, _count: { _all: true } });
    expect(result.items).toHaveLength(0);
    expect(result.summary).toMatchObject({ total: 150, byStatus: { submitted: 150 }, issuedCertificates: 120 });
  });

  it('does not let an inspection_org list inspections outside its organization scope', async () => {
    const prisma = {
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId: 'org_1' }]),
      },
      inspection: {
        findMany: jest.fn(async () => []),
        groupBy: jest.fn(async () => []),
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
    expect(prisma.inspection.groupBy).toHaveBeenCalledWith({ by: ["status"], where, _count: { _all: true } });
    expect(prisma.inspection.count).toHaveBeenCalledWith({ where: { ...where, certificate: { isNot: null } } });
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
      address: "Астана, улица Тестовая, д. 12" as string | null,
      lat: 51.1, lng: 71.4,
      id: 'inspection_1', organizationId: 'org_1', status: 'draft', certificateNumber: 'TEST-1',
      qualityDocumentUploadedAt: null as Date | null,
      secondQualityDocumentUploadedAt: null as Date | null,
      qualityConfirmedAt: null as Date | null,
      qualityConfirmedById: null as string | null,
      qualityReviewerId: null as string | null,
      qualityReviewStartedAt: null as Date | null,
      qualityReviewer: null as {id:string;fullName:string}|null,
      vehicleId:'vehicle_1',
      photos: ['applicant_application','applicant_questionnaire','cylinder_label','vehicle_photo','tech_passport','gas_work_record','cylinder_work_record','gas_inspection_report','cylinder_inspection_report'].map(type => ({ id:type, type, objectKey:type, checksum: undefined as string | undefined })) as Array<{id:string;type:string;objectKey:string;checksum?:string;cylinderSerial?:string|null;documentVerification?:unknown}>,
      requireApplicantPhotos: false,
      vehicle: {vin:'TESTVIN0000000001',plateNumber:'777AAA02', cylinders:[{id:'cylinder_1',shape:'Тороидальный',fuelType:'СНГ',producedAt:new Date('2024-07-15') as Date|null}], owners:[{id:'owner_1',userId:'owner_user',user:{phone:'+77001234567'}}] },
    };
    const prisma = {
      inspection: {
        findFirst: jest.fn(async()=>null),
        updateMany: jest.fn(async ({where,data}: {where:{id:string;status:string;qualityReviewerId:string|null};data:Record<string,unknown>}) => {
          if (where.id !== state.id || where.status !== state.status || where.qualityReviewerId !== state.qualityReviewerId) return {count:0};
          Object.assign(state,data);
          state.qualityReviewer = state.qualityReviewerId ? {id:state.qualityReviewerId,fullName:`Контролёр ${state.qualityReviewerId}`} : null;
          return {count:1};
        }),
        findUnique: jest.fn(async () => state),
        findUniqueOrThrow: jest.fn(async () => ({...state,organization:{name:"Test organization"}})),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state,Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)));
          return {...state};
        }),
      },
      certificate: {findUnique:jest.fn(async()=>null)},
      vehicle: {findUnique:jest.fn(async()=>({id:'vehicle_1',vin:'TESTVIN0000000001',plateNumber:'777AAA02'})), update:jest.fn(async()=>({}))},
      vehicleOwner: {update:jest.fn(async()=>({}))},
      gasCylinder: {findFirst:jest.fn(async()=>null),update:jest.fn(async()=>({}))},
      user: {findUnique:jest.fn(async()=>({id:'existing_user'})),create:jest.fn(async()=>({id:'new_user'}))},
      inspectionPhoto: { update: jest.fn(async ({where,data}:{where:{id:string};data:Record<string,unknown>})=>Object.assign(state.photos.find(p=>p.id===where.id)!,data)), findFirst: jest.fn(async ({where}:{where:{type:string;checksum:string;cylinderSerial?:string|null}}) => state.photos.find(p=>p.type===where.type && p.checksum===where.checksum && (p.cylinderSerial??null)===(where.cylinderSerial??null)) ?? null), deleteMany: jest.fn(async ({where}:{where:{inspectionId:string;type:string;id?:{not:string}}}) => { const before=state.photos.length; state.photos=state.photos.filter(p=>p.type!==where.type || p.id===where.id?.not); return {count:before-state.photos.length}; }), create: jest.fn(async ({ data }: { data: { type:string; objectKey:string; checksum:string } }) => {
        const photo={id:'certificate-photo',...data}; state.photos.push(photo); return photo;
      }) },
      organizationMember: {
        findMany: jest.fn(async () => [{ organizationId:'org_1' }]),
        findFirst: jest.fn(async ({ where }: { where: { userId:string; role:string } }) =>
          (['qc','qc2'].includes(where.userId) && where.role==='quality_control') || (where.userId==='leader' && where.role==='admin') ? {id:'membership'} : null),
      },
      notification:{create:jest.fn(async()=>({}))},
      technicalAlert:{create:jest.fn(async()=>({}))},
      technicalEvent:{create:jest.fn(async()=>({}))},
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (action: (tx: unknown) => Promise<unknown>) => action(prisma)),
    };
    const storage={putObject:jest.fn(async()=>({})),objectUrl:jest.fn((key:string)=>({url:`https://example.test/${key}`}))};
    const certificates={issueForInspection:jest.fn(async()=>({id:'certificate_1'}))};
    const moderation={check:jest.fn(async()=>({moderationStatus:'approved'})),status:()=>({enabled:true,configured:true})};
    const passport={verify:jest.fn(async()=>({proof:{kind:'vehicle_registration',status:'content_matched',vinHash:codeHash('TESTVIN0000000001'),plateHash:codeHash('777AAA02')},reason:'Тестовая проверка техпаспорта'}))};
    const service=new InspectionsService(prisma as never,storage as never,certificates as never,moderation as never,passport as never);
    const user=(id:string)=>({sub:id,phone:'test',roles:['inspection_org']});
    return {state,prisma,storage,certificates,service,user,moderation,passport};
  }
  it('stores passport verification and blocks submission after vehicle identifiers change', async () => {
    const f=fixture();
    await f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'passport.pdf',buffer:Buffer.from('%PDF-valid-fixture')},f.user('inspector'));
    expect(f.state.photos.find(p=>p.type==='tech_passport')?.documentVerification).toMatchObject({kind:'vehicle_registration',status:'content_matched'});
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).ready).toBe(true);
    f.state.vehicle.plateNumber='888AAA02';
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toContain('tech_passport_vehicle_mismatch');
  });
  it('checks photo quality but never OCRs a photographed tech passport',async()=>{
    const f=fixture();
    f.passport.verify.mockRejectedValue(new BadRequestException('OCR must not run for photos'));
    await f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'passport.jpg',buffer:Buffer.from('readable-photo')},f.user('inspector'));
    await f.service.uploadPhoto('inspection_1','tech_passport_back',{originalname:'back.png',buffer:Buffer.from('readable-back')},f.user('inspector'));
    expect(f.moderation.check).toHaveBeenCalledTimes(2);
    expect(f.passport.verify).not.toHaveBeenCalled();
    expect(f.prisma.inspectionPhoto.create).toHaveBeenCalledTimes(2);
  });
  it('does not block old photographed passports because of obsolete OCR bindings',async()=>{
    const f=fixture();
    const passport=f.state.photos.find(p=>p.type==='tech_passport')!;
    passport.objectKey='inspections/old-passport.jpg';
    passport.documentVerification={kind:'vehicle_registration',status:'content_matched',source:'image_ocr',vinHash:codeHash('OLD-VIN'),plateHash:codeHash('OLD-PLATE')};
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).ready).toBe(true);
  });
  it('still refuses an unreadable photo without using passport OCR',async()=>{
    const f=fixture();f.moderation.check.mockRejectedValueOnce(new BadRequestException('Фотография размыта'));
    await expect(f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'blur.jpg',buffer:Buffer.from('blurred')},f.user('inspector'))).rejects.toThrow('размыта');
    expect(f.passport.verify).not.toHaveBeenCalled();
    expect(f.prisma.inspectionPhoto.create).not.toHaveBeenCalled();
  });
  it('rejects unrelated passport content without saving an inspection attachment and records the refusal', async () => {
    const f=fixture();
    f.passport.verify.mockRejectedValueOnce(new BadRequestException('Техпаспорт: Файл не распознан как техпаспорт'));
    await expect(f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'passport.pdf',buffer:Buffer.from('%PDF-unrelated')},f.user('inspector'))).rejects.toThrow('Файл не распознан');
    expect(f.prisma.inspectionPhoto.create).not.toHaveBeenCalled();
    expect(f.prisma.technicalEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:"inspection.photo.rejected",actorId:"inspector"})}));
    expect(f.prisma.notification.create).toHaveBeenCalledTimes(3);
  });
  it('reuses a saved photo on repeated upload, while retaining distinct images in the same document slot', async () => {
    const f = fixture();
    const file = {originalname:'report.jpg',buffer:Buffer.from('same-report')};
    const first = await f.service.uploadPhoto('inspection_1','gas_work_record',file,f.user('inspector'));
    const repeated = await f.service.uploadPhoto('inspection_1','gas_work_record',file,f.user('inspector'));
    expect(repeated).toEqual(first);
    expect(f.prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'inspection.photo.duplicate_ignored'})}));
    expect(f.prisma.inspectionPhoto.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.inspection.update.mock.invocationCallOrder[0]).toBeLessThan(f.prisma.inspectionPhoto.findFirst.mock.invocationCallOrder[0]);
    await f.service.uploadPhoto('inspection_1','gas_work_record',{...file,buffer:Buffer.from('different-report')},f.user('inspector'));
    expect(f.prisma.inspectionPhoto.create).toHaveBeenCalledTimes(2);
    await f.service.uploadPhoto('inspection_1','cylinder_work_record',file,f.user('inspector'));
    expect(f.prisma.inspectionPhoto.create).toHaveBeenCalledTimes(3);
  });
  it('keeps a single attachment when two upload requests overlap', async () => {
    const f = fixture();
    // Model PostgreSQL parent-row lock: a transaction holds it until commit.
    let tail: Promise<unknown> = Promise.resolve();
    f.prisma.$transaction.mockImplementation(action => {
      const current = tail.then(()=>action(f.prisma));
      tail = current.catch(()=>undefined);
      return current;
    });
    const file = {originalname:'application.jpg',buffer:Buffer.from('application')};
    const [first, second] = await Promise.all([
      f.service.uploadPhoto('inspection_1','applicant_application',file,f.user('inspector')),
      f.service.uploadPhoto('inspection_1','applicant_application',file,f.user('inspector')),
    ]);
    expect(first).toEqual(second);
    expect(f.prisma.inspectionPhoto.create).toHaveBeenCalledTimes(1);
  });
  it('blocks submission when the primary or second cylinder shape is absent',async()=>{
    const f=fixture();
    f.state.vehicle.cylinders[0].shape='';
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toContain('cylinder_shape');
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','submitted')).rejects.toThrow('Не хватает данных инспекции');
    f.state.vehicle.cylinders[0].shape='Тороидальный';
    Object.assign(f.state,{usesTwoCylinders:true,secondCylinderSerial:'B',secondCylinderShape:null});
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toContain('second_cylinder_shape');
  });
  it('requires a quality-uploaded second certificate for two cylinders and keeps it tied to that cylinder',async()=>{
    const f=fixture();
    Object.assign(f.state,{usesTwoCylinders:true,secondCylinderSerial:'B',secondCylinderShape:'Цилиндрический'});
    for(const type of ['cylinder_label_2','cylinder_work_record_2','cylinder_inspection_report_2']) f.state.photos.push({id:type,type,objectKey:type,cylinderSerial:'B'});
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).ready).toBe(true);
    await f.service.setStatus(f.user('inspector'),'inspection_1','submitted');
    await f.service.uploadPhoto('inspection_1','certificate_document',{originalname:'first.pdf',buffer:Buffer.from('first-cert')},f.user('qc'));
    await expect(f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true)).rejects.toThrow('свидетельство второго баллона');
    await expect(f.service.uploadPhoto('inspection_1','certificate_document_2',{originalname:'second.pdf',buffer:Buffer.from('second-cert')},f.user('inspector'))).rejects.toThrow('Только контроль качества');
    const second=await f.service.uploadPhoto('inspection_1','certificate_document_2',{originalname:'second.pdf',buffer:Buffer.from('second-cert')},f.user('qc'));
    expect(second).toMatchObject({type:'certificate_document_2',cylinderSerial:'B'});
    expect(f.state.secondQualityDocumentUploadedAt).toBeInstanceOf(Date);
    await f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true);
    await f.service.setStatus(f.user('leader'),'inspection_1','approved');
    expect(f.certificates.issueForInspection).toHaveBeenCalledTimes(1);
    Object.assign(f.state,{status:'submitted',secondCylinderSerial:'C'});
    expect((await f.service.readiness('inspection_1',f.user('qc'))).missing).toContain('certificate_document_2');
  });
  it('prevents submission when the saved cylinder has no gas type',async()=>{
    const f=fixture();f.state.vehicle.cylinders[0].fuelType='';
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toContain('fuel_type');
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','submitted')).rejects.toThrow('Не хватает данных');
    expect(f.prisma.inspection.update).not.toHaveBeenCalled();
  });
  it('retains rejected evidence privately without attaching it to inspection',async()=>{
    const f=fixture();
    Object.assign(f.prisma.inspection,{findUniqueOrThrow:jest.fn(async()=>({organizationId:'org_1',organization:{name:'ИО тест'},vehicle:{plateNumber:'TEST01'}}))});
    Object.assign(f.prisma,{notification:{create:jest.fn(async()=>({}))},technicalAlert:{create:jest.fn(async()=>({}))},technicalEvent:{create:jest.fn(async()=>({}))}});
    f.moderation.check.mockRejectedValue(new BadRequestException('Фото экрана другого телефона'));
    await expect(f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'phone.jpg',buffer:Buffer.from('photo')},f.user('inspector'))).rejects.toThrow('Фото экрана');
    expect(f.storage.putObject).toHaveBeenCalledWith(expect.objectContaining({key:expect.stringMatching(/^technical-rejections\//)}));expect(f.prisma.inspectionPhoto.create).not.toHaveBeenCalled();
    expect((f.prisma as any).notification.create).toHaveBeenCalledTimes(3);expect((f.prisma as any).technicalAlert.create).toHaveBeenCalledTimes(1);
  });
  it('requires a cylinder production date before sending an old draft',async()=>{
    const f=fixture();f.state.vehicle.cylinders[0].producedAt=null;
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toContain('cylinder_produced_at');
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','submitted')).rejects.toThrow('Не хватает данных');
  });
  const corrected = {
    certificateNumber:'TEST-1',inspectionDate:'2026-10-13',
    owner:{fullName:'Исправленный владелец',address:'Астана',phone:'+77001234567',iin:'123456789012'},
    vehicle:{vin:'VIN000000123',plateNumber:'123 ABC 01',make:'Toyota',model:'Camry',year:2020},
    cylinder:{shape:'Тороидальный',serialNumber:'CYL-1',manufacturer:'Atiker',volumeLiters:54,producedAt:'2024-07-15',fuelType:'СНГ',reducerName:'Alaska',controlUnitName:'Atiker'},
  };
  it('allows assigned quality control to correct business data while keeping original reports',async()=>{
    const f=fixture();f.state.status='submitted';
    const originals=f.state.photos.map(p=>({...p}));
    await f.service.updateQualityData(f.user('qc'),'inspection_1',corrected);
    expect(f.prisma.vehicle.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({vin:'VIN000000123',normalizedPlate:'123ABC01'})}));
    expect(f.prisma.vehicleOwner.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({fullName:'Исправленный владелец'})}));
    expect(f.prisma.gasCylinder.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({validUntil:new Date('2028-10-13T00:00:00.000Z')})}));
    expect(f.state.photos).toEqual(originals);
    expect(f.prisma.user.create).not.toHaveBeenCalled();
    await expect(f.service.updateQualityData(f.user('qc2'),'inspection_1',corrected)).rejects.toThrow('уже проверяет');
    expect(f.prisma.vehicle.update).toHaveBeenCalledTimes(1);
  });
  it('changes the owner phone without creating a user account or granting a role',async()=>{
    const f=fixture();f.state.status='submitted';
    await f.service.updateQualityData(f.user('qc'),'inspection_1',{...corrected,owner:{...corrected.owner,phone:'8 (701) 111-22-33'}});
    expect(f.prisma.vehicleOwner.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({phone:'+77011112233',userId:null})}));
    expect(f.prisma.user.create).not.toHaveBeenCalled();
    expect(f.prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('does not allow inspectors or completed reviews to use quality editing',async()=>{
    const f=fixture();f.state.status='submitted';
    await expect(f.service.updateQualityData(f.user('inspector'),'inspection_1',corrected)).rejects.toThrow('Только контроль качества');
    f.state.status='quality_approved';
    await expect(f.service.updateQualityData(f.user('qc'),'inspection_1',corrected)).rejects.toThrow();
    expect(f.prisma.vehicle.update).not.toHaveBeenCalled();
  });
  it('requires the two applicant photos for submission but preserves existing quality tasks',async()=>{
    const f=fixture();f.state.photos=f.state.photos.filter(p=>!p.type.startsWith('applicant_'));
    expect((await f.service.readiness('inspection_1',f.user('inspector'))).missing).toEqual(['applicant_application','applicant_questionnaire']);
    f.state.status='submitted';f.state.photos.push({id:'cert',type:'certificate_document',objectKey:'cert'});
    expect((await f.service.readiness('inspection_1',f.user('qc'))).ready).toBe(true);
    f.state.requireApplicantPhotos=true;
    expect((await f.service.readiness('inspection_1',f.user('qc'))).ready).toBe(false);
  });
  it('returns a quality task to inspector editing without losing documents or reserving its own number',async()=>{
    const f=fixture();f.state.status='submitted';
    await f.service.claimQualityReview(f.user('qc'),'inspection_1');
    await f.service.setStatus(f.user('qc'),'inspection_1','rejected');
    expect(f.state.qualityReviewerId).toBeNull();
    expect(await f.service.certificateNumberAvailability('TEST-1','inspection_1',f.user('inspector'))).toEqual({available:true});
    await f.service.updateData(f.user('inspector'),'inspection_1',{vehicleId:'vehicle_1',certificateNumber:'TEST-1'});
    await f.service.uploadPhoto('inspection_1','gas_work_record',{originalname:'fixed.jpg',buffer:Buffer.from('photo')},f.user('inspector'));
    await f.service.setStatus(f.user('inspector'),'inspection_1','submitted');
    expect(f.state.status).toBe('submitted');expect(f.state.requireApplicantPhotos).toBe(true);
  });
  it('lets only one quality employee claim an inspection and exposes who opened it', async () => {
    const f=fixture();f.state.status='submitted';
    const results=await Promise.allSettled([f.service.claimQualityReview(f.user('qc'),'inspection_1'),f.service.claimQualityReview(f.user('qc2'),'inspection_1')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(f.state.qualityReviewerId).toBe('qc');
    await expect(f.service.claimQualityReview(f.user('qc2'),'inspection_1')).rejects.toThrow('Контролёр qc');
    await expect(f.service.claimQualityReview(f.user('qc'),'inspection_1')).resolves.toMatchObject({qualityReviewerId:'qc'});
    expect(f.state.qualityReviewStartedAt).toBeInstanceOf(Date);
  });
  it('allows the owner to release a task, after which another employee can take it', async () => {
    const f=fixture();f.state.status='submitted';
    await f.service.claimQualityReview(f.user('qc'),'inspection_1');
    await expect(f.service.releaseQualityReview(f.user('qc2'),'inspection_1')).rejects.toThrow('только свою');
    await f.service.releaseQualityReview(f.user('qc'),'inspection_1');
    expect(f.state.qualityReviewerId).toBeNull();
    await f.service.claimQualityReview(f.user('qc2'),'inspection_1');
    expect(f.state.qualityReviewerId).toBe('qc2');
  });
  it.each(['gas_work_record','cylinder_work_record','gas_inspection_report','cylinder_inspection_report','cylinder_work_record_2','cylinder_inspection_report_2'])('keeps %s immutable for quality staff',async type => {
    const f=fixture();f.state.status='submitted';
    await expect(f.service.uploadPhoto('inspection_1',type,{originalname:'doc.jpg',buffer:Buffer.from('photo')},f.user('qc'))).rejects.toThrow('не может изменять');
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
  it('replaces a passport photo without changing protected work records and reports',async()=>{
    const f=fixture();f.state.status='submitted';
    const originals=f.state.photos.filter(p=>p.type.endsWith('record')||p.type.endsWith('report')).map(p=>p.objectKey);
    await f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'passport.jpg',buffer:Buffer.from('photo')},f.user('qc'));
    expect(f.state.photos.filter(p=>p.type==='tech_passport')).toHaveLength(1);
    expect(f.state.photos.filter(p=>p.type.endsWith('record')||p.type.endsWith('report')).map(p=>p.objectKey)).toEqual(originals);
    await expect(f.service.uploadPhoto('inspection_1','tech_passport',{originalname:'passport.jpg',buffer:Buffer.from('photo')},f.user('qc2'))).rejects.toThrow('уже проверяет');
  });
  it('blocks submission of an old GPS-only inspection when address lookup fails', async () => {
    const f = fixture(); f.state.address = 'GPS: 51.100000, 71.400000';
    jest.spyOn(f.service as any, 'reverseGeocode').mockResolvedValue(undefined);
    await expect(f.service.setStatus(f.user('inspector'), 'inspection_1', 'submitted')).rejects.toThrow('Адрес инспекции не определился');
    expect(f.prisma.inspection.update).not.toHaveBeenCalled();
  });

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
  it('routes a manager return to quality and permits quality-only corrections without involving inspector',async()=>{
    const f=fixture();Object.assign(f.state,{status:'quality_approved',qualityConfirmedAt:new Date(),qualityDocumentUploadedAt:new Date(),qualityConfirmedById:'qc',qualityReviewerId:'qc',submittedById:'inspector',submittedAt:new Date('2026-11-01')});
    const originals=f.state.photos.map(p=>p.objectKey);
    await f.service.setStatus(f.user('leader'),'inspection_1','rejected');
    expect(f.state).toMatchObject({status:'submitted',qualityReviewerId:null,qualityConfirmedAt:null,qualityConfirmedById:null,qualityDocumentUploadedAt:null,submittedById:'inspector',submittedAt:new Date('2026-11-01')});
    expect(f.state.photos.map(p=>p.objectKey)).toEqual(originals);
    await expect(f.service.updateData(f.user('inspector'),'inspection_1',{vehicleId:'vehicle_1',certificateNumber:'TEST-1'})).rejects.toThrow('только в черновике');
    await f.service.updateQualityData(f.user('qc'),'inspection_1',corrected);
    await f.service.uploadPhoto('inspection_1','certificate_document',{originalname:'fixed.pdf',buffer:Buffer.from('%PDF-fixed')},f.user('qc'));
    await f.service.setStatus(f.user('qc'),'inspection_1','quality_approved',true);
    expect(f.state.status).toBe('quality_approved');
    await f.service.setStatus(f.user('leader'),'inspection_1','approved');
    expect(f.certificates.issueForInspection).toHaveBeenCalledTimes(1);
    expect(f.prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:expect.objectContaining({previousStatus:'quality_approved',status:'submitted',returnTarget:'quality_control'})})}));
  });
  it('does not let an inspector bypass quality or impersonate a manager return',async()=>{
    const f=fixture();f.state.status='quality_approved';
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','rejected')).rejects.toThrow('Только руководитель');
    expect(f.state.status).toBe('quality_approved');
    f.state.status='submitted';
    await expect(f.service.setStatus(f.user('leader'),'inspection_1','rejected')).rejects.toThrow('Только контроль качества');
  });
  it('requires a fresh review and upload after correction',async()=>{
    const f=fixture(); f.state.status='quality_approved';
    f.state.qualityConfirmedAt=new Date(); f.state.qualityDocumentUploadedAt=new Date();
    f.state.qualityConfirmedById='qc';
    await f.service.setStatus(f.user('leader'),'inspection_1','rejected');
    expect(f.state.qualityConfirmedAt).toBeNull();
    expect(f.state.qualityDocumentUploadedAt).toBeNull();
    expect(f.state.status).toBe('submitted');
    await expect(f.service.setStatus(f.user('inspector'),'inspection_1','submitted')).rejects.toThrow('только черновик');
    await f.service.setStatus(f.user('qc'),'inspection_1','rejected');
    expect(f.state.status).toBe('rejected');
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


describe('InspectionsService.remove', () => {
  const admin = { sub: 'root', phone: 'test', roles: ['super_admin'] };
  function fixture(certificate: {id:string;number:string} | null = {id:'cert_1',number:'10022'}) {
    const tx = {
      inspection: { findUnique: jest.fn(async () => ({id:'inspection_1', organizationId:'org_1',vehicleId:'vehicle_1',status:'approved',certificateNumber:'10022',certificate})), delete: jest.fn(async () => ({})) },
      certificate: { delete: jest.fn(async () => ({})) },
      certificateImportJob: { updateMany: jest.fn(async () => ({count:1})) },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const transaction = jest.fn(async (callback:any) => callback(tx));
    return {tx,transaction,service:new InspectionsService({$transaction:transaction} as never,{} as never,{} as never)};
  }
  it.each(['inspection_org','operator','nca','government'])('denies deletion for %s before any write', async role => {
    const {service,transaction}=fixture();
    await expect(service.remove({sub:'staff',phone:'test',roles:[role]},'inspection_1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('deletes the linked certificate before the inspection and keeps an audit record', async () => {
    const {service,tx}=fixture();
    await expect(service.remove(admin,'inspection_1')).resolves.toEqual({ok:true});
    expect(tx.certificateImportJob.updateMany).toHaveBeenCalledWith({where:{certificateId:'cert_1'},data:{certificateId:null}});
    expect(tx.certificate.delete).toHaveBeenCalledWith({where:{id:'cert_1'}});
    expect(tx.inspection.delete).toHaveBeenCalledWith({where:{id:'inspection_1'}});
    expect(tx.certificate.delete.mock.invocationCallOrder[0]).toBeLessThan(tx.inspection.delete.mock.invocationCallOrder[0]);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId:'root',action:'inspection.delete',metadata:expect.objectContaining({vehicleId:'vehicle_1',certificateNumber:'10022'})})}));
  });
  it('deletes a draft without deleting a certificate', async () => {
    const {service,tx}=fixture(null);
    await service.remove(admin,'inspection_1');
    expect(tx.certificate.delete).not.toHaveBeenCalled();
    expect(tx.certificateImportJob.updateMany).not.toHaveBeenCalled();
    expect(tx.inspection.delete).toHaveBeenCalledTimes(1);
  });
  it('does not delete anything when the inspection is missing', async () => {
    const {service,tx}=fixture();
    tx.inspection.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.remove(admin,'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.inspection.delete).not.toHaveBeenCalled();
  });
  it('does not delete the inspection if deleting its certificate fails', async () => {
    const {service,tx}=fixture();
    tx.certificate.delete.mockRejectedValueOnce(new Error('database failure'));
    await expect(service.remove(admin,'inspection_1')).rejects.toThrow('database failure');
    expect(tx.inspection.delete).not.toHaveBeenCalled();
  });

});
