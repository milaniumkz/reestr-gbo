import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { AuthService } from './auth.service';

function config(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('AuthService', () => {
  function service(configValues: Record<string, string | undefined> = {}) {
    return new AuthService(
      { session: { update: jest.fn() } } as never,
      { signAsync: jest.fn() } as never,
      {} as never,
      config(configValues),
      { log: jest.fn() } as never,
    );
  }

  it('rejects token issuing when JWT secrets are placeholders', async () => {
    const auth = service({
        JWT_ACCESS_SECRET: 'replace_access_secret',
        JWT_REFRESH_SECRET: 'replace_refresh_secret',
      });

    await expect(
      auth['issueTokens']({
        sub: 'user_1',
        phone: '+77001234567',
        roles: ['vehicle_owner'],
        sid: 'session_1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects self-assignment of privileged roles', () => {
    const auth = service();
    expect(auth['requestedRole']('vehicle_owner')).toBe('vehicle_owner');
    expect(auth['requestedRole']('inspection_org')).toBe('inspection_org');
    expect(auth['requestedRole']('operator')).toBe('operator');
    expect(auth['requestedRole']('government')).toBe('government');
    expect(auth['requestedRole']('nca')).toBe('nca');
    expect(() => auth['requestedRole']('super_admin')).toThrow(ForbiddenException);
  });
  it('allows quality control SMS and checks membership against the selected BIN', async () => {
    const findMembership = jest.fn(async (query: any) =>
      query.where.role.in.includes('quality_control') && query.where.organization.bin === '220340010835' ? { id: 'qc_member' } : null);
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ id: 'qc_user', isBlocked: false, roles: [],
        memberships: [{ role: 'quality_control', organization: { type: 'inspection_org', status: 'active' } }],
      })) },
      organizationMember: { findFirst: findMembership },
      otpChallenge: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    };
    const sms = { isMockEnabled: () => true, sendOtp: jest.fn(async () => undefined) };
    const auth = new AuthService(prisma as never, {} as never, sms as never, config({}), { log: jest.fn() } as never);
    await expect(auth.sendOtp('+77052574504', undefined, 'inspection_org')).resolves.toMatchObject({ ok: true });
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    await expect(auth['isInspectionMemberForBin']('qc_user', '220340010835')).resolves.toBe(true);
    await expect(auth['isInspectionMemberForBin']('qc_user', '111111111111')).resolves.toBe(false);
  });
  it('denies quality control SMS when the organization is blocked', async () => {
    const auth = new AuthService({ user: { findUnique: jest.fn(async () => ({
      id: 'qc_user', isBlocked: false, roles: [],
      memberships: [{ role: 'quality_control', organization: { type: 'inspection_org', status: 'blocked' } }],
    })) } } as never, {} as never, {} as never, config({}), { log: jest.fn() } as never);
    await expect(auth.sendOtp('+77052574504', undefined, 'inspection_org')).rejects.toBeInstanceOf(ForbiddenException);
  });

});
