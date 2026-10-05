import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      apiToken?: { organizationId: string; scopes: string[] };
    }>();
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) throw new UnauthorizedException('Missing API key');

    const tokenHash = createHash('sha256').update(apiKey).digest('hex');
    const token = await this.prisma.apiToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!token) throw new UnauthorizedException('Invalid API key');
    if (!token.scopes.includes('cameras:read')) {
      throw new ForbiddenException('Missing cameras:read scope');
    }
    request.apiToken = {
      organizationId: token.organizationId,
      scopes: token.scopes,
    };
    return true;
  }
}
