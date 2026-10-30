import { jest } from '@jest/globals';
import { activeCylinderPhotos, cylinderPair } from './cylinder-pair';
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

describe('Exact photo duplicates', () => {
  it('shows 10 documents rather than 16 after six repeated uploads, preserving the newest copies', () => {
    const originals = Array.from({length:10}, (_,i)=>({id:`original-${i}`,type:`type-${i}`,checksum:`checksum-${i}`,createdAt:new Date(1000)}));
    const repeats = originals.slice(0,6).map(photo=>({...photo,id:`repeat-${photo.id}`,createdAt:new Date(2000)}));
    const visible = activeCylinderPhotos({}, [...repeats,...originals]);
    expect(visible).toHaveLength(10);
    expect(visible.map(photo=>photo.id)).toEqual([...repeats,...originals.slice(6)].map(photo=>photo.id));
    expect(activeCylinderPhotos({}, [...originals,...repeats])).toHaveLength(10);
  });
  it('retains different files, separate slots, separate cylinder serials and legacy files without checksums', () => {
    const photos = [
      {type:'photo',checksum:'A',cylinderSerial:'1'},
      {type:'photo',checksum:'B',cylinderSerial:'1'},
      {type:'photo',checksum:'A',cylinderSerial:'2'},
      {type:'tech_passport',checksum:'A'},
      {type:'photo'}, {type:'photo'},
    ];
    expect(activeCylinderPhotos({},photos)).toEqual(photos);
  });
});
