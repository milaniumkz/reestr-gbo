import { ownerIdentity } from './owner-identity';

describe('owner identity', () => {
  it('keeps existing owners individual and clears a stale BIN', () => {
    expect(ownerIdentity({ iin: '123456789012', bin: '999999999999' }))
      .toEqual({ kind: 'individual', iin: '123456789012', bin: null });
  });
  it('stores legal entity BIN separately from IIN', () => {
    expect(ownerIdentity({ kind: 'legal_entity', bin: ' 001140000001 ', iin: '123456789012' }))
      .toEqual({ kind: 'legal_entity', bin: '001140000001', iin: null });
  });
  it.each(['', '123', '12345678901a', '1234567890123'])('rejects invalid BIN %s', bin => {
    expect(() => ownerIdentity({ kind: 'legal_entity', bin })).toThrow('Введите БИН из 12 цифр');
  });
  it('rejects unsupported owner types', () => {
    expect(() => ownerIdentity({ kind: 'other' })).toThrow();
  });
});
