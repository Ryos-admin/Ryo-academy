import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

const ROLES = {
  COLLEGE_ADMIN: 'COLLEGE_ADMIN',
  OFFICE_ADMIN: 'OFFICE_ADMIN',
  STAFF: 'STAFF',
} as const;

const PERMISSIONS = {
  ADMISSION_READ: 'admission:read',
  ADMISSION_CREATE: 'admission:create',
  ADMISSION_UPDATE: 'admission:update',
  FEES_READ: 'fees:read',
  FEES_CREATE: 'fees:create',
  FEES_UPDATE: 'fees:update',
  CLASS_READ: 'class:read',
  CLASS_CREATE: 'class:create',
  CLASS_UPDATE: 'class:update',
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_UPDATE: 'attendance:update',
  STAFF_READ: 'staff:read',
  STAFF_CREATE: 'staff:create',
  STAFF_UPDATE: 'staff:update',
  STUDENT_READ: 'student:read',
  STUDENT_CREATE: 'student:create',
  STUDENT_UPDATE: 'student:update',
  SHIFT_READ: 'shift:read',
  SHIFT_CREATE: 'shift:create',
  SHIFT_UPDATE: 'shift:update',
  TIMETABLE_READ: 'timetable:read',
} as const;

const ROLE_DESCRIPTIONS = {
  [ROLES.COLLEGE_ADMIN]: 'Full access to all college ERP functions.',
  [ROLES.OFFICE_ADMIN]: 'Administrative access for office operations.',
  [ROLES.STAFF]: 'Staff access for attendance and student information.',
} as const;

const PERMISSION_DESCRIPTIONS: Record<(typeof PERMISSIONS)[keyof typeof PERMISSIONS], string> = {
  [PERMISSIONS.ADMISSION_READ]: 'View admissions.',
  [PERMISSIONS.ADMISSION_CREATE]: 'Create admissions.',
  [PERMISSIONS.ADMISSION_UPDATE]: 'Update admissions.',
  [PERMISSIONS.FEES_READ]: 'View fees.',
  [PERMISSIONS.FEES_CREATE]: 'Create fee records.',
  [PERMISSIONS.FEES_UPDATE]: 'Update fee records.',
  [PERMISSIONS.CLASS_READ]: 'View classes.',
  [PERMISSIONS.CLASS_CREATE]: 'Create classes.',
  [PERMISSIONS.CLASS_UPDATE]: 'Update classes.',
  [PERMISSIONS.ATTENDANCE_READ]: 'View attendance.',
  [PERMISSIONS.ATTENDANCE_MARK]: 'Mark attendance.',
  [PERMISSIONS.ATTENDANCE_UPDATE]: 'Update attendance.',
  [PERMISSIONS.STAFF_READ]: 'View staff.',
  [PERMISSIONS.STAFF_CREATE]: 'Create staff.',
  [PERMISSIONS.STAFF_UPDATE]: 'Update staff.',
  [PERMISSIONS.STUDENT_READ]: 'View students.',
  [PERMISSIONS.STUDENT_CREATE]: 'Create students.',
  [PERMISSIONS.STUDENT_UPDATE]: 'Update students.',
  [PERMISSIONS.SHIFT_READ]: 'View shifts.',
  [PERMISSIONS.SHIFT_CREATE]: 'Create shifts.',
  [PERMISSIONS.SHIFT_UPDATE]: 'Update shifts.',
  [PERMISSIONS.TIMETABLE_READ]: 'View timetables.',
};

const ROLE_PERMISSIONS = {
  [ROLES.COLLEGE_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.OFFICE_ADMIN]: [
    PERMISSIONS.ADMISSION_READ,
    PERMISSIONS.ADMISSION_CREATE,
    PERMISSIONS.ADMISSION_UPDATE,
    PERMISSIONS.FEES_READ,
    PERMISSIONS.FEES_CREATE,
    PERMISSIONS.FEES_UPDATE,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.CLASS_CREATE,
    PERMISSIONS.CLASS_UPDATE,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.STUDENT_CREATE,
    PERMISSIONS.STUDENT_UPDATE,
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.SHIFT_READ,
    PERMISSIONS.SHIFT_CREATE,
    PERMISSIONS.SHIFT_UPDATE,
    PERMISSIONS.TIMETABLE_READ,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_UPDATE,
    PERMISSIONS.TIMETABLE_READ,
    PERMISSIONS.SHIFT_READ,
  ],
} as const;

const databaseUrl =
  process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error(
    'DIRECT_DATABASE_URL or DATABASE_URL is required to seed RBAC data.',
  );
}

// Use a dedicated pool for the seed script. Neon can take several seconds to
// wake a suspended compute on the first connection.
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 30_000,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: true }),
});

async function seedRbac(): Promise<void> {
  await prisma.$connect();

  const permissionIds = new Map<string, string>();

  for (const permissionName of Object.values(PERMISSIONS)) {
    const permission = await prisma.permission.upsert({
      where: { name: permissionName },
      create: {
        name: permissionName,
        description: PERMISSION_DESCRIPTIONS[permissionName],
      },
      update: {
        description: PERMISSION_DESCRIPTIONS[permissionName],
      },
    });

    permissionIds.set(permissionName, permission.id);
  }

  const roleIds = new Map<string, string>();

  for (const roleName of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
      },
      update: {
        description: ROLE_DESCRIPTIONS[roleName],
      },
    });

    roleIds.set(roleName, role.id);
  }

  let rolePermissionCount = 0;

  for (const [roleName, permissionNames] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds.get(roleName);

    if (!roleId) {
      throw new Error(`Expected role "${roleName}" could not be resolved.`);
    }

    for (const permissionName of permissionNames) {
      const permissionId = permissionIds.get(permissionName);

      if (!permissionId) {
        throw new Error(
          `Expected permission "${permissionName}" for role "${roleName}" could not be resolved.`,
        );
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        create: { roleId, permissionId },
        update: {},
      });
      rolePermissionCount += 1;
    }
  }

  const result = {
    roles: roleIds.size,
    permissions: permissionIds.size,
    rolePermissions: rolePermissionCount,
  };

  console.log(
    `RBAC seed completed: ${result.roles} roles, ${result.permissions} permissions, ${result.rolePermissions} role-permission mappings upserted.`,
  );
}

async function seedAcademicFoundation(): Promise<void> {
  const school = await prisma.school.upsert({
    where: {
      schoolCode: 'RYO',
    },
    create: {
      schoolCode: 'RYO',
      name: "Ryo Academy",
    },
    update: {
      name: "Ryo Academy",
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: {
      schoolCode_name: {
        schoolCode: school.schoolCode,
        name: '2026-27',
      },
    },
    create: {
      name: '2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
      schoolCode: school.schoolCode,
    },
    update: {
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
    },
  });

  const mainProgram = await prisma.program.upsert({
    where: {
      academicYearId_name: {
        academicYearId: academicYear.id,
        name: 'Day Care Program',
      },
    },
    create: {
      name: 'Day Care Program',
      academicYearId: academicYear.id,
      isPrimary: true,
    },
    update: {
      isPrimary: true,
    },
  });

  const specialProgram = await prisma.program.upsert({
    where: {
      academicYearId_name: {
        academicYearId: academicYear.id,
        name: 'Karate Program',
      },
    },
    create: {
      name: 'Karate Program',
      academicYearId: academicYear.id,
      isPrimary: false,
    },
    update: {
      isPrimary: false,
    },
  });

  const createClassWithSection = async (
    name: string,
    programId: string,
  ) => {
    const academicClass = await prisma.class.upsert({
      where: {
        programId_name: {
          programId,
          name,
        },
      },
      create: {
        name,
        programId,
      },
      update: {},
    });

    await prisma.section.upsert({
      where: {
        classId_name: {
          classId: academicClass.id,
          name: 'A',
        },
      },
      create: {
        name: 'A',
        classId: academicClass.id,
        schoolCode: school.schoolCode,
      },
      update: {},
    });

    return academicClass;
  };

  await createClassWithSection('Year 1', mainProgram.id);
  await createClassWithSection('Year 2', mainProgram.id);
  await createClassWithSection('Special Class', specialProgram.id);
  
  console.log(`Academic foundation: school "${school.name}" ready.`);
}

async function main(): Promise<void> {
  await prisma.$connect();

  await seedRbac();
  await seedAcademicFoundation();
}

main()
  .catch((error: unknown) => {
    console.error('RBAC seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
