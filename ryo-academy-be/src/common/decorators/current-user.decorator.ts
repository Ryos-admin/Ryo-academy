import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/authenticated-user.type.js';

/**
 * Parameter decorator to retrieve the authenticated user injected by JwtAuthGuard.
 * Returns the strongly‑typed {@link AuthenticatedUser} object.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
