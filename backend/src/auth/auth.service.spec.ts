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
});
