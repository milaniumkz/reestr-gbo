import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RequestUser } from '../common/current-user';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: RequestUser }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException();
    const user = await this.verifyToken(token);
    if (!user.sid) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({
      where: { id: user.sid },
      select: { expiresAt: true, revokedAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException();
    }
    request.user = user;
    return true;
  }

  private jwtSecret() {
    const value = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!value || value.startsWith('replace_') || value.startsWith('dev_')) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not configured');
    }
    return value;
  }

  private async verifyToken(token: string) {
    try {
      return await this.jwt.verifyAsync<RequestUser>(token, {
        secret: this.jwtSecret(),
      });
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new UnauthorizedException();
    }
  }
}
