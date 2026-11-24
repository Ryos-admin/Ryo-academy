import { Injectable } from "@nestjs/common";
import { UsersRepository } from "../users/users.repository.js";
import { DatabaseService } from "../database/database.service.js";

export interface ProtectedUserProfile {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    schoolId: string | null;
    schoolCode: string | null;
  };
  roles: { id: string; name: string }[];
  permissions: string[];
}

@Injectable()
export class ProtectedService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly databaseService: DatabaseService,
  ) {}

  async getUserById(userId: string): Promise<ProtectedUserProfile | null> {
    const userDetails = await this.usersRepository.findById(userId);

    // Unchanged behaviour: unknown or inactive users get no profile at all.
    if (!userDetails?.isActive) {
      return null;
    }

    const school = userDetails.schoolId
      ? await this.databaseService.school.findFirst({
          where: { id: userDetails.schoolId },
          select: { schoolCode: true, name: true },
        })
      : null;

    const userRoles = await this.databaseService.userRole.findMany({
      where: { userId },
      select: { role: { select: { id: true, name: true } } },
    });

    const roles = userRoles
      .map((row) => row?.role)
      .filter((role): role is { id: string; name: string } => Boolean(role?.id && role?.name));

    const permissionGroups = await Promise.all(
      roles.map((role) =>
        this.databaseService.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permission: { select: { id: true, name: true } } },
        }),
      ),
    );

    // "admission:read" -> "ADMISSION_READ", matching the frontend permission names.
    const permissions = [
      ...new Set(
        permissionGroups
          .flat()
          .map((row) => row?.permission?.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => name.toUpperCase().replace(/:/g, "_")),
      ),
    ];

    // Unchanged behaviour: unknown or inactive users get no profile at all.
    if (!userDetails?.isActive || !school?.schoolCode) {
      return null;
    }

    console.log("User details:", userDetails);

    return {
      user: {
        id: userDetails.id,
        email: userDetails.email,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        schoolId: userDetails.schoolId,
        schoolCode: `${school?.name} (${school?.schoolCode})`,
      },
      roles,
      permissions,
    };
  }
}
