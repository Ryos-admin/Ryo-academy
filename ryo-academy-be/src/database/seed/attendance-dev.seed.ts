import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdmissionStatus,
  DayType,
  Gender,
  type Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaClient } from '../../../generated/prisma/client.js';

const databaseUrl = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required.');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: true }),
});

const password = process.env['USER_INITIAL_PASSWORD'] ?? 'temp';
const fixturePasswordHash = await argon2.hash(password);
const fixtureDate = new Date('2026-09-14T00:00:00.000Z');

async function upsertUser(email: string, firstName: string, lastName: string) {
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: fixturePasswordHash,
      firstName,
      lastName,
    },
    update: {
      passwordHash: fixturePasswordHash,
      firstName,
      lastName,
      isActive: true,
    },
  });
  const role = await prisma.role.findUnique({ where: { name: 'STAFF' } });
  if (!role) throw new Error('Run the existing RBAC seed before this fixture seed.');
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
  return user;
}

async function upsertStaff(userId: string, staffCode: string, firstName: string, lastName: string) {
  return prisma.staff.upsert({
    where: { userId },
    create: {
      userId,
      staffCode,
      firstName,
      lastName,
      email: `${staffCode.toLowerCase()}@ryo.local`,
      phoneNumber: '0000000000',
      dateOfBirth: '1990-01-01',
      status: true,
    },
    update: { staffCode, firstName, lastName, status: true },
  });
}

async function upsertCalendar(academicYearId: string, date: Date, isWorkingDay: boolean) {
  return prisma.academicCalendar.upsert({
    where: { academicYearId_date: { academicYearId, date } },
    create: {
      academicYearId,
      date,
      dayType: isWorkingDay ? DayType.WORKING_DAY : DayType.WEEKEND,
      title: isWorkingDay ? 'Milestone 13E working day' : 'Milestone 13E non-working day',
      isWorkingDay,
    },
    update: { dayType: isWorkingDay ? DayType.WORKING_DAY : DayType.WEEKEND, isWorkingDay },
  });
}

async function upsertSubject(classId: string, name: string) {
  const existing = await prisma.subjects.findFirst({ where: { classId, name } });
  return existing ?? prisma.subjects.create({ data: { classId, name } });
}

async function upsertAssignment(staffId: string, subjectId: string, classId: string, sectionId: string) {
  const existing = await prisma.teachingAssignment.findFirst({
    where: { staffId, subjectId, classId, sectionId },
  });
  return existing ?? prisma.teachingAssignment.create({ data: { staffId, subjectId, classId, sectionId } });
}

/**
 * Mirrors the fee snapshot that AdmissionService.create() writes for every real
 * admission (admission.service.ts, the tx.feePaymentHeader.create / tx
 * .feePaymentDetails.createMany pair).
 *
 * This fixture inserts CONFIRMED admissions directly through Prisma, bypassing
 * that service, so without this step the seeded students end up in a state the
 * production application can never produce: a confirmed admission with no fee
 * snapshot. That makes GET /students/:id/fees return `fee: null` and makes every
 * fee payment fail with "does not have an applicable fee snapshot".
 *
 * Idempotent: an existing snapshot is left untouched, so re-running the seed
 * never produces a duplicate header.
 */
async function ensureFeeSnapshot(params: {
  admissionId: string;
  academicYearId: string;
  programId: string;
  classId: string;
}) {
  const existing = await prisma.feePaymentHeader.findFirst({
    where: { admissionId: params.admissionId },
  });
  if (existing) return { feePaymentHeaderId: existing.id, created: false };

  // Same lookup rules as AdmissionRepository.findFeeStructurebyId().
  const feeStructure = await prisma.feeStructure.findFirst({
    where: {
      academicYearId: params.academicYearId,
      programId: params.programId,
      classId: params.classId,
      isActive: true,
    },
  });
  if (!feeStructure) {
    throw new Error(
      `No active fee structure for class "${params.classId}"; run the fee seed first.`,
    );
  }

  const feeComponents = await prisma.feeComponent.findMany({
    where: { feeStructureId: feeStructure.id, isActive: true },
    orderBy: { name: 'asc' },
  });
  if (feeComponents.length === 0) {
    throw new Error(
      `Fee structure "${feeStructure.id}" has no active fee components; run the fee seed first.`,
    );
  }

  const feePaymentHeader = await prisma.feePaymentHeader.create({
    data: {
      admissionId: params.admissionId,
      academicYearId: params.academicYearId,
      feeStructureId: feeStructure.id,
      discountAmount: 0,
      grossAmount: 0,
      netAmount: 0,
      totalPaidAmount: 0,
      totalDueAmount: +feeStructure.totalAmount,
      totalFeeAmount: +feeStructure.totalAmount,
    },
  });

  await prisma.feePaymentDetails.createMany({
    data: feeComponents.map((feeComponent) => ({
      feePaymentHeaderId: feePaymentHeader.id,
      feeComponentId: feeComponent.id,
      nameSnapshot: feeComponent.name,
      originalAmount: feeComponent.amount,
      discountApplicable: feeComponent.discountApplicable,
      isMandatory: feeComponent.isMandatory,
      discountAmount: 0,
      finalAmount: feeComponent.amount,
      totalAmountToBePaid: feeComponent.amount,
      amountPaid: 0,
      paymentDate: new Date(),
    })),
  });

  return { feePaymentHeaderId: feePaymentHeader.id, created: true };
}

async function upsertStudent(params: {
  schoolId: string;
  academicYearId: string;
  programId: string;
  classId: string;
  sectionId: string;
  createdById: string;
  admissionNumber: string;
  studentNumber: string;
  studentName: string;
}) {
  // Keyed on admissionNumber, which is @unique. The previous
  // (academicYearId, programId, classId) compound key is no longer a uniqueness
  // boundary: a class legitimately holds many students per academic year, so it
  // can no longer be used to identify "the" admission for this fixture.
  const existingAdmission = await prisma.admission.findFirst({
    where: { admissionNumber: params.admissionNumber },
  });
  const admission = existingAdmission
    ? await prisma.admission.update({
        where: { id: existingAdmission.id },
        data: {
          admissionStatus: AdmissionStatus.CONFIRMED,
          sectionId: params.sectionId,
          studentName: params.studentName,
          confirmedAt: new Date(),
        },
      })
    : await prisma.admission.create({
        data: {
          admissionNumber: params.admissionNumber,
          admissionSequence: 13,
          admissionStatus: AdmissionStatus.CONFIRMED,
          schoolId: params.schoolId,
          academicYearId: params.academicYearId,
          programId: params.programId,
          classId: params.classId,
          sectionId: params.sectionId,
          createdById: params.createdById,
          studentName: params.studentName,
          gender: Gender.OTHER,
          dateOfBirth: new Date('2018-01-01T00:00:00.000Z'),
          confirmedAt: new Date(),
        },
      });

  // Keep the fixture consistent with the production admission lifecycle: every
  // CONFIRMED admission produced by AdmissionService.create() carries a fee
  // snapshot, so this one must too.
  await ensureFeeSnapshot({
    admissionId: admission.id,
    academicYearId: params.academicYearId,
    programId: params.programId,
    classId: params.classId,
  });

  return prisma.student.upsert({
    where: { admissionId: admission.id },
    create: {
      admissionId: admission.id,
      studentName: params.studentName,
      studentNumber: params.studentNumber,
      gender: Gender.OTHER,
      dateOfBirth: new Date('2018-01-01T00:00:00.000Z'),
    },
    update: { studentName: params.studentName, studentNumber: params.studentNumber },
  });
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
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
    },
    update: { startDate: new Date('2026-06-01'), endDate: new Date('2027-05-31') },
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
  const classOne = await prisma.class.upsert({
    where: { programId_name: { programId: program.id, name: 'Year 1' } },
    create: { programId: program.id, name: 'Year 1' },
    update: {},
  });
  const classTwo = await prisma.class.upsert({
    where: { programId_name: { programId: program.id, name: 'Year 2' } },
    create: { programId: program.id, name: 'Year 2' },
    update: {},
  });
  const sectionOne = await prisma.section.upsert({
    where: { classId_name: { classId: classOne.id, name: 'A' } },
    create: { classId: classOne.id, name: 'A' },
    update: {},
  });
  const sectionTwo = await prisma.section.upsert({
    where: { classId_name: { classId: classTwo.id, name: 'A' } },
    create: { classId: classTwo.id, name: 'A' },
    update: {},
  });

  const userOne = await upsertUser('milestone13e.staff1@ryo.local', 'Milestone', 'Staff One');
  const userTwo = await upsertUser('milestone13e.staff2@ryo.local', 'Milestone', 'Staff Two');
  const staffOne = await upsertStaff(userOne.id, 'M13E-STAFF-1', 'Milestone', 'Staff One');
  const staffTwo = await upsertStaff(userTwo.id, 'M13E-STAFF-2', 'Milestone', 'Staff Two');
  const subjectOne = await upsertSubject(classOne.id, 'Milestone 13E Subject 1');
  const subjectTwo = await upsertSubject(classTwo.id, 'Milestone 13E Subject 2');
  await upsertAssignment(staffOne.id, subjectOne.id, classOne.id, sectionOne.id);
  await upsertAssignment(staffTwo.id, subjectOne.id, classOne.id, sectionOne.id);
  await upsertAssignment(staffOne.id, subjectTwo.id, classTwo.id, sectionTwo.id);
  const studentOne = await upsertStudent({
    schoolId: school.id,
    academicYearId: academicYear.id,
    programId: program.id,
    classId: classOne.id,
    sectionId: sectionOne.id,
    createdById: userOne.id,
    admissionNumber: 'M13E-ADM-1',
    studentNumber: 'M13E-STU-1',
    studentName: 'Milestone Student One',
  });
  const studentTwo = await upsertStudent({
    schoolId: school.id,
    academicYearId: academicYear.id,
    programId: program.id,
    classId: classTwo.id,
    sectionId: sectionTwo.id,
    createdById: userOne.id,
    admissionNumber: 'M13E-ADM-2',
    studentNumber: 'M13E-STU-2',
    studentName: 'Milestone Student Two',
  });
  await upsertCalendar(academicYear.id, fixtureDate, true);
  await upsertCalendar(academicYear.id, new Date('2026-09-15T00:00:00.000Z'), true);
  await upsertCalendar(academicYear.id, new Date('2026-09-16T00:00:00.000Z'), true);
  await upsertCalendar(academicYear.id, new Date('2026-09-13T00:00:00.000Z'), false);

  const output: Prisma.JsonObject = {
    academicYearId: academicYear.id,
    programId: program.id,
    classOneId: classOne.id,
    sectionOneId: sectionOne.id,
    studentOneId: studentOne.id,
    classTwoId: classTwo.id,
    sectionTwoId: sectionTwo.id,
    studentTwoId: studentTwo.id,
    staffOneUserEmail: userOne.email,
    staffTwoUserEmail: userTwo.email,
    fixturePassword: password,
    fixtureDate: '2026-09-14',
    nonWorkingDate: '2026-09-13',
  };
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });