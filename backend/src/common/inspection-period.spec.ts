import { inspectionPeriod } from './inspection-period';
describe('inspection validity by fuel', () => {
  it.each([['СНГ','2028-10-11'],['КПГ','2029-10-11']])('%s uses exact inspection anniversary', (fuel,expected) => {
    expect(inspectionPeriod(fuel,'2026-10-11').validUntil.toISOString().slice(0,10)).toBe(expected);
  });
  it('clamps a leap day to February 28',()=>expect(inspectionPeriod('СНГ','2024-02-29').validUntil.toISOString().slice(0,10)).toBe('2026-02-28'));
  it('rejects unknown fuel',()=>expect(()=>inspectionPeriod('unknown','2026-10-11')).toThrow());
});
