import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, jest } from '@jest/globals';
import { JwtAuthGuard } from './jwt-auth.guard';

function context(token: string): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: `Bearer ${token}` },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('returns unauthorized for malformed or expired tokens instead of leaking jwt errors as 500', async () => {
    const guard = new JwtAuthGuard(
      { verifyAsync: jest.fn(async () => { throw new Error('jwt malformed'); }) } as unknown as JwtService,
      { get: jest.fn(() => 'production_access_secret') } as unknown as ConfigService,
      { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector,
      { session: { findUnique: jest.fn() } } as never,
    );

    await expect(guard.canActivate(context('broken-token'))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('mandatory password change protection',()=>{
  it('rejects a password-change proof as API authorization without looking up sessions',async()=>{
    const lookup=jest.fn();
    const guard=new JwtAuthGuard({verifyAsync:jest.fn(async()=>({sub:'u1',scope:'password_change',pv:0}))} as unknown as JwtService,{get:()=> 'test-secret'} as unknown as ConfigService,{getAllAndOverride:()=>false} as unknown as Reflector,{session:{findUnique:lookup}} as never);
    await expect(guard.canActivate(context('change-proof'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lookup).not.toHaveBeenCalled();
  });
});
