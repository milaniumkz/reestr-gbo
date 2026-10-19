import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';

const privateFields = new Set(['passwordHash','passwordVersion','failedPasswordAttempts','passwordLockedUntil','totpEncrypted','lastTotpStep','tokenHash','refreshHash','failedAttempts','lockedUntil']);
export function omitSensitiveFields(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(omitSensitiveFields);
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!privateFields.has(key)).map(([key,item])=>[key,omitSensitiveFields(item)]));
}
@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  intercept(_context:ExecutionContext,next:CallHandler) {return next.handle().pipe(map(omitSensitiveFields));}
}
