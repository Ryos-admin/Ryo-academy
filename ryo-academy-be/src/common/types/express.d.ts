import { AuthenticatedUser } from './authenticated-user.type.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by {@link JwtAuthGuard} after successful JWT verification.
       */
      user?: AuthenticatedUser;
    }
  }
}
