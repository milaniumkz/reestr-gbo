import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TechnicalAuthService, TECH_COOKIE } from "./technical-auth.service";
export const TechnicalPermission = (permission: string) =>
  SetMetadata("technical_permission", permission);
export function techCookie(request: any) {
  const raw = String(request.headers.cookie ?? "");
  for (const item of raw.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === TECH_COOKIE) return rest.join("=");
  }
  return undefined;
}
export function assertTechnicalOrigin(request: any) {
  const expected = process.env.TECH_PANEL_ORIGIN;
  if (
    !expected ||
    request.headers.origin !== expected ||
    request.headers["x-technical-request"] !== "1"
  )
    throw new ForbiddenException(
      "Источник запроса технической панели не подтверждён",
    );
}
@Injectable()
export class TechnicalGuard implements CanActivate {
  constructor(
    private readonly auth: TechnicalAuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!["GET", "HEAD"].includes(req.method)) assertTechnicalOrigin(req);
    req.tech = await this.auth.principal(techCookie(req));
    const permission = this.reflector.getAllAndOverride<string>(
      "technical_permission",
      [context.getHandler(), context.getClass()],
    );
    if (permission) this.auth.require(req.tech, permission);
    return true;
  }
}
