import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from './auth.types';
import type { RequestWithAuth } from '../common/context/request.types';

/** Use with JwtAuthGuard. Returns req.user (RequestUser). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    return req.user!;
  },
);
