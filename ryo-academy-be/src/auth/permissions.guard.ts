import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service.js';
import { PERMISSIONS_METADATA } from './require-permissions.decorator.js';
import type { Permission } from './permissions/permission.constants.js';

/**
 * Guard that enforces RBAC permission checks.
 * It expects request.user to be populated by JwtAuthGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // Retrieve required permissions from metadata (handler first, then class)
    const required: Permission[] =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    // No permissions required means allow access.
    if (required.length === 0) {
      return true;
    }

    const userPermissions = await this.authzService.getPermissionNamesForUser(
      user.userId,
    );

    const missing = required.filter((perm) => !userPermissions.includes(perm));
    if (missing.length > 0) {
      // Fail closed – do not disclose which permission is missing.
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
