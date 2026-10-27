import { jest } from '@jest/globals';
import { cylinderPair } from './cylinder-pair';
import { InspectionsService } from './inspections.service';

describe('Two cylinders', () => {
  it('keeps legacy inspections single and retains a pair for legacy updates', () => {
    expect(cylinderPair({}, 'A')).toEqual({usesTwoCylinders:false,secondCylinderSerial:null});
    expect(cylinderPair({}, 'A', {usesTwoCylinders:true,secondCylinderSerial:'B'}).secondCylinderSerial).toBe('B');
    expect(cylinderPair({usesTwoCylinders:false}, 'A', {usesTwoCylinders:true,secondCylinderSerial:'B'}).secondCylinderSerial).toBeNull();
  });
  it('requires a real, distinct second serial', () => {
    expect(()=>cylinderPair({usesTwoCylinders:true},'A')).toThrow('номер второго');
    expect(()=>cylinderPair({usesTwoCylinders:true,secondCylinderSerial:' a '},'A')).toThrow('должны отличаться');
    expect(()=>cylinderPair({usesTwoCylinders:'true' as unknown as boolean,secondCylinderSerial:'B'},'A')).toThrow('отметка');
  });
  it('blocks a pair without its own documents and rejects stale documents after changing the serial', async () => {
    const photos: Array<{type:string;cylinderSerial?:string}> = ['cylinder_label','vehicle_photo','tech_passport','applicant_application','applicant_questionnaire','gas_work_record','cylinder_work_record','gas_inspection_report','cylinder_inspection_report'].map(type=>({type}));
    const state={organizationId:'org',status:'draft',usesTwoCylinders:false,secondCylinderSerial:'B',photos,vehicle:{owners:[{}],cylinders:[{fuelType:'СНГ',producedAt:new Date('2025-01-01')}]}};
    const prisma={inspection:{findUnique:jest.fn(async()=>state)}};
    const svc=new InspectionsService(prisma as never,{} as never,{} as never);
    const user={sub:'admin',phone:'+70000000000',roles:['super_admin']};
    expect((await svc.readiness('i',user)).ready).toBe(true);
    state.usesTwoCylinders=true;
    expect((await svc.readiness('i',user)).missing).toEqual(expect.arrayContaining(['cylinder_label_2','cylinder_work_record_2','cylinder_inspection_report_2']));
    photos.push(...['cylinder_label_2','cylinder_work_record_2','cylinder_inspection_report_2'].map(type=>({type,cylinderSerial:'B'})));
    expect((await svc.readiness('i',user)).ready).toBe(true);
    state.secondCylinderSerial='C';
    expect((await svc.readiness('i',user)).ready).toBe(false);
  });
});
