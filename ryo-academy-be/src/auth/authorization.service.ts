import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/**
 * Service responsible for resolving a user's granted permissions via RBAC relationships.
 * It queries only the permission names needed for authorization checks.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves a set of permission names granted to the user through their roles.
   * @param userId The UUID of the user.
   * @returns Array of permission name strings.
   */
  async getPermissionNamesForUser(userId: string): Promise<string[]> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    const permissionSet = new Set<string>();
    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissionSet.add(rolePermission.permission.name);
      }
    }
    return Array.from(permissionSet);
  }
}
