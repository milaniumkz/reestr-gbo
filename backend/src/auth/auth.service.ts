import { PUBLISHED_OFFER } from '../legal/published-offer';
import { enforceRateLimit } from '../technical/rate-limit';
import {accountContext} from '../observability/account-context';
import { BadRequestException, ForbiddenException, GoneException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { INITIAL_PASSWORD_HASH } from './initial-password';

type LoginContext = { offerVersion?: string; role?: string; bin?: string; deviceName?: string };
type ChangeProof = { offerVersion?:string; sub:string; scope:string; pv:number; role:string; bin?:string; deviceName?:string };
type SessionPayload = {sub:string;phone:string;roles:string[];sid:string;pv:number;scope:'session'};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  sendOtp(..._args: unknown[]): never { throw new GoneException('SMS-вход отключён. Обновите приложение и войдите по паролю'); }
  verifyOtp(..._args: unknown[]): never { throw new GoneException('SMS-вход отключён. Обновите приложение и войдите по паролю'); }

  async login(phone:string,password:string,input:LoginContext={},ipAddress?:string) {
    const normalized = this.normalizePhone(phone);
    let role = this.requestedRole(input.role);
    const user = await this.prisma.user.findUnique({where:{phone:normalized},include:{roles:true}});
    // The client exposes one control-authority entry for both assigned roles.
    // Resolve only within those roles; never grant a role through login.
    if (role === 'nca' && !user?.roles.some(r => r.role === 'nca') && user?.roles.some(r => r.role === 'government')) role = 'government';
    else if (role === 'government' && !user?.roles.some(r => r.role === 'government') && user?.roles.some(r => r.role === 'nca')) role = 'nca';
    accountContext({actorId:user?.id,verified:false,requestedRole:role});
    if (user?.passwordLockedUntil && user.passwordLockedUntil > new Date()){accountContext({verified:false,reasonCode:'login_locked'});throw new UnauthorizedException('Вход временно ограничен. Повторите через 15 минут');}
    const valid = typeof password === 'string' && Buffer.byteLength(password,'utf8') <= 72 && await bcrypt.compare(password,user?.passwordHash ?? INITIAL_PASSWORD_HASH);
    if (!user || !valid) {
      accountContext({verified:false,reasonCode:'credentials_invalid'});
      if (user) {
        const failed = await this.prisma.user.update({where:{id:user.id},data:{failedPasswordAttempts:{increment:1}}});
        if (failed.failedPasswordAttempts >= 5) await this.prisma.user.update({where:{id:user.id},data:{passwordLockedUntil:new Date(Date.now()+15*60_000)}});
      }
      await this.audit.log('auth.password_failed','auth',undefined,user?.id,{verified:false},ipAddress);
      throw new UnauthorizedException('Неверный телефон или пароль');
    }
    if (input.offerVersion && input.offerVersion !== PUBLISHED_OFFER.version) throw new BadRequestException('Условия оферты обновлены. Обновите страницу или приложение и повторите вход');
    accountContext({actorId:user.id,verified:true});
    await this.assertAccess(user,role,input.bin);
    await this.prisma.user.update({where:{id:user.id},data:{failedPasswordAttempts:0,passwordLockedUntil:null}});
    if (user.mustChangePassword) {
      accountContext({verified:true,reasonCode:'password_change_required'});
      const passwordChangeToken = await this.jwt.signAsync({sub:user.id,scope:'password_change',pv:user.passwordVersion,role,offerVersion:input.offerVersion,bin:input.bin?.trim(),deviceName:input.deviceName},{secret:this.jwtSecret('JWT_ACCESS_SECRET'),expiresIn:'10m'});
      return {requiresPasswordChange:true as const,passwordChangeToken};
    }
    return this.startSession(user.id,{...input,role},ipAddress);
  }

  async changeInitialPassword(token:string,password:string,confirmation:string,ipAddress?:string) {
    this.validateNewPassword(password,confirmation);
    let proof:ChangeProof;
    try { proof=await this.jwt.verifyAsync<ChangeProof>(token,{secret:this.jwtSecret('JWT_ACCESS_SECRET')}); }
    catch(error) { if(error instanceof InternalServerErrorException) throw error; throw new UnauthorizedException('Время смены пароля истекло. Войдите заново'); }
    if(proof.scope!=='password_change'||!proof.sub||!Number.isInteger(proof.pv)) throw new UnauthorizedException('Неверное подтверждение смены пароля');
    const user=await this.prisma.user.findUnique({where:{id:proof.sub},include:{roles:true}});
    if(!user||!user.mustChangePassword||user.passwordVersion!==proof.pv) throw new UnauthorizedException('Пароль уже изменён. Войдите заново');
    await this.assertAccess(user,this.requestedRole(proof.role),proof.bin);
    if(await bcrypt.compare(password,user.passwordHash)) throw new BadRequestException('Новый пароль должен отличаться от временного');
    const hash=await bcrypt.hash(password,12);
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id},1))`;
      const changed=await tx.user.updateMany({where:{id:user.id,passwordVersion:proof.pv,mustChangePassword:true,isBlocked:false},data:{passwordHash:hash,mustChangePassword:false,passwordVersion:{increment:1},passwordChangedAt:new Date(),failedPasswordAttempts:0,passwordLockedUntil:null}});
      if(changed.count!==1) throw new UnauthorizedException('Пароль уже изменён. Войдите заново');
      await tx.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.passwordRecovery.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:new Date()}});
      await tx.passwordRecoveryRequest.updateMany({where:{userId:user.id,status:'pending'},data:{status:'completed'}});
    });
    await this.audit.log('auth.password_changed','user',user.id,user.id,{firstLogin:true},ipAddress);
    return this.startSession(user.id,proof,ipAddress);
  }

  async changePersonalPassword(userId: string, input: {bin:string;phone:string;oldPassword:string;newPassword:string;confirmation:string}, ip?: string) {
    await enforceRateLimit(this.prisma, `password-update:${userId}`, 5, 900);
    this.validateNewPassword(input.newPassword,input.confirmation);
    const user = await this.prisma.user.findUnique({where:{id:userId}});
    const member = await this.prisma.organizationMember.findFirst({where:{userId,organization:{bin:input.bin,status:'active'}}});
    if (!user || user.isBlocked || this.normalizePhone(input.phone) !== user.phone || !member || !await bcrypt.compare(input.oldPassword,user.passwordHash)) {
      await this.audit.log('auth.password_update_failed','user',userId,userId,{reason:'identity_or_password_mismatch'},ip);
      throw new BadRequestException('Проверьте БИН организации, телефон и старый пароль');
    }
    if (await bcrypt.compare(input.newPassword,user.passwordHash)) throw new BadRequestException('Новый пароль должен отличаться от старого');
    const hash = await bcrypt.hash(input.newPassword,12);
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},1))`;
      const changed=await tx.user.updateMany({where:{id:userId,passwordVersion:user.passwordVersion,isBlocked:false},data:{passwordHash:hash,mustChangePassword:false,passwordVersion:{increment:1},passwordChangedAt:new Date(),failedPasswordAttempts:0,passwordLockedUntil:null}});
      if(changed.count!==1) throw new UnauthorizedException('Пароль уже изменён. Войдите заново');
      await tx.session.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.passwordRecovery.updateMany({where:{userId,usedAt:null},data:{usedAt:new Date()}});
      await tx.passwordRecoveryRequest.updateMany({where:{userId,status:'pending'},data:{status:'completed'}});
    });
    await this.audit.log('auth.password_changed','user',userId,userId,{firstLogin:false},ip);
    return {ok:true,message:'Пароль изменён. Войдите заново.'};
  }

  private validateNewPassword(password:string,confirmation:string) {
    if(typeof password!=='string'||password.length<8||Buffer.byteLength(password,'utf8')>72) throw new BadRequestException('Новый пароль: минимум 8 символов, максимум 72 байта');
    if(password==='123456'||!password.trim()) throw new BadRequestException('Установите собственный пароль');
    if(password!==confirmation) throw new BadRequestException('Пароли не совпадают');
  }

  private async assertAccess(user:{id:string;isBlocked:boolean;roles:Array<{role:string}>},role:string,bin?:string) {
    let organizationId: string | undefined;
    if(user.isBlocked){accountContext({verified:true,reasonCode:'account_blocked'});throw new ForbiddenException('Пользователь заблокирован');}
    const superAdmin=user.roles.some(r=>r.role==='super_admin');
    if(role==='inspection_org'||role==='operator') {
      if(!/^\d{12}$/.test(bin?.trim()??'')) throw new BadRequestException('Введите БИН организации из 12 цифр');
      const organization=await this.prisma.organization.findUnique({where:{bin:bin!.trim()}});
      organizationId = organization?.id;
      if(organization)accountContext({verified:true,organizationId:organization.id});
      if(!organization||organization.type!==role||organization.status!=='active') throw new ForbiddenException('Организация не найдена или заблокирована');
      const membership=await this.prisma.organizationMember.findFirst({where:{organizationId:organization.id,userId:user.id,...(role==='inspection_org'?{role:{in:['inspection_org','inspector','admin','quality_control']}}:{role:{in:['operator','admin']}})}});
      if(!membership&&!superAdmin){accountContext({verified:true,reasonCode:'organization_membership_missing'});throw new ForbiddenException('Сотрудник не состоит в выбранной организации');}
      if(role==='inspection_org'&&!user.roles.some(r=>r.role==='inspection_org')) await this.prisma.userRole.upsert({where:{userId_role:{userId:user.id,role:'inspection_org'}},update:{},create:{userId:user.id,role:'inspection_org'}});
    } else if(['nca','government'].includes(role)&&!superAdmin&&!user.roles.some(r=>r.role===role)) {
      throw new ForbiddenException('Нет доступа к выбранному органу');
    }
    return organizationId;
  }

  private async startSession(userId:string,input:LoginContext,ipAddress?:string) {
    const user=await this.prisma.user.findUniqueOrThrow({where:{id:userId},include:{roles:true}});
    if(user.mustChangePassword||user.isBlocked) throw new ForbiddenException('Требуется смена пароля или пользователь заблокирован');
    if (input.offerVersion && input.offerVersion !== PUBLISHED_OFFER.version) throw new BadRequestException('Условия оферты обновлены. Обновите страницу или приложение и повторите вход');
    const organizationId = await this.assertAccess(user,this.requestedRole(input.role),input.bin);
    const roles=user.roles.map(r=>r.role);
    const session=await this.prisma.session.create({data:{userId,refreshHash:'pending',deviceName:input.deviceName,ipAddress,expiresAt:this.refreshExpiresAtForRoles(roles)}});
    accountContext({actorId:user.id,verified:true,sessionId:session.id});
    const result=await this.issueTokens({sub:user.id,phone:user.phone,roles,sid:session.id,pv:user.passwordVersion,scope:'session'});
    await this.prisma.user.update({where:{id:userId},data:{lastLoginAt:new Date()}});
    await this.audit.log('auth.login','session',session.id,user.id,{requestedRole:input.role,deviceName:input.deviceName},ipAddress);
    if (input.offerVersion) await this.audit.log('auth.offer_accepted','public_offer',PUBLISHED_OFFER.version,user.id,{version:PUBLISHED_OFFER.version,source:'login_button',verificationMethod:'password',...(organizationId ? {organizationId} : {})},ipAddress);
    return result;
  }

  async refresh(refreshToken:string,ipAddress?:string) {
    let payload:SessionPayload;
    try { payload=await this.jwt.verifyAsync<SessionPayload>(refreshToken,{secret:this.jwtSecret('JWT_REFRESH_SECRET')}); }
    catch(error) {if(error instanceof InternalServerErrorException) throw error;throw new UnauthorizedException('Недействительная сессия');}
    if(payload.scope!=='session'||!payload.sid||!payload.sub) throw new UnauthorizedException('Недействительная сессия');
    const session=await this.prisma.session.findUnique({where:{id:payload.sid},include:{user:{include:{roles:true}}}});
    if(!session||session.userId!==payload.sub||session.revokedAt||session.expiresAt<=new Date()||session.user.isBlocked||session.user.mustChangePassword||session.user.passwordVersion!==payload.pv) throw new UnauthorizedException('Войдите заново по паролю');
    const roles=session.user.roles.map(r=>r.role);
    if(this.isInspectionSessionExpired(session.createdAt,roles)) throw new UnauthorizedException('Сессия истекла');
    if(!await bcrypt.compare(this.refreshFingerprint(refreshToken),session.refreshHash)) throw new UnauthorizedException('Недействительная сессия');
    const result=await this.issueTokens({sub:session.user.id,phone:session.user.phone,roles,sid:session.id,pv:session.user.passwordVersion,scope:'session'});
    await this.audit.log('auth.refresh','session',session.id,session.user.id,undefined,ipAddress);
    return result;
  }

  async logout(user?:{sid?:string;sub?:string},ipAddress?:string) {
    if(!user?.sid) return {ok:true};
    await this.prisma.session.updateMany({where:{id:user.sid,revokedAt:null},data:{revokedAt:new Date()}});
    await this.audit.log('auth.logout','session',user.sid,user.sub,undefined,ipAddress);
    return {ok:true};
  }

  private async issueTokens(payload:SessionPayload) {
    const sessionExpiresAt=this.refreshExpiresAtForRoles(payload.roles);
    const accessToken=await this.jwt.signAsync(payload,{secret:this.jwtSecret('JWT_ACCESS_SECRET'),expiresIn:'15m'});
    const refreshToken=await this.jwt.signAsync({...payload,jti:randomUUID()},{secret:this.jwtSecret('JWT_REFRESH_SECRET'),expiresIn:payload.roles.includes('inspection_org')?'12h':'30d'});
    await this.prisma.session.update({where:{id:payload.sid},data:{refreshHash:await bcrypt.hash(this.refreshFingerprint(refreshToken),10),expiresAt:sessionExpiresAt}});
    return {accessToken,refreshToken,sessionExpiresAt,user:payload};
  }
  private refreshFingerprint(token:string) {return createHash('sha256').update(token).digest('hex');}
  private refreshExpiresAtForRoles(roles:string[]) {return new Date(Date.now()+(roles.includes('inspection_org')?12*60*60_000:30*24*60*60_000));}
  private isInspectionSessionExpired(createdAt:Date,roles:string[]) {return roles.includes('inspection_org')&&createdAt.getTime()+12*60*60_000<=Date.now();}
  private normalizePhone(value:string) {
    const digits=value.replace(/\D/g,'');
    if(digits.length===10) return `+7${digits}`;
    if(digits.length===11&&digits.startsWith('8')) return `+7${digits.slice(1)}`;
    if(digits.length>=10&&digits.length<=15) return `+${digits}`;
    throw new BadRequestException('Проверьте номер телефона');
  }
  private requestedRole(role?:string) {if(!role) return 'vehicle_owner';if(['vehicle_owner','inspection_org','operator','government','nca'].includes(role)) return role;throw new ForbiddenException('Роль не назначается при входе');}
  private jwtSecret(name:'JWT_ACCESS_SECRET'|'JWT_REFRESH_SECRET') {const value=this.config.get<string>(name);if(!value||value.startsWith('replace_')||value.startsWith('dev_')) throw new InternalServerErrorException(`${name} is not configured`);return value;}
}
