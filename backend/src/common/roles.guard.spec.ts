import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, jest } from '@jest/globals';
import { RequestUser } from './current-user';
import { Role } from './roles';
import { RolesGuard } from './roles.guard';

function context(user: RequestUser): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const requiredAdminRoles: Role[] = ['operator', 'nca', 'government', 'super_admin'];

  function guard() {
    return new RolesGuard({
      getAllAndOverride: jest.fn(() => requiredAdminRoles),
    } as unknown as Reflector);
  }

  it('rejects non-admin roles for admin-only endpoints', () => {
    expect(() =>
      guard().canActivate(
        context({
          sub: 'user_1',
          phone: '+77001234567',
          roles: ['vehicle_owner'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles for admin-only endpoints', () => {
    expect(
      guard().canActivate(
        context({
          sub: 'user_2',
          phone: '+77007654321',
          roles: ['operator'],
        }),
      ),
    ).toBe(true);
  });
});
