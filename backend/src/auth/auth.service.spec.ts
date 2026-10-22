import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, GoneException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { INITIAL_PASSWORD_HASH } from './initial-password';

const secrets={JWT_ACCESS_SECRET:'test-access-secret-with-enough-length',JWT_REFRESH_SECRET:'test-refresh-secret-with-enough-length'};
function setup(overrides:Record<string,unknown>={}) {
  const user={id:'u1',phone:'+77001234567',passwordHash:INITIAL_PASSWORD_HASH,mustChangePassword:true,passwordVersion:0,isBlocked:false,failedPasswordAttempts:0,passwordLockedUntil:null,roles:[{role:'vehicle_owner'}],...overrides};
  const prisma:any={user:{findUnique:jest.fn(async()=>user),findUniqueOrThrow:jest.fn(async()=>user),update:jest.fn(async()=>user),updateMany:jest.fn(async({data}:any)=>{Object.assign(user,data,{passwordVersion:1});return {count:1};})},session:{create:jest.fn(async()=>({id:'s1'})),update:jest.fn(async()=>({})),updateMany:jest.fn(async()=>({count:1})),findUnique:jest.fn()},organization:{findUnique:jest.fn()},organizationMember:{findFirst:jest.fn()},userRole:{upsert:jest.fn()}};
  prisma.$transaction=async(fn:any)=>fn(prisma);
  const jwt=new JwtService();
  const auth=new AuthService(prisma,jwt,{get:(key:string)=>secrets[key as keyof typeof secrets]} as ConfigService,{log:jest.fn(async()=>{})} as never);
  return {auth,prisma,user,jwt};
}
describe('password authentication',()=>{
  it('recognizes the shared temporary password and creates no session until changed',async()=>{
    const {auth,prisma,jwt}=setup();
    expect(await bcrypt.compare('123456',INITIAL_PASSWORD_HASH)).toBe(true);
    const result=await auth.login('87001234567','123456');
    expect(result).toMatchObject({requiresPasswordChange:true});
    expect(prisma.session.create).not.toHaveBeenCalled();
    const proof=await jwt.verifyAsync((result as any).passwordChangeToken,{secret:secrets.JWT_ACCESS_SECRET});
    expect(proof).toMatchObject({sub:'u1',scope:'password_change',pv:0});
    expect(result).not.toHaveProperty('accessToken');
  });
  it('changes the password once, revokes sessions and then permits personal-password login',async()=>{
    const {auth,prisma,user}=setup();
    const login:any=await auth.login(user.phone,'123456');
    const result=await auth.changeInitialPassword(login.passwordChangeToken,'Personal123!','Personal123!');
    expect(result).toHaveProperty('accessToken');
    expect(user.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('Personal123!',user.passwordHash)).toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalled();
    await expect(auth.changeInitialPassword(login.passwordChangeToken,'Another123!','Another123!')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login(user.phone,'123456')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.login(user.phone,'Personal123!')).resolves.toHaveProperty('accessToken');
  });
  it('rejects weak and mismatched passwords',async()=>{
    const {auth}=setup();
    await expect(auth.changeInitialPassword('token','123456','123456')).rejects.toBeInstanceOf(BadRequestException);
    await expect(auth.changeInitialPassword('token','Personal123!','different')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects incorrect credentials and blocked users',async()=>{
    const {auth,prisma}=setup();
    await expect(auth.login('+77001234567','wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.create).not.toHaveBeenCalled();
    await expect(setup({isBlocked:true}).auth.login('+77001234567','123456')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('locks repeated failures and does not register unknown numbers',async()=>{
    const {auth,prisma,user}=setup({failedPasswordAttempts:5});
    await expect(auth.login(user.phone,'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({data:{passwordLockedUntil:expect.any(Date)}}));
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(auth.login(user.phone,'123456')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
  it('requires active organization membership for quality control and inspectors',async()=>{
    const {auth,prisma}=setup({roles:[]});
    prisma.organization.findUnique.mockResolvedValue({id:'org',type:'inspection_org',status:'active'});
    prisma.organizationMember.findFirst.mockResolvedValue({role:'quality_control'});
    await expect(auth.login('+77001234567','123456',{role:'inspection_org',bin:'220340010835'})).resolves.toMatchObject({requiresPasswordChange:true});
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'org',userId:'u1',role:{in:expect.arrayContaining(['quality_control','inspector'])}})}));
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    await expect(auth.login('+77001234567','123456',{role:'inspection_org',bin:'220340010835'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([['government','nca'],['nca','government']])('resolves control entry %s to the assigned role %s before password change',async(requested,assigned)=>{
    const {auth,prisma,jwt}=setup({roles:[{role:assigned}]});
    const result:any=await auth.login('+77001234567','123456',{role:requested});
    expect(result.requiresPasswordChange).toBe(true);
    const proof=await jwt.verifyAsync(result.passwordChangeToken,{secret:secrets.JWT_ACCESS_SECRET});
    expect(proof.role).toBe(assigned);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
  it('does not permit control entry for users without either control role',async()=>{
    const {auth}=setup();
    await expect(auth.login('+77001234567','123456',{role:'nca'})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.login('+77001234567','123456',{role:'government'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not self-assign privileged roles and disables both SMS endpoints',()=>{
    const {auth}=setup();
    expect(()=>auth['requestedRole']('super_admin')).toThrow(ForbiddenException);
    expect(()=>auth.sendOtp()).toThrow(GoneException);
    expect(()=>auth.verifyOtp()).toThrow(GoneException);
  });
  it('refuses refresh before mandatory password change and after version reset',async()=>{
    const {auth,prisma,jwt,user}=setup();
    const token=await jwt.signAsync({sub:user.id,sid:'s1',pv:0,scope:'session'},{secret:secrets.JWT_REFRESH_SECRET});
    prisma.session.findUnique.mockResolvedValue({userId:user.id,user,expiresAt:new Date(Date.now()+60000),revokedAt:null});
    await expect(auth.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    user.mustChangePassword=false;user.passwordVersion=1;
    await expect(auth.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
