import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestUser = {
  sub: string;
  phone: string;
  roles: string[];
  sid?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    return request.user;
  },
);
