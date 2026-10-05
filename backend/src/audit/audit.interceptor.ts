import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestUser } from '../common/current-user';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      route?: { path?: string };
      originalUrl?: string;
      user?: RequestUser;
      ip?: string;
    }>();

    if (request.method === 'GET') return next.handle();

    return next.handle().pipe(
      tap(() => {
        void this.audit
          .log(
            `${request.method} ${request.route?.path ?? request.originalUrl ?? ''}`,
            'http_request',
            undefined,
            request.user?.sub,
            { ip: request.ip },
          )
          .catch(() => undefined);
      }),
    );
  }
}
