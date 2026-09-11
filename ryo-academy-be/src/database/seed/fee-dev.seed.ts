import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

const databaseUrl = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required to seed fee fixtures.');
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 30_000,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: true }),
});

const password = process.env['USER_INITIAL_PASSWORD'] ?? 'temp';

async function ensureUserWithRole(
  email: string,
  firstName: string,
  lastName: string,
  roleName: 'COLLEGE_ADMIN' | 'OFFICE_ADMIN' = 'COLLEGE_ADMIN',
) {
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName,
      lastName,
      isActive: true,
    },
    update: {
      passwordHash,
      firstName,
      lastName,
      isActive: true,
    },
  });

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    throw new Error(`Role "${roleName}" is missing. Run the RBAC seed before this fixture seed.`);
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });

  return user;
}

async function main() {
  await prisma.$connect();

  const school = await prisma.school.upsert({
    where: { schoolCode: 'RYO' },
    create: { schoolCode: 'RYO', name: 'Ryo Academy' },
    update: { name: 'Ryo Academy' },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2026-27' } },
    create: {
      schoolId: school.id,
      name: '2026-27',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z'),
    },
    update: {
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z'),
    },
  });

  const program = await prisma.program.upsert({
    where: { academicYearId_name: { academicYearId: academicYear.id, name: 'Day Care Program' } },
    create: {
      academicYearId: academicYear.id,
      name: 'Day Care Program',
      isPrimary: true,
      daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      startTime: '08:00',
      endTime: '17:00',
    },
    update: { isPrimary: true },
  });

  const academicClass = await prisma.class.upsert({
    where: { programId_name: { programId: program.id, name: 'Year 1' } },
    create: { programId: program.id, name: 'Year 1' },
    update: {},
  });

  const structure = await prisma.feeStructure.upsert({
    where: {
      academicYearId_programId_classId: {
        academicYearId: academicYear.id,
        programId: program.id,
        classId: academicClass.id,
      },
    },
    create: {
      name: 'Milestone 14D Verification Fee Structure',
      description: 'Development fixture for 14D live verification.',
      academicYearId: academicYear.id,
      programId: program.id,
      classId: academicClass.id,
      totalAmount: 125000,
      isActive: true,
    },
    update: {
      name: 'Milestone 14D Verification Fee Structure',
      description: 'Development fixture for 14D live verification.',
      totalAmount: 125000,
      isActive: true,
    },
  });

  const componentInputs = [
    { name: 'Tuition Fee', amount: 90000, discountApplicable: false, isMandatory: true },
    { name: 'Activity Fee', amount: 35000, discountApplicable: true, isMandatory: true },
  ] as const;

  for (const component of componentInputs) {
    await prisma.feeComponent.upsert({
      where: {
        feeStructureId_name: {
          feeStructureId: structure.id,
          name: component.name,
        },
      },
      create: {
        feeStructureId: structure.id,
        name: component.name,
        description: `${component.name} for development verification.`,
        amount: component.amount,
        discountApplicable: component.discountApplicable,
        isMandatory: component.isMandatory,
        isActive: true,
      },
      update: {
        description: `${component.name} for development verification.`,
        amount: component.amount,
        discountApplicable: component.discountApplicable,
        isMandatory: component.isMandatory,
        isActive: true,
      },
    });
  }

  const readUser = await ensureUserWithRole('fee.read@ryo.local', 'Fee', 'Reader', 'COLLEGE_ADMIN');
  const writeUser = await ensureUserWithRole('fee.write@ryo.local', 'Fee', 'Writer', 'OFFICE_ADMIN');

  console.log(JSON.stringify({
    schoolId: school.id,
    academicYearId: academicYear.id,
    programId: program.id,
    classId: academicClass.id,
    feeStructureId: structure.id,
    readUser: { email: readUser.email, id: readUser.id },
    writeUser: { email: writeUser.email, id: writeUser.id },
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('Fee fixture seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
