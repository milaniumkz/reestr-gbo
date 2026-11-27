import {describe,expect,it,jest} from '@jest/globals';
import {InspectionsService} from './inspections.service';

const actor = {sub: 'admin', phone: 'test', roles: ['super_admin']};
function fixture() {
  const rows = new Map<string, any>();
  const certificates = new Map<string, any>();
  const db = {
    certificate: {findUnique: jest.fn(async ({where}: any) => {
      const k = where.organizationId_number;
      return certificates.get(`${k.organizationId}:${k.number}`) ?? null;
    })},
    inspection: {
      findUnique: jest.fn(async ({where}: any) => {
        if (where.id) return [...rows.values()].find(r => r.id === where.id) ?? null;
        const k = where.organizationId_certificateNumber;
        return rows.get(`${k.organizationId}:${k.certificateNumber}`) ?? null;
      }),
      create: jest.fn(async ({data}: any) => {
        const key = `${data.organizationId}:${data.certificateNumber}`;
        if (rows.has(key)) throw {code: 'P2002', meta: {target: ['organizationId','certificateNumber']}};
        const row = {id: 'created', status: 'draft', ...data}; rows.set(key, row); return row;
      }),
    },
    auditLog: {create: jest.fn(async () => ({}))},
  };
  const service = new InspectionsService(db as never, {} as never, {} as never);
  jest.spyOn(service as any, 'reverseGeocode').mockResolvedValue('Астана, улица Тестовая');
  return {rows,certificates,db,service};
}
describe('certificate number availability and creation agree', () => {
  it.each(['10966','.10966',' 10966 .','\u200b.１０９６６.'])('blocks existing draft for equivalent input %s', async number => {
    const f = fixture();
    f.rows.set('org:10966', {id: 'existing', organizationId: 'org', certificateNumber: '10966', createdById: 'other', status: 'draft'});
    expect(await f.service.certificateNumberAvailability(number, undefined, actor, 'org')).toEqual({available: false});
    await expect(f.service.create(actor, {organizationId:'org',vehicleId:'vehicle',certificateNumber:number})).rejects.toThrow('уже есть');
    expect(f.db.inspection.create).not.toHaveBeenCalled();
  });
  it('blocks an issued certificate even when its inspection is absent from the draft lookup', async () => {
    const f = fixture(); f.certificates.set('org:10966', {id:'issued',inspectionId:'old'});
    expect(await f.service.certificateNumberAvailability('.10966.', undefined, actor, 'org')).toEqual({available:false});
    await expect(f.service.create(actor, {organizationId:'org',vehicleId:'vehicle',certificateNumber:'.10966.'})).rejects.toThrow('уже есть');
  });
  it('allows a free number and stores exactly the checked identity', async () => {
    const f = fixture();
    expect(await f.service.certificateNumberAvailability('.10966.', undefined, actor, 'org')).toEqual({available:true});
    const row = await f.service.create(actor, {organizationId:'org',vehicleId:'vehicle',certificateNumber:'.10966.',lat:51,lng:71});
    expect(row.certificateNumber).toBe('10966'); expect(f.rows.size).toBe(1);
  });
  it('allows the same number in a different inspection organization', async () => {
    const f = fixture(); f.rows.set('org:10966',{id:'other-org'}); f.certificates.set('org:10966',{id:'issued'});
    expect(await f.service.certificateNumberAvailability('10966', undefined, actor, 'other')).toEqual({available:true});
    await expect(f.service.create(actor, {organizationId:'other',vehicleId:'vehicle',certificateNumber:'10966',lat:51,lng:71})).resolves.toMatchObject({organizationId:'other',certificateNumber:'10966'});
  });
  it('does not mistake the edited inspection and its own certificate for another record', async () => {
    const f = fixture(); f.rows.set('org:10966',{id:'own',organizationId:'org'}); f.certificates.set('org:10966',{id:'issued',inspectionId:'own'});
    expect(await f.service.certificateNumberAvailability('.10966.','own',actor,'org')).toEqual({available:true});
    f.certificates.set('org:10966',{id:'issued',inspectionId:'different'});
    expect(await f.service.certificateNumberAvailability('10966','own',actor,'org')).toEqual({available:false});
  });
  it('rejects empty dotted input before lookup or geolocation', async () => {
    const f = fixture();
    await expect(f.service.certificateNumberAvailability(' . . ',undefined,actor,'org')).rejects.toThrow('Введите номер');
    await expect(f.service.create(actor,{organizationId:'org',vehicleId:'vehicle',certificateNumber:' . . '})).rejects.toThrow('Введите номер');
    expect(f.db.inspection.create).not.toHaveBeenCalled();
  });
  it('keeps concurrent equivalent creations by different employees unique', async () => {
    const f = fixture();
    const input = {organizationId:'org',vehicleId:'vehicle',lat:51,lng:71};
    const results = await Promise.allSettled([
      f.service.create({...actor,sub:'first'},{...input,certificateNumber:'.10966'}),
      f.service.create({...actor,sub:'second'},{...input,certificateNumber:'10966.'}),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(f.rows.size).toBe(1);
  });
});
