import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './sms.provider';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sms: SmsProvider,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async sendOtp(phone: string, ipAddress?: string, role = 'vehicle_owner') {
    const normalizedPhone = this.normalizePhone(phone);
    const requestedRole = this.requestedRole(role);
    if (requestedRole === 'inspection_org') {
      const allowedUser = await this.prisma.user.findUnique({
        where: { phone: normalizedPhone },
        include: {
          roles: true,
          memberships: { include: { organization: true } },
        },
      });
      const isSuperAdmin = allowedUser?.roles.some((item) => item.role === 'super_admin') ?? false;
      const hasInspectionMembership = allowedUser?.memberships.some((item) =>
        item.organization.type === 'inspection_org' &&
        item.organization.status === 'active' &&
        ['inspection_org', 'inspector', 'admin', 'quality_control'].includes(item.role),
      ) ?? false;
      const isAllowed =
        allowedUser?.isBlocked === false &&
        (isSuperAdmin || hasInspectionMembership);
      if (!isAllowed) {
        await this.audit.log('auth.inspection_otp_denied', 'auth', normalizedPhone, allowedUser?.id, { requestedRole }, ipAddress);
        throw new ForbiddenException('Данного номера нет в списке инспекционных органов');
      }
    }
    if (['nca', 'government'].includes(requestedRole)) {
      const allowedUser = await this.prisma.user.findUnique({
        where: { phone: normalizedPhone },
        include: { roles: true },
      });
      const isAllowed = allowedUser?.isBlocked === false &&
        allowedUser.roles.some((item) => ['nca', 'government', 'super_admin'].includes(item.role));
      if (!isAllowed) {
        await this.audit.log('auth.control_otp_denied', 'auth', normalizedPhone, allowedUser?.id, { requestedRole }, ipAddress);
        throw new ForbiddenException('Данного номера нет в списке контрольных органов');
      }
    }
    const recent = await this.prisma.otpChallenge.findFirst({
      where: {
        phone: normalizedPhone,
        purpose: 'login',
        createdAt: { gt: new Date(Date.now() - 30_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) throw new BadRequestException('OTP resend cooldown is active');

    const code = this.sms.isMockEnabled()
      ? this.config.get<string>('SMS_MOCK_CODE') ?? '1111'
      : String(randomInt(1000, 10_000));
    const expiresAt = new Date(Date.now() + 120_000);
    await this.sms.sendOtp(normalizedPhone, code);
    await this.prisma.otpChallenge.create({
      data: {
        phone: normalizedPhone,
        codeHash: await bcrypt.hash(code, 10),
        purpose: 'login',
        expiresAt,
        ipAddress,
      },
    });
    await this.audit.log('auth.otp_sent', 'auth', normalizedPhone, undefined, { phone: normalizedPhone }, ipAddress);
    return {
      ok: true,
      ttlSeconds: 120,
      ...(this.sms.isMockEnabled() ? { code } : {}),
    };
  }

  async verifyOtp(
    phone: string,
    code: string,
    deviceName?: string,
    ipAddress?: string,
    role = 'vehicle_owner',
    bin?: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    const requestedRole = this.requestedRole(role);
    const normalizedBin = bin?.trim() ?? '';
    if (['inspection_org', 'operator'].includes(requestedRole) && !/^\d{12}$/.test(normalizedBin)) {
      throw new BadRequestException('Valid organization BIN is required');
    }
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone: normalizedPhone,
        purpose: 'login',
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new UnauthorizedException('Invalid OTP');
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.audit.log('auth.otp_blocked', 'auth', normalizedPhone, undefined, { reason: 'attempts_exceeded' }, ipAddress);
      throw new UnauthorizedException('OTP attempts exceeded');
    }

    const isValid = await bcrypt.compare(code, challenge.codeHash);
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: { increment: 1 },
        ...(isValid ? { verifiedAt: new Date() } : {}),
      },
    });
    if (!isValid) {
      await this.audit.log('auth.otp_failed', 'auth', normalizedPhone, undefined, { attempts: challenge.attempts + 1 }, ipAddress);
      throw new UnauthorizedException('Invalid OTP');
    }

    const user = await this.prisma.user.upsert({
      where: { phone: normalizedPhone },
      update: { lastLoginAt: new Date() },
      create: {
        phone: normalizedPhone,
        fullName: 'Пользователь ЕРСИ ГБО',
        lastLoginAt: new Date(),
        roles: { create: [{ role: 'vehicle_owner' }] },
      },
      include: { roles: true },
    });
    if (user.isBlocked) throw new ForbiddenException('User is blocked');

    const selfServiceRoles = ['vehicle_owner', 'operator'];
    if (selfServiceRoles.includes(requestedRole)) {
      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: requestedRole } },
        update: {},
        create: { userId: user.id, role: requestedRole },
      });
    } else if (!user.roles.some((item) => item.role === requestedRole)) {
      const inspectionMembershipAllowed = requestedRole === 'inspection_org'
        ? await this.isInspectionMemberForBin(user.id, normalizedBin)
        : false;
      if (!inspectionMembershipAllowed) {
        await this.audit.log('auth.role_denied', 'auth', normalizedPhone, user.id, { requestedRole }, ipAddress);
        throw new ForbiddenException(
          requestedRole === 'inspection_org'
            ? 'Данного номера нет в списке инспекционных органов'
            : 'Role is not assigned',
        );
      }
    }

    if (requestedRole === 'inspection_org') {
      const organization = await this.prisma.organization.findUnique({
        where: { bin: normalizedBin },
      });
      if (!organization || organization.type !== 'inspection_org' || organization.status !== 'active') {
        throw new ForbiddenException('Инспекционный орган не найден или заблокирован');
      }
      const isMember = await this.isInspectionMemberForBin(user.id, normalizedBin);
      const isSuperAdmin = user.roles.some((item) => item.role === 'super_admin');
      if (!isMember && !isSuperAdmin) {
        throw new ForbiddenException('Данного номера нет в списке инспекционных органов');
      }
      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: 'inspection_org' } },
        update: {},
        create: { userId: user.id, role: 'inspection_org' },
      });
    }

    if (requestedRole === 'operator') {
      const organization = await this.prisma.organization.upsert({
        where: { bin: normalizedBin },
        update: {
          type: requestedRole,
        },
        create: {
          type: requestedRole,
          name: `Организация ${normalizedBin}`,
          bin: normalizedBin,
        },
      });
      if (organization.status !== 'active') {
        throw new ForbiddenException('Organization is not active');
      }
      await this.prisma.organizationMember.upsert({
        where: {
          organizationId_userId_role: {
            organizationId: organization.id,
            userId: user.id,
            role: requestedRole,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          userId: user.id,
          role: requestedRole,
        },
      });
      await this.audit.log('auth.organization_registered', 'organization', organization.id, user.id, {
        bin: normalizedBin,
        role: requestedRole,
      }, ipAddress);
    }

    const activeInspectionMembership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: user.id,
        role: { in: ['inspection_org', 'inspector', 'admin', 'quality_control'] },
        organization: {
          type: 'inspection_org',
          status: 'active',
        },
      },
      select: { id: true },
    });
    if (activeInspectionMembership) {
      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: 'inspection_org' } },
        update: {},
        create: { userId: user.id, role: 'inspection_org' },
      });
    }

    const userWithRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: true },
    });

    const session = await this.prisma.session.create({
      data: {
        userId: userWithRoles.id,
        refreshHash: 'pending',
        deviceName,
        ipAddress,
        expiresAt: this.refreshExpiresAtForRoles(userWithRoles.roles.map((item) => item.role)),
      },
    });

    const payload = {
      sub: userWithRoles.id,
      phone: userWithRoles.phone,
      roles: userWithRoles.roles.map((item) => item.role),
      sid: session.id,
    };
    const result = await this.issueTokens(payload);
    await this.audit.log('auth.login', 'session', session.id, userWithRoles.id, {
      phone: normalizedPhone,
      roles: payload.roles,
      deviceName,
      requestedRole,
    }, ipAddress);
    return result;
  }

  async refresh(refreshToken: string, ipAddress?: string) {
    const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(refreshToken, {
      secret: this.jwtSecret('JWT_REFRESH_SECRET'),
    });
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { roles: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }
    const roles = session.user.roles.map((item) => item.role);
    if (this.isInspectionSessionExpired(session.createdAt, roles)) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log('auth.session_expired', 'session', session.id, session.user.id, { roles }, ipAddress);
      throw new UnauthorizedException('Session expired');
    }
    if (session.user.isBlocked) throw new ForbiddenException('User is blocked');
    if (!(await bcrypt.compare(refreshToken, session.refreshHash))) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.issueTokens({
      sub: session.user.id,
      phone: session.user.phone,
      roles,
      sid: session.id,
    });
    await this.audit.log('auth.refresh', 'session', session.id, session.user.id, undefined, ipAddress);
    return result;
  }

  async logout(user?: { sid?: string; sub?: string }, ipAddress?: string) {
    if (!user?.sid) return { ok: true };
    await this.prisma.session.updateMany({
      where: { id: user.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log('auth.logout', 'session', user.sid, user.sub, undefined, ipAddress);
    return { ok: true };
  }

  private async issueTokens(payload: { sub: string; phone: string; roles: string[]; sid: string }) {
    const sessionExpiresAt = this.refreshExpiresAtForRoles(payload.roles);
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.jwtSecret('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.jwtSecret('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshJwtTtlForRoles(payload.roles),
    });
    await this.prisma.session.update({
      where: { id: payload.sid },
      data: {
        refreshHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: sessionExpiresAt,
      },
    });
    return { accessToken, refreshToken, sessionExpiresAt, user: payload };
  }

  private refreshExpiresAtForRoles(roles: string[]) {
    const expiresAt = new Date();
    if (roles.includes('inspection_org')) {
      expiresAt.setHours(expiresAt.getHours() + 12);
      return expiresAt;
    }
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  private refreshJwtTtlForRoles(roles: string[]) {
    return roles.includes('inspection_org') ? '12h' : '30d';
  }

  private isInspectionSessionExpired(createdAt: Date, roles: string[]) {
    if (!roles.includes('inspection_org')) return false;
    return createdAt.getTime() + 12 * 60 * 60 * 1000 <= Date.now();
  }

  private async isInspectionMemberForBin(userId: string, bin: string) {
    if (!/^\d{12}$/.test(bin)) return false;
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        role: { in: ['inspection_org', 'inspector', 'admin', 'quality_control'] },
        organization: {
          bin,
          type: 'inspection_org',
          status: 'active',
        },
      },
    });
    return Boolean(membership);
  }

  private normalizePhone(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!digits) throw new BadRequestException('Phone is required');
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException('Phone format is invalid');
    }
    if (digits.startsWith('7')) return `+${digits}`;
    if (digits.startsWith('8')) return `+7${digits.slice(1)}`;
    return `+7${digits}`;
  }

  private requestedRole(value?: string) {
    if (!value || value === 'vehicle_owner') return 'vehicle_owner';
    if (value === 'inspection_org') return 'inspection_org';
    if (value === 'operator') return 'operator';
    if (value === 'government') return 'government';
    if (value === 'nca') return 'nca';
    throw new ForbiddenException('Role cannot be self-assigned');
  }

  private jwtSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
    const value = this.config.get<string>(name);
    if (!value || value.startsWith('replace_') || value.startsWith('dev_')) {
      throw new InternalServerErrorException(`${name} is not configured`);
    }
    return value;
  }
}
