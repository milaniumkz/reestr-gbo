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

describe('inspector identity gate',()=>{
 function fixture(role:string,verified=false){
  const request:any={headers:{authorization:'Bearer token'},originalUrl:'/api/v1/inspections',method:'POST'};
  const session={identityVerifiedAt:verified?new Date():null,expiresAt:new Date(Date.now()+60_000),revokedAt:null,user:{id:'u',phone:'+7',isBlocked:false,mustChangePassword:false,passwordVersion:1,roles:[{role:'inspection_org'}],memberships:[{role}]}};
  const db={session:{findUnique:jest.fn(async()=>session)},technicalSetting:{findUnique:jest.fn(async()=>({value:true}))}};
  const guard=new JwtAuthGuard({verifyAsync:jest.fn(async()=>({sub:'u',sid:'session',scope:'session',pv:1}))} as unknown as JwtService,{get:()=> 'production-secret'} as unknown as ConfigService,{getAllAndOverride:()=>false} as unknown as Reflector,db as never);
  const ctx={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>request})} as unknown as ExecutionContext;
  return {guard,ctx,request,db};
 }
 it('blocks direct API access without a verified session',async()=>{const f=fixture('inspector');await expect(f.guard.canActivate(f.ctx)).rejects.toMatchObject({response:expect.objectContaining({code:'INSPECTOR_IDENTITY_REQUIRED'})});});
 it('allows identity and logout endpoints while pending',async()=>{for(const path of ['/api/v1/auth/identity/status','/api/v1/auth/identity/challenge','/api/v1/auth/logout']){const f=fixture('inspector');f.request.originalUrl=path;await expect(f.guard.canActivate(f.ctx)).resolves.toBe(true);}});
 it.each(['admin','quality_control'])('does not block %s',async role=>{const f=fixture(role);await expect(f.guard.canActivate(f.ctx)).resolves.toBe(true);});
 it('accepts the verified DB session',async()=>{const f=fixture('inspector',true);await expect(f.guard.canActivate(f.ctx)).resolves.toBe(true);});
 it('stays inactive during staged deployment',async()=>{const f=fixture('inspector');f.db.technicalSetting.findUnique.mockResolvedValue({value:false});await expect(f.guard.canActivate(f.ctx)).resolves.toBe(true);});
});
