import {describe,expect,it} from '@jest/globals';
import {normalizeCertificateNumber} from './certificate-number';

describe('certificate number identity', () => {
  it.each(['10966','.10966','10966.','.. 10966 ..','\u200b.10966\u2060.', '\uff0e\uff11\uff10\uff19\uff16\uff16\uff0e','\u202610966\u2026','\u00b710966\u00b7'])('compares %s as 10966', value => {
    expect(normalizeCertificateNumber(value)).toBe('10966');
  });
  it.each(['10957-10957.1','10801,10801.1','123/2026','00109'])('preserves meaningful number %s', value => {
    expect(normalizeCertificateNumber(` . ${value} . `)).toBe(value);
  });
  it('preserves letters and case-insensitive identity', () => {
    expect(normalizeCertificateNumber(' .test-1. ')).toBe('TEST-1');
  });
  it.each([undefined,'',' . . ', '\u200b\u2060'])('cannot turn blank punctuation into a reserved number', value => {
    expect(normalizeCertificateNumber(value)).toBe('');
  });
});
