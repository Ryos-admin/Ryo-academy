import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions/permission.constants.js';

/**
 * Metadata key used by PermissionsGuard to retrieve required permissions.
 */
export const PERMISSIONS_METADATA = 'requiredPermissions';

/**
 * Decorator to declare required permission strings for a route handler or controller.
 * Usage: @RequirePermissions('student:read', 'student:update')
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);
