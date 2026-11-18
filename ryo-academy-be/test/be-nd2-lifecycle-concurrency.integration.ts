import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AcademicYearService } from '../src/academic/academic-year/academic-year.service.js';
import { ProgramService } from '../src/academic/program/program.service.js';
import { ClassService } from '../src/academic/class/class.service.js';
import { FeeStructureService } from '../src/admission/fee-structure/fee-structure.service.js';
import { FeeComponentService } from '../src/admission/fee-component/fee-component.service.js';
import { AcademicCalendarService } from '../src/academic/academic-calendar/academic-calendar.service.js';
import { AttendanceService } from '../src/attendance/attendance.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import {
  AcademicYearStatus,
  AdmissionStatus,
  FeePricingVersion,
  DayOfWeek,
  Gender,
  Relation,
} from '../generated/prisma/client.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  await assertQaDatabase(db);

  const calendarService = new AcademicCalendarService(db);
  const ayService = new AcademicYearService(db, calendarService);
  const programService = new ProgramService(db);
  const classService = new ClassService(db);
  const feeStructureService = new FeeStructureService(db);
  const feeComponentService = new FeeComponentService(db);
  const attendanceService = new AttendanceService(db);
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);

  console.log('\n================================================================');
  console.log('BE-ND2 STAGE 1.2: COMPLETE CONCURRENCY INVARIANT RECONCILIATION');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-conc-${runId}`;
  const collegeAdminId = `usr-col-${runId}`;
  const staffUserId = `usr-stf-${runId}`;

  // 1. Setup seed School and Users with roles
  await db.school.create({
    data: { id: schoolId, name: `Conc School ${runId}`, schoolCode: `QC-${runId}` },
  });

  const roleAdmin = await db.role.upsert({
    where: { name: 'COLLEGE_ADMIN' },
    update: {},
    create: { name: 'COLLEGE_ADMIN', description: 'College Admin' },
  });

  const roleStaff = await db.role.upsert({
    where: { name: 'STAFF' },
    update: {},
    create: { name: 'STAFF', description: 'Staff' },
  });

  await db.user.create({
    data: {
      id: collegeAdminId,
      schoolId,
      firstName: 'College',
      lastName: 'Admin',
      email: `admin-${runId}@ryo.local`,
      passwordHash: 'dummyhash',
      roles: {
        create: { roleId: roleAdmin.id },
      },
    },
  });

  await db.user.create({
    data: {
      id: staffUserId,
      schoolId,
      firstName: 'Staff',
      lastName: 'Member',
      email: `staff-${runId}@ryo.local`,
      passwordHash: 'dummyhash',
      roles: {
        create: { roleId: roleStaff.id },
      },
      staff: {
        create: {
          staffCode: `STC-${runId}`,
          firstName: 'Staff',
          lastName: 'Member',
          email: `staff-${runId}@ryo.local`,
          phoneNumber: `999${runId}`,
          dateOfBirth: '1990-01-01',
        },
      },
    },
  });

  const staff = await db.staff.findUniqueOrThrow({ where: { userId: staffUserId } });

  const adminActor = {
    id: collegeAdminId,
    schoolId,
    roles: [{ role: { name: 'COLLEGE_ADMIN' } }],
  };

  // Helper to seed a qualifying academic year setup
  async function seedQualifyingYear(prefix: string) {
    const ayId = `ay-${prefix}-${runId}`;
    await db.academicYear.create({
      data: {
        id: ayId,
        schoolId,
        name: `AY-${prefix}-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    const program = await db.program.create({
      data: {
        id: `prg-${prefix}-${runId}`,
        name: `Program ${prefix}`,
        academicYearId: ayId,
        isActive: true,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
        startTime: '09:00',
        endTime: '16:00',
      },
    });

    const cls = await db.class.create({
      data: {
        id: `cls-${prefix}-${runId}`,
        name: `Class ${prefix}`,
        programId: program.id,
        isActive: true,
      },
    });

    const sec = await db.section.create({
      data: {
        id: `sec-${prefix}-${runId}`,
        name: 'Section A',
        classId: cls.id,
      },
    });

    const fs = await db.feeStructure.create({
      data: {
        id: `fs-${prefix}-${runId}`,
        name: `FeeStructure ${prefix}`,
        academicYearId: ayId,
        programId: program.id,
        classId: cls.id,
        totalAmount: 1000,
        isActive: true,
      },
    });

    const fc = await db.feeComponent.create({
      data: {
        id: `fc-${prefix}-${runId}`,
        name: `Tuition ${prefix}`,
        feeStructureId: fs.id,
        amount: 1000,
        isActive: true,
      },
    });

    return { ayId, program, cls, sec, fs, fc };
  }

  // ============================================================================
  // SCENARIO 1A: Activation commits first vs Program deactivation
  // ============================================================================
  console.log('[Scenario 1A] Activation commits first vs Program deactivation');
  {
    const { ayId, program } = await seedQualifyingYear('sc1a');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await programService.remove(program.id);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected Program.remove() to be rejected when racing with activate()');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedPrg = await db.program.findUnique({ where: { id: program.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    assert.equal(persistedPrg?.isActive, true);
    assert.equal(persistedPrg?.deletedAt, null);
    console.log(`  -> PASS: Activation won. Program deactivation blocked on lock (${tWait}ms), rejected with 409. AY=ACTIVE, Program=active.`);
  }

  // ============================================================================
  // SCENARIO 1B: Program deactivation commits first vs Activation
  // ============================================================================
  console.log('[Scenario 1B] Program deactivation commits first vs Activation');
  {
    const { ayId, program } = await seedQualifyingYear('sc1b');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR SHARE`;
        await tx.program.update({
          where: { id: program.id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await delay(60);
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await ayService.activate(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected ayService.activate() to be rejected because program was deactivated');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedPrg = await db.program.findUnique({ where: { id: program.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.DRAFT);
    assert.equal(persistedPrg?.isActive, false);
    assert.ok(persistedPrg?.deletedAt !== null);
    console.log(`  -> PASS: Program deactivation won. Activation blocked on lock (${tWait}ms), rejected with 409. AY remains DRAFT, Program=inactive.`);
  }

  // ============================================================================
  // SCENARIO 2A: Activation commits first vs Class deactivation
  // ============================================================================
  console.log('[Scenario 2A] Activation commits first vs Class deactivation');
  {
    const { ayId, cls } = await seedQualifyingYear('sc2a');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await classService.remove(cls.id, collegeAdminId);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected Class.remove() to be rejected when racing with activate()');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedCls = await db.class.findUnique({ where: { id: cls.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    assert.equal(persistedCls?.isActive, true);
    assert.equal(persistedCls?.deletedAt, null);
    console.log(`  -> PASS: Activation won. Class deactivation blocked on lock (${tWait}ms), rejected with 409. AY=ACTIVE, Class=active.`);
  }

  // ============================================================================
  // SCENARIO 2B: Class deactivation commits first vs Activation
  // ============================================================================
  console.log('[Scenario 2B] Class deactivation commits first vs Activation');
  {
    const { ayId, cls } = await seedQualifyingYear('sc2b');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR SHARE`;
        await tx.class.update({
          where: { id: cls.id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await delay(60);
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await ayService.activate(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected ayService.activate() to be rejected because class was deactivated');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedCls = await db.class.findUnique({ where: { id: cls.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.DRAFT);
    assert.equal(persistedCls?.isActive, false);
    assert.ok(persistedCls?.deletedAt !== null);
    console.log(`  -> PASS: Class deactivation won. Activation blocked on lock (${tWait}ms), rejected with 409. AY remains DRAFT, Class=inactive.`);
  }

  // ============================================================================
  // SCENARIO 3A: Activation commits first vs FeeComponent deactivation
  // ============================================================================
  console.log('[Scenario 3A] Activation commits first vs FeeComponent deactivation');
  {
    const { ayId, fc } = await seedQualifyingYear('sc3a');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeComponentService.delete(fc.id, collegeAdminId);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected FeeComponent.delete() to be rejected when racing with activate()');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedFc = await db.feeComponent.findUnique({ where: { id: fc.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    assert.equal(persistedFc?.isActive, true);
    assert.equal(persistedFc?.deletedAt, null);
    console.log(`  -> PASS: Activation won. FeeComponent deactivation blocked on lock (${tWait}ms), rejected with 409. AY=ACTIVE, FeeComponent=active.`);
  }

  // ============================================================================
  // SCENARIO 3B: FeeComponent deactivation commits first vs Activation
  // ============================================================================
  console.log('[Scenario 3B] FeeComponent deactivation commits first vs Activation');
  {
    const { ayId, fc } = await seedQualifyingYear('sc3b');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR SHARE`;
        await tx.feeComponent.update({
          where: { id: fc.id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await delay(60);
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await ayService.activate(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected ayService.activate() to be rejected because component was deactivated');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedFc = await db.feeComponent.findUnique({ where: { id: fc.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.DRAFT);
    assert.equal(persistedFc?.isActive, false);
    assert.ok(persistedFc?.deletedAt !== null);
    console.log(`  -> PASS: Component deactivation won. Activation blocked on lock (${tWait}ms), rejected with 409. AY remains DRAFT, Component=inactive.`);
  }

  // ============================================================================
  // SCENARIO 4A: Activation commits first vs FeeStructure deletion
  // ============================================================================
  console.log('[Scenario 4A] Activation commits first vs FeeStructure deletion');
  {
    const { ayId, fs } = await seedQualifyingYear('sc4a');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.delete(fs.id, collegeAdminId);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected FeeStructure.delete() to be rejected when racing with activate()');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedFs = await db.feeStructure.findUnique({ where: { id: fs.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    assert.equal(persistedFs?.isActive, true);
    assert.equal(persistedFs?.deletedAt, null);
    console.log(`  -> PASS: Activation won. FeeStructure deletion blocked on lock (${tWait}ms), rejected with 409. AY=ACTIVE, FeeStructure=active.`);
  }

  // ============================================================================
  // SCENARIO 4B: FeeStructure deletion commits first vs Activation
  // ============================================================================
  console.log('[Scenario 4B] FeeStructure deletion commits first vs Activation');
  {
    const { ayId, fs } = await seedQualifyingYear('sc4b');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR SHARE`;
        await tx.feeStructure.update({
          where: { id: fs.id },
          data: { isActive: false, deletedAt: new Date() },
        });
        await delay(60);
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await ayService.activate(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected ayService.activate() to be rejected because structure was deleted');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const persistedFs = await db.feeStructure.findUnique({ where: { id: fs.id } });
    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.DRAFT);
    assert.equal(persistedFs?.isActive, false);
    assert.ok(persistedFs?.deletedAt !== null);
    console.log(`  -> PASS: FeeStructure deletion won. Activation blocked on lock (${tWait}ms), rejected with 409. AY remains DRAFT, FeeStructure=deleted.`);
  }

  // ============================================================================
  // SCENARIO 5: AcademicYear deletion versus Program creation
  // ============================================================================
  console.log('[Scenario 5] AcademicYear deletion versus Program creation');
  {
    const emptyAyId = `ay-sc5-${runId}`;
    await db.academicYear.create({
      data: {
        id: emptyAyId,
        schoolId,
        name: `AY-Empty-SC5-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${emptyAyId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: emptyAyId },
          data: { isActive: false, deletedAt: new Date(), deletedById: collegeAdminId },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await programService.createPrgm({
          name: `Prg SC5 ${runId}`,
          academicYear: emptyAyId,
          isPrimary: true,
          daysOfWeek: [DayOfWeek.MONDAY],
          startTime: '08:00',
          endTime: '14:00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected Program creation to fail when racing with AcademicYear deletion');
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.program.count({ where: { academicYearId: emptyAyId } });
    assert.equal(count, 0, 'No orphaned Program records should exist');
    console.log(`  -> PASS: Program creation blocked on lock (${tWait}ms), rejected. 0 orphaned programs created.`);
  }

  // ============================================================================
  // SCENARIO 6: AcademicYear deletion versus FeeStructure creation
  // ============================================================================
  console.log('[Scenario 6] AcademicYear deletion versus FeeStructure creation');
  {
    const emptyAyId = `ay-sc6-${runId}`;
    await db.academicYear.create({
      data: {
        id: emptyAyId,
        schoolId,
        name: `AY-Empty-SC6-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${emptyAyId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: emptyAyId },
          data: { isActive: false, deletedAt: new Date(), deletedById: collegeAdminId },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.create({
          name: `FS SC6 ${runId}`,
          academicYearId: emptyAyId,
          programId: `prg-none`,
          classId: `cls-none`,
          feeComponents: [{ name: 'Comp 1', amount: '500' }],
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected FeeStructure creation to fail when racing with AcademicYear deletion');
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.feeStructure.count({ where: { academicYearId: emptyAyId } });
    assert.equal(count, 0, 'No orphaned FeeStructure records should exist');
    console.log(`  -> PASS: FeeStructure creation blocked on lock (${tWait}ms), rejected. 0 orphaned fee structures created.`);
  }

  // ============================================================================
  // SCENARIO 7: AcademicYear deletion versus Admission creation
  // ============================================================================
  console.log('[Scenario 7] AcademicYear deletion versus Admission creation');
  {
    const { ayId, program, cls, sec, fc } = await seedQualifyingYear('sc7');

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { isActive: false, deletedAt: new Date(), deletedById: collegeAdminId },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await admissionService.create({
          schoolId,
          academicYearId: ayId,
          programId: program.id,
          classId: cls.id,
          sectionId: sec.id,
          studentName: `Student SC7 ${runId}`,
          gender: Gender.MALE,
          dateOfBirth: new Date('2015-05-10'),
          parentName: 'Parent SC7',
          parentRelation: Relation.FATHER,
          parentPhone: '9876543210',
          parentAlternatePhone: '9876543211',
          parentEmail: 'parent@example.com',
          addressLine1: 'Street 1',
          addressLine2: 'Apt 2',
          city: 'City',
          state: 'State',
          createdById: collegeAdminId,
          selectedFeeComponentIds: [fc.id],
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected Admission creation to fail when racing with AcademicYear deletion');
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.admission.count({ where: { academicYearId: ayId } });
    assert.equal(count, 0, 'No orphaned Admission records should exist');
    console.log(`  -> PASS: Admission creation blocked on lock (${tWait}ms), rejected. 0 orphaned admissions created.`);
  }

  // ============================================================================
  // SCENARIO 8: AcademicYear deletion versus AcademicCalendar creation
  // ============================================================================
  console.log('[Scenario 8] AcademicYear deletion versus AcademicCalendar creation');
  {
    const emptyAyId = `ay-sc8-${runId}`;
    await db.academicYear.create({
      data: {
        id: emptyAyId,
        schoolId,
        name: `AY-Empty-SC8-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${emptyAyId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: emptyAyId },
          data: { isActive: false, deletedAt: new Date(), deletedById: collegeAdminId },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await calendarService.create({
          academicYearId: emptyAyId,
          date: '2026-06-15',
          dayType: 'WORKING_DAY' as any,
          title: 'Working Day',
          isWorkingDay: true,
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected AcademicCalendar creation to fail when racing with AcademicYear deletion');
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.academicCalendar.count({ where: { academicYearId: emptyAyId } });
    assert.equal(count, 0, 'No orphaned AcademicCalendar records should exist');
    console.log(`  -> PASS: AcademicCalendar creation blocked on lock (${tWait}ms), rejected. 0 orphaned calendar records created.`);
  }

  // ============================================================================
  // SCENARIO 9: AcademicYear deletion versus AttendanceLogMaster creation
  // ============================================================================
  console.log('[Scenario 9] AcademicYear deletion versus AttendanceLogMaster creation');
  {
    const { ayId, cls, sec } = await seedQualifyingYear('sc9');

    const subject = await db.subjects.create({
      data: {
        id: `subj-sc9-${runId}`,
        name: 'Math SC9',
        classId: cls.id,
      },
    });

    await db.teachingAssignment.create({
      data: {
        id: `ta-sc9-${runId}`,
        classId: cls.id,
        sectionId: sec.id,
        subjectId: subject.id,
        staffId: staff.id,
      },
    });

    await db.academicCalendar.create({
      data: {
        academicYearId: ayId,
        date: new Date('2026-06-15'),
        dayType: 'WORKING_DAY' as any,
        title: 'Working Day',
        isWorkingDay: true,
      },
    });

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { isActive: false, deletedAt: new Date(), deletedById: collegeAdminId },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await attendanceService.create(
          staffUserId,
          {
            academicYearId: ayId,
            classId: cls.id,
            sectionId: sec.id,
            date: '2026-06-15',
            entries: [],
          },
        );
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    assert.ok(p2Error, 'Expected AttendanceLogMaster creation to fail when racing with AcademicYear deletion');
    assert.ok(tWait >= 40, `Expected PostgreSQL lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.attendanceLogMaster.count({ where: { academicYearId: ayId } });
    assert.equal(count, 0, 'No orphaned AttendanceLogMaster records should exist');
    console.log(`  -> PASS: AttendanceLogMaster creation blocked on lock (${tWait}ms), rejected with 409. 0 orphaned attendance logs created.`);
  }

  // ============================================================================
  // SCENARIO 10: Concurrent Activation Attempts against the same DRAFT AcademicYear
  // ============================================================================
  console.log('[Scenario 10] Concurrent Activation Attempts against same DRAFT AcademicYear');
  {
    const { ayId } = await seedQualifyingYear('sc10');

    let p1Res: any = null;
    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        return await ayService.activate(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    const [res1] = await Promise.all([p1, p2]);
    p1Res = res1;

    assert.ok(p1Res, 'Expected one activation to succeed');
    assert.equal(p1Res.status, AcademicYearStatus.ACTIVE);
    assert.ok(p2Error, 'Expected racing activation to fail with 409 ALREADY_ACTIVE');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    console.log(`  -> PASS: Serialized on AcademicYear FOR UPDATE. Exactly one activation succeeded, second rejected with 409 (${tWait}ms wait). Final state: ACTIVE.`);
  }

  // ============================================================================
  // SCENARIO 11: Concurrent Closure Attempts against the same ACTIVE AcademicYear
  // ============================================================================
  console.log('[Scenario 11] Concurrent Closure Attempts against same ACTIVE AcademicYear');
  {
    const { ayId } = await seedQualifyingYear('sc11');
    await db.academicYear.update({
      where: { id: ayId },
      data: { status: AcademicYearStatus.ACTIVE },
    });

    let p1Res: any = null;
    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: ayId },
          data: { status: AcademicYearStatus.CLOSED },
        });
      });
    })();

    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        return await ayService.close(ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    const [res1] = await Promise.all([p1, p2]);
    p1Res = res1;

    assert.ok(p1Res, 'Expected one close to succeed');
    assert.equal(p1Res.status, AcademicYearStatus.CLOSED);
    assert.ok(p2Error, 'Expected racing close to fail with 409 ALREADY_CLOSED');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.CLOSED);
    console.log(`  -> PASS: Serialized on AcademicYear FOR UPDATE. Exactly one close succeeded, second rejected with 409 (${tWait}ms wait). Final state: CLOSED.`);
  }

  // ============================================================================
  // SCENARIO 12: Admission Confirmation racing with AcademicYear Closure
  // ============================================================================
  console.log('[Scenario 12] Admission Confirmation racing with AcademicYear Closure');
  {
    const { ayId, program, cls, sec, fc, fs } = await seedQualifyingYear('sc12');
    await db.academicYear.update({
      where: { id: ayId },
      data: { status: AcademicYearStatus.ACTIVE },
    });

    const adm = await db.admission.create({
      data: {
        schoolId,
        academicYearId: ayId,
        programId: program.id,
        classId: cls.id,
        sectionId: sec.id,
        admissionStatus: AdmissionStatus.DRAFT,
        studentName: `Student Conf ${runId}`,
        admissionNumber: `ADM-${runId}`,
        admissionSequence: 1,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2016-01-01'),
        parentName: 'Parent Conf',
        parentRelation: Relation.MOTHER,
        parentPhone: '9876543210',
        addressLine1: 'Address',
        city: 'City',
        state: 'State',
        createdById: collegeAdminId,
      },
    });

    const header = await db.feePaymentHeader.create({
      data: {
        admissionId: adm.id,
        academicYearId: ayId,
        feeStructureId: fs.id,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: 1000,
        discountAmount: 0,
        netAmount: 1000,
        totalFeeAmount: 1000,
        totalPaidAmount: 1000,
        totalDueAmount: 0,
        isActive: true,
        feePaymentDetails: {
          create: {
            feeComponentId: fc.id,
            nameSnapshot: 'Tuition Fee',
            originalAmount: 1000,
            discountAmount: 0,
            discountApplicable: false,
            totalAmountToBePaid: 1000,
            amountPaid: 1000,
            finalAmount: 1000,
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            paymentDate: new Date(),
          },
        },
      },
    });

    await db.feePayment.create({
      data: {
        idempotencyKey: `idem-sc12-${runId}`,
        schoolId,
        userId: collegeAdminId,
        admissionId: adm.id,
        feePaymentHeaderId: header.id,
        amount: 1000,
        paymentDate: new Date(),
        paymentMethod: 'CASH' as any,
      },
    });

    let pConfirmRes: any = null;
    let pCloseRes: any = null;
    let t0 = 0;
    let tWait = 0;

    // Tx 1: Confirm admission holding Admission FOR UPDATE, then AcademicYear FOR SHARE
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${adm.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${ayId} FOR SHARE`;
        await delay(60);
        return tx.admission.update({
          where: { id: adm.id },
          data: { admissionStatus: AdmissionStatus.CONFIRMED },
        });
      });
    })();

    // Tx 2: Close academic year starting slightly after Tx 1
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      const res = await ayService.close(ayId, adminActor);
      tWait = Date.now() - t0;
      return res;
    })();

    const [r1, r2] = await Promise.all([p1, p2]);
    pConfirmRes = r1;
    pCloseRes = r2;

    assert.ok(pConfirmRes, 'Expected Admission confirmation to succeed');
    assert.ok(pCloseRes, 'Expected AcademicYear close to succeed after confirmation unblocks');
    assert.equal(pCloseRes.status, AcademicYearStatus.CLOSED);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedAdm = await db.admission.findUnique({ where: { id: adm.id } });
    assert.equal(persistedAdm?.admissionStatus, AdmissionStatus.CONFIRMED);

    const persistedAy = await db.academicYear.findUnique({ where: { id: ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.CLOSED);
    console.log(`  -> PASS: Serialized cleanly without deadlock. Admission confirmed, AY closed (lock wait ${tWait}ms).`);
  }

  // ============================================================================
  // SCENARIO 13A: Program Reassignment commits first vs AcademicYear Activation
  // ============================================================================
  console.log('[Scenario 13A] Program Reassignment commits first vs AcademicYear Activation');
  {
    const yearAId = `ay-r-13a-a-${runId}`;
    const { ayId: yearBId } = await seedQualifyingYear('sc13a-b');

    await db.academicYear.create({
      data: {
        id: yearAId,
        schoolId,
        name: `AY-Reassign-13A-A-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    const prg = await db.program.create({
      data: {
        id: `prg-reassign-13a-${runId}`,
        name: `Reassignable Program 13A ${runId}`,
        academicYearId: yearAId,
        isActive: true,
        daysOfWeek: [DayOfWeek.MONDAY],
        startTime: '08:00',
        endTime: '14:00',
      },
    });

    let pActivateRes: any = null;
    let t0 = 0;
    let tWait = 0;

    // Tx 1: Reassign program from Year A to Year B holding dual sorted FOR SHARE locks
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        const sortedYears = [yearAId, yearBId].sort();
        for (const yId of sortedYears) {
          await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${yId} FOR SHARE`;
        }
        await tx.program.update({
          where: { id: prg.id },
          data: { academicYearId: yearBId },
        });
        await delay(60);
      });
    })();

    // Tx 2: Activate Year B (attempts FOR UPDATE lock on yearBId)
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      const res = await ayService.activate(yearBId, adminActor);
      tWait = Date.now() - t0;
      return res;
    })();

    const [, actRes] = await Promise.all([p1, p2]);
    pActivateRes = actRes;

    assert.ok(pActivateRes, 'Expected Year B activation to succeed after reassignment commits');
    assert.equal(pActivateRes.status, AcademicYearStatus.ACTIVE);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on Year B FOR UPDATE, got ${tWait}ms`);

    const persistedPrg = await db.program.findUnique({ where: { id: prg.id } });
    assert.equal(persistedPrg?.academicYearId, yearBId);
    console.log(`  -> PASS: Reassignment won. Dual sorted locks held 60ms. Activation waited ${tWait}ms on Year B lock. Program reassigned, Year B ACTIVE.`);
  }

  // ============================================================================
  // SCENARIO 13B: AcademicYear Activation commits first vs Program Reassignment
  // ============================================================================
  console.log('[Scenario 13B] AcademicYear Activation commits first vs Program Reassignment');
  {
    const yearAId = `ay-r-13b-a-${runId}`;
    const { ayId: yearBId } = await seedQualifyingYear('sc13b-b');

    await db.academicYear.create({
      data: {
        id: yearAId,
        schoolId,
        name: `AY-Reassign-13B-A-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
      },
    });

    const prg = await db.program.create({
      data: {
        id: `prg-reassign-13b-${runId}`,
        name: `Reassignable Program 13B ${runId}`,
        academicYearId: yearAId,
        isActive: true,
        daysOfWeek: [DayOfWeek.MONDAY],
        startTime: '08:00',
        endTime: '14:00',
      },
    });

    let p2Error: any = null;
    let t0 = 0;
    let tWait = 0;

    // Tx 1: Activate Year B holding FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${yearBId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: yearBId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    // Tx 2: ProgramService.updatePrgm reassigning prg to Year B
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await programService.updatePrgm(prg.id, {
          academicYear: yearBId,
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected Program reassignment to fail when target Year B is ACTIVE');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on Year B FOR SHARE, got ${tWait}ms`);

    const persistedPrg = await db.program.findUnique({ where: { id: prg.id } });
    assert.equal(persistedPrg?.academicYearId, yearAId, 'Program must remain in Year A when reassignment fails');

    const persistedYearB = await db.academicYear.findUnique({ where: { id: yearBId } });
    assert.equal(persistedYearB?.status, AcademicYearStatus.ACTIVE);
    console.log(`  -> PASS: Activation won. Program reassignment blocked on lock (${tWait}ms), rejected with 409. Program remains in Year A, Year B is ACTIVE.`);
  }

  console.log('\n================================================================');
  console.log('ALL CONCURRENCY SCENARIOS VERIFIED 100% CLEAN!');
  console.log('================================================================\n');

  await db.$disconnect();
}

run().catch((err) => {
  console.error('CONCURRENCY TEST SUITE FAILED:', err);
  process.exit(1);
});
