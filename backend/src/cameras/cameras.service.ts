import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { hasGlobalAccess, userOrganizationIds } from '../common/access-scope';
import { RequestUser } from '../common/current-user';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CamerasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(user?: RequestUser) {
    const organizationIds = hasGlobalAccess(user) ? undefined : await userOrganizationIds(this.prisma, user);
    const cameras = await this.prisma.camera.findMany({
      where: organizationIds ? { organizationId: { in: organizationIds } } : undefined,
      include: { organization: true },
      take: 100,
    });
    const base = this.config.get<string>('MEDIA_HLS_BASE_URL') ?? '';
    return cameras.map((camera) => ({
      ...camera,
      playbackUrl: camera.hlsPath ? `${base}${camera.hlsPath}` : null,
      rtspUrlEncrypted: undefined,
    }));
  }

  async create(input: {
    organizationId: string;
    name: string;
    rtspUrl: string;
    hlsPath?: string;
  }) {
    const camera = await this.prisma.camera.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        rtspUrlEncrypted: this.encryptRtspUrl(input.rtspUrl),
        hlsPath: input.hlsPath,
      },
      include: { organization: true },
    });
    const base = this.config.get<string>('MEDIA_HLS_BASE_URL') ?? '';
    return {
      ...camera,
      playbackUrl: camera.hlsPath ? `${base}${camera.hlsPath}` : null,
      rtspUrlEncrypted: undefined,
    };
  }

  async startSession(cameraId: string) {
    return this.prisma.cameraSession.create({ data: { cameraId, status: 'live' } });
  }

  sessions() {
    return this.prisma.cameraSession.findMany({
      include: { camera: { include: { organization: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  endSession(id: string) {
    return this.prisma.cameraSession.update({
      where: { id },
      data: { status: 'ended', endedAt: new Date() },
      include: { camera: { include: { organization: true } } },
    });
  }

  async listForOrganization(organizationId: string) {
    const cameras = await this.prisma.camera.findMany({
      where: { organizationId, status: 'active' },
      include: { organization: true },
      take: 100,
    });
    const base = this.config.get<string>('MEDIA_HLS_BASE_URL') ?? '';
    return cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      status: camera.status,
      organization: camera.organization.name,
      playbackUrl: camera.hlsPath ? `${base}${camera.hlsPath}` : null,
    }));
  }

  async startExternalSession(organizationId: string, cameraId: string) {
    const camera = await this.prisma.camera.findFirstOrThrow({
      where: { id: cameraId, organizationId, status: 'active' },
    });
    return this.prisma.cameraSession.create({
      data: {
        cameraId: camera.id,
        status: 'live',
        events: { source: 'api_key' },
      },
    });
  }

  listTokens() {
    return this.prisma.apiToken.findMany({
      select: {
        id: true,
        organizationId: true,
        name: true,
        scopes: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createToken(input: { organizationId: string; name: string; scopes?: string[] }) {
    const secret = `ersi_${randomBytes(24).toString('hex')}`;
    const token = await this.prisma.apiToken.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        scopes: input.scopes?.length ? input.scopes : ['cameras:read'],
        tokenHash: this.hash(secret),
      },
    });
    return { ...token, secret, tokenHash: undefined };
  }

  async revokeToken(id: string) {
    return this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  private hash(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }

  private encryptRtspUrl(value: string) {
    const secret = this.config.get<string>('CAMERA_ENCRYPTION_KEY') ?? 'replace_camera_encryption_key';
    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }
}
