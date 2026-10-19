import { describe, expect, it } from '@jest/globals';
import { omitSensitiveFields } from './sensitive-fields.interceptor';
describe('credential redaction',()=>{
  it('removes nested hashes and lockout state without changing dates and public profile fields',()=>{
    const date=new Date();
    expect(omitSensitiveFields({createdAt:date,members:[{user:{fullName:'Сотрудник',passwordHash:'secret',passwordVersion:2,failedPasswordAttempts:3,passwordLockedUntil:date,mustChangePassword:true}}]})).toEqual({createdAt:date,members:[{user:{fullName:'Сотрудник',mustChangePassword:true}}]});
  });
});
