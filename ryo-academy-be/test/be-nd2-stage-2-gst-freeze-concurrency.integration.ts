import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AcademicYearService } from '../src/academic/academic-year/academic-year.service.js';
import { ProgramService } from '../src/academic/program/program.service.js';
import { ClassService } from '../src/academic/class/class.service.js';
import { FeeStructureService } from '../src/admission/fee-structure/fee-structure.service.js';
import { FeeComponentService } from '../src/admission/fee-component/fee-component.service.js';
import { AcademicCalendarService } from '../src/academic/academic-calendar/academic-calendar.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import {
  AcademicYearStatus,
  AdmissionStatus,
  DayOfWeek,
  Gender,
  Relation,
  Prisma,
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
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);

  console.log('\n================================================================');
  console.log('BE-ND2 STAGE 2: GST CONFIGURATION FREEZE CONCURRENCY TEST SUITE');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-s2-${runId}`;
  const collegeAdminId = `usr-col-s2-${runId}`;

  // 1. Setup seed School and Users
  await db.school.create({
    data: { id: schoolId, name: `Stage 2 School ${runId}`, schoolCode: `S2-${runId}` },
  });

  const roleAdmin = await db.role.upsert({
    where: { name: 'COLLEGE_ADMIN' },
    update: {},
    create: { name: 'COLLEGE_ADMIN', description: 'College Admin' },
  });

  await db.user.create({
    data: {
      id: collegeAdminId,
      schoolId,
      firstName: 'College',
      lastName: 'Admin',
      email: `admin-s2-${runId}@ryo.local`,
      passwordHash: 'dummyhash',
      roles: {
        create: { roleId: roleAdmin.id },
      },
    },
  });

  const adminActor = {
    userId: collegeAdminId,
    id: collegeAdminId,
    schoolId,
    roles: ['COLLEGE_ADMIN'],
  };

  async function seedTestYearAndStructure(prefix: string, gstPercentage: string = '18.00') {
    const ayId = `ay-${prefix}-${runId}`;
    const ay = await db.academicYear.create({
      data: {
        id: ayId,
        schoolId,
        name: `AY-${prefix}-${runId}`,
        status: AcademicYearStatus.DRAFT,
        startDate: new Date('2027-06-01'), // future start date
        endDate: new Date('2028-05-31'),
        isActive: true,
      },
    });

    const program = await db.program.create({
      data: {
        id: `prg-${prefix}-${runId}`,
        name: `Program ${prefix} ${runId}`,
        academicYearId: ayId,
        isActive: true,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
        startTime: '08:00',
        endTime: '14:00',
      },
    });

    const cls = await db.class.create({
      data: {
        id: `cls-${prefix}-${runId}`,
        name: `Class ${prefix} ${runId}`,
        programId: program.id,
        isActive: true,
      },
    });

    const sec = await db.section.create({
      data: {
        id: `sec-${prefix}-${runId}`,
        name: `Section A ${prefix}`,
        classId: cls.id,
      },
    });

    const fs = await db.feeStructure.create({
      data: {
        id: `fs-${prefix}-${runId}`,
        name: `Fee Plan ${prefix} ${runId}`,
        academicYearId: ayId,
        programId: program.id,
        classId: cls.id,
        totalAmount: 10000,
        gstPercentage: new Prisma.Decimal(gstPercentage),
        isActive: true,
      },
    });

    const fc = await db.feeComponent.create({
      data: {
        id: `fc-${prefix}-${runId}`,
        name: `Tuition ${prefix} ${runId}`,
        feeStructureId: fs.id,
        amount: 10000,
        discountApplicable: true,
        isMandatory: true,
        isActive: true,
      },
    });

    return { ayId, program, cls, sec, fs, fc };
  }

  function makeAdmissionDto(fixture: any, seq: number) {
    return {
      schoolId,
      academicYearId: fixture.ayId,
      programId: fixture.program.id,
      classId: fixture.cls.id,
      sectionId: fixture.sec.id,
      studentName: `Student ${seq} ${runId}`,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2018-05-15'),
      parentName: `Parent ${seq}`,
      parentRelation: Relation.FATHER,
      parentPhone: '9876543210',
      addressLine1: '123 Main St',
      city: 'Metropolis',
      state: 'State',
      postalCode: '500001',
      country: 'India',
      createdById: collegeAdminId,
      selectedFeeComponentIds: [fixture.fc.id],
      components: [
        {
          feeComponentId: fixture.fc.id,
          discountPercentage: '10.00', // 10% discount
        },
      ],
    };
  }

  // ============================================================================
  // SCENARIO 1A: FeeStructure update commits first vs First Admission consumption
  // ============================================================================
  console.log('[Scenario 1A] FeeStructure update commits first vs First Admission consumption');
  {
    const fixture = await seedTestYearAndStructure('sc1a', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Res: any = null;

    // Tx 1: Update FeeStructure gstPercentage to 12.00 holding FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR UPDATE`;
        await tx.feeStructure.update({
          where: { id: fixture.fs.id },
          data: { gstPercentage: new Prisma.Decimal('12.00') },
        });
        await delay(60);
      });
    })();

    // Tx 2: AdmissionService.create consuming the fee structure
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      const res = await admissionService.create(makeAdmissionDto(fixture, 1));
      tWait = Date.now() - t0;
      return res;
    })();

    const [, admRes] = await Promise.all([p1, p2]);
    p2Res = admRes;

    assert.ok(p2Res, 'Expected Admission creation to succeed after FeeStructure update');
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on FeeStructure lock, got ${tWait}ms`);

    // Verify admission snapshotted the updated 12.00% GST
    const header = await db.feePaymentHeader.findFirst({
      where: { feeStructureId: fixture.fs.id },
      include: { feePaymentDetails: true },
    });
    assert.ok(header, 'FeePaymentHeader must exist');
    assert.equal(header?.feePaymentDetails[0]?.gstPercentage?.toFixed(2), '12.00');
    console.log(`  -> PASS: FeeStructure update won. Admission waited ${tWait}ms on lock and snapshotted updated 12.00% GST.`);
  }

  // ============================================================================
  // SCENARIO 1B: First Admission consumption commits first vs FeeStructure update
  // ============================================================================
  console.log('[Scenario 1B] First Admission consumption commits first vs FeeStructure update');
  {
    const fixture = await seedTestYearAndStructure('sc1b', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: First Admission creation holding FeeStructure FOR SHARE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-1B-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 1B ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 1,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 1000,
            taxableAmount: 9000,
            gstAmount: 1620,
            netAmount: 10620,
            totalPaidAmount: 0,
            totalDueAmount: 10620,
            totalFeeAmount: 10620,
          },
        });
        await delay(60);
      });
    })();

    // Tx 2: FeeStructureService.update attempting to modify consumed FeeStructure
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.update(fixture.fs.id, {
          name: 'Illegal Renaming Attempt',
          gstPercentage: '28.00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeStructure update to fail after first consumption commits');
    assert.equal(p2Error.status, 409, `Expected HTTP 409, got ${p2Error.status}`);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedFs = await db.feeStructure.findUnique({ where: { id: fixture.fs.id } });
    assert.equal(persistedFs?.name, `Fee Plan sc1b ${runId}`);
    assert.equal(persistedFs?.gstPercentage.toFixed(2), '18.00');
    console.log(`  -> PASS: Consumption won. FeeStructure update blocked on lock (${tWait}ms), rejected with 409. Name & GST unchanged.`);
  }

  // ============================================================================
  // SCENARIO 2: FeeComponent update vs First Admission consumption
  // ============================================================================
  console.log('[Scenario 2] FeeComponent update vs First Admission consumption');
  {
    const fixture = await seedTestYearAndStructure('sc2', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: First Admission creation holding locks 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-2-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 2 ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 2,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 0,
            taxableAmount: 10000,
            gstAmount: 1800,
            netAmount: 11800,
            totalPaidAmount: 0,
            totalDueAmount: 11800,
            totalFeeAmount: 11800,
          },
        });
        await delay(60);
      });
    })();

    // Tx 2: FeeComponentService.update attempting to change component amount
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeComponentService.update(fixture.fc.id, {
          amount: '15000.00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeComponent update to fail when parent FeeStructure is consumed');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedFc = await db.feeComponent.findUnique({ where: { id: fixture.fc.id } });
    assert.equal(persistedFc?.amount.toFixed(2), '10000.00');
    const persistedFs = await db.feeStructure.findUnique({ where: { id: fixture.fs.id } });
    assert.equal(persistedFs?.totalAmount.toFixed(2), '10000.00');
    console.log(`  -> PASS: Admission won. FeeComponent update blocked on lock (${tWait}ms), rejected with 409. Amounts unchanged.`);
  }

  // ============================================================================
  // SCENARIO 3: FeeStructure deletion vs First Admission consumption
  // ============================================================================
  console.log('[Scenario 3] FeeStructure deletion vs First Admission consumption');
  {
    const fixture = await seedTestYearAndStructure('sc3', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: First Admission creation holding locks 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-3-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 3 ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 3,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 0,
            taxableAmount: 10000,
            gstAmount: 1800,
            netAmount: 11800,
            totalPaidAmount: 0,
            totalDueAmount: 11800,
            totalFeeAmount: 11800,
          },
        });
        await delay(60);
      });
    })();

    // Tx 2: FeeStructureService.delete
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.delete(fixture.fs.id, collegeAdminId);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeStructure deletion to fail after first consumption');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const persistedFs = await db.feeStructure.findUnique({ where: { id: fixture.fs.id } });
    assert.equal(persistedFs?.isActive, true);
    assert.equal(persistedFs?.deletedAt, null);
    console.log(`  -> PASS: Admission won. FeeStructure delete blocked on lock (${tWait}ms), rejected with 409. Structure remains active.`);
  }

  // ============================================================================
  // SCENARIO 4: FeeComponent creation vs First Admission consumption
  // ============================================================================
  console.log('[Scenario 4] FeeComponent creation vs First Admission consumption');
  {
    const fixture = await seedTestYearAndStructure('sc4', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: First Admission creation holding locks 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-4-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 4 ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 4,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 0,
            taxableAmount: 10000,
            gstAmount: 1800,
            netAmount: 11800,
            totalPaidAmount: 0,
            totalDueAmount: 11800,
            totalFeeAmount: 11800,
          },
        });
        await delay(60);
      });
    })();

    // Tx 2: FeeComponentService.create attempting to add a component
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeComponentService.create({
          feeStructureId: fixture.fs.id,
          name: 'Extra Lab Fee',
          amount: '2000.00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeComponent creation to fail on consumed structure');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const count = await db.feeComponent.count({ where: { feeStructureId: fixture.fs.id } });
    assert.equal(count, 1, 'No additional component should be created');
    console.log(`  -> PASS: Admission won. Component creation blocked on lock (${tWait}ms), rejected with 409. 0 components added.`);
  }

  // ============================================================================
  // SCENARIO 5: AcademicYear activation vs FeeStructure update
  // ============================================================================
  console.log('[Scenario 5] AcademicYear activation vs FeeStructure update');
  {
    const fixture = await seedTestYearAndStructure('sc5', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Activate AcademicYear holding AcademicYear FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: fixture.ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    // Tx 2: FeeStructure update attempting to edit structure in activating year
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.update(fixture.fs.id, {
          name: 'Update in Active Year',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeStructure update to fail when AcademicYear becomes ACTIVE');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on AcademicYear FOR SHARE, got ${tWait}ms`);

    const persistedAy = await db.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(persistedAy?.status, AcademicYearStatus.ACTIVE);
    console.log(`  -> PASS: Activation won. FeeStructure update blocked on AcademicYear lock (${tWait}ms), rejected with 409.`);
  }

  // ============================================================================
  // SCENARIO 6: AcademicYear activation vs FeeComponent update
  // ============================================================================
  console.log('[Scenario 6] AcademicYear activation vs FeeComponent update');
  {
    const fixture = await seedTestYearAndStructure('sc6', '18.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Activate AcademicYear holding AcademicYear FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: fixture.ayId },
          data: { status: AcademicYearStatus.ACTIVE },
        });
      });
    })();

    // Tx 2: FeeComponent update attempting to edit component in activating year
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeComponentService.update(fixture.fc.id, {
          amount: '12000.00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeComponent update to fail when AcademicYear becomes ACTIVE');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on AcademicYear FOR SHARE, got ${tWait}ms`);

    const persistedFc = await db.feeComponent.findUnique({ where: { id: fixture.fc.id } });
    assert.equal(persistedFc?.amount.toFixed(2), '10000.00');
    console.log(`  -> PASS: Activation won. FeeComponent update blocked on AcademicYear lock (${tWait}ms), rejected with 409.`);
  }

  // ============================================================================
  // SCENARIO 7: Concurrent First Consumption attempts (two admissions)
  // ============================================================================
  console.log('[Scenario 7] Concurrent First Consumption attempts');
  {
    const fixture = await seedTestYearAndStructure('sc7', '18.00');

    // Tx 1: Consumes FeeStructure holding FeeStructure FOR SHARE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-7A-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 7A ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 71,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 0,
            taxableAmount: 10000,
            gstAmount: 1800,
            netAmount: 11800,
            totalPaidAmount: 0,
            totalDueAmount: 11800,
            totalFeeAmount: 11800,
          },
        });
        await delay(60);
        return adm;
      });
    })();

    // Tx 2: Also consumes FeeStructure concurrently at delay 10ms (while Tx 1 holds FOR SHARE)
    const p2 = (async () => {
      await delay(10);
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-7B-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student 7B ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            admissionSequence: 72,
            createdById: collegeAdminId,
          },
        });

        await tx.feePaymentHeader.create({
          data: {
            admissionId: adm.id,
            academicYearId: fixture.ayId,
            feeStructureId: fixture.fs.id,
            pricingVersion: 'V0_SNAPSHOTTED' as any,
            grossAmount: 10000,
            discountAmount: 0,
            taxableAmount: 10000,
            gstAmount: 1800,
            netAmount: 11800,
            totalPaidAmount: 0,
            totalDueAmount: 11800,
            totalFeeAmount: 11800,
          },
        });
        return adm;
      });
    })();

    const [adm1, adm2] = await Promise.all([p1, p2]);

    assert.ok(adm1, 'Expected Admission 1 to succeed');
    assert.ok(adm2, 'Expected Admission 2 to succeed');

    const headerCount = await db.feePaymentHeader.count({
      where: { feeStructureId: fixture.fs.id },
    });
    assert.equal(headerCount, 2, 'Expected exactly 2 FeePaymentHeaders');

    // Both should now freeze the FeeStructure permanently
    await assert.rejects(
      async () => {
        await feeStructureService.update(fixture.fs.id, { name: 'Late Rename' });
      },
      (err: any) => err.status === 409,
      'Subsequent FeeStructure update must fail with 409',
    );
    console.log('  -> PASS: Concurrent first-consumption admissions succeeded without deadlock. Structure is permanently frozen.');
  }

  // ============================================================================
  // SCENARIO 8: Concurrent FeeStructure configuration mutations
  // ============================================================================
  console.log('[Scenario 8] Concurrent FeeStructure configuration mutations');
  {
    const fixture = await seedTestYearAndStructure('sc8', '18.00');
    let t0 = 0;
    let tWait = 0;

    // Tx 1: Update name holding locks for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR UPDATE`;
        await delay(60);
        return tx.feeStructure.update({
          where: { id: fixture.fs.id },
          data: { name: 'Tx 1 Name' },
        });
      });
    })();

    // Tx 2: Update gstPercentage starting slightly after Tx 1
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      const res = await feeStructureService.update(fixture.fs.id, {
        gstPercentage: '5.00',
      });
      tWait = Date.now() - t0;
      return res;
    })();

    const [, res2] = await Promise.all([p1, p2]);
    assert.ok(res2, 'Expected Tx 2 update to succeed after waiting');
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms on FeeStructure FOR UPDATE, got ${tWait}ms`);

    const persistedFs = await db.feeStructure.findUnique({ where: { id: fixture.fs.id } });
    assert.equal(persistedFs?.gstPercentage.toFixed(2), '5.00');
    console.log(`  -> PASS: Serialized on FeeStructure FOR UPDATE cleanly (${tWait}ms wait). No deadlocks.`);
  }

  // ============================================================================
  // SCENARIO 9: Cancellation followed by attempted FeeStructure mutation
  // ============================================================================
  console.log('[Scenario 9] Cancellation followed by attempted FeeStructure mutation');
  {
    const fixture = await seedTestYearAndStructure('sc9', '18.00');

    // 1. Create an admission
    const adm = await admissionService.create(makeAdmissionDto(fixture, 9));

    // 2. Cancel the admission
    await admissionService.updateStatusById(adm.id, adminActor, 'CANCELLED');

    const cancelledAdm = await db.admission.findUnique({ where: { id: adm.id } });
    assert.equal(cancelledAdm?.admissionStatus, AdmissionStatus.CANCELLED);

    // 3. Attempt to update FeeStructure
    let updateError: any = null;
    try {
      await feeStructureService.update(fixture.fs.id, { name: 'Rename After Cancel' });
    } catch (err) {
      updateError = err;
    }

    assert.ok(updateError, 'Expected FeeStructure update to fail even after Admission cancellation');
    assert.equal(updateError.status, 409);
    console.log('  -> PASS: Cancelled admission permanently froze FeeStructure. Update rejected with 409.');
  }

  // ============================================================================
  // SCENARIO 10: Soft-deletion followed by attempted FeeStructure mutation
  // ============================================================================
  console.log('[Scenario 10] Soft-deletion followed by attempted FeeStructure mutation');
  {
    const fixture = await seedTestYearAndStructure('sc10', '18.00');

    // 1. Create an admission
    const adm = await admissionService.create(makeAdmissionDto(fixture, 10));

    // 2. Soft-delete the admission
    await db.admission.update({
      where: { id: adm.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    // 3. Attempt to update FeeStructure
    let updateError: any = null;
    try {
      await feeStructureService.update(fixture.fs.id, { gstPercentage: '12.00' });
    } catch (err) {
      updateError = err;
    }

    assert.ok(updateError, 'Expected FeeStructure update to fail even after Admission soft-deletion');
    assert.equal(updateError.status, 409);
    console.log('  -> PASS: Soft-deleted admission permanently froze FeeStructure. Update rejected with 409.');
  }

  // ============================================================================
  // SCENARIO 11: Historical pricing snapshot immutability verification
  // ============================================================================
  console.log('[Scenario 11] Historical pricing snapshot immutability verification');
  {
    const fixture = await seedTestYearAndStructure('sc11', '18.00');
    const adm = await admissionService.create(makeAdmissionDto(fixture, 11));

    const originalHeader = await db.feePaymentHeader.findFirst({
      where: { admissionId: adm.id },
      include: { feePaymentDetails: true },
    });
    assert.ok(originalHeader);

    // Record persisted historical snapshot values BEFORE mutation attempts
    const beforeHeader = {
      grossAmount: originalHeader.grossAmount.toFixed(2),
      discountAmount: originalHeader.discountAmount.toFixed(2),
      taxableAmount: originalHeader.taxableAmount?.toFixed(2),
      gstAmount: originalHeader.gstAmount?.toFixed(2),
      netAmount: originalHeader.netAmount.toFixed(2),
    };
    const beforeDetail = {
      originalAmount: originalHeader.feePaymentDetails[0].originalAmount.toFixed(2),
      discountPercentage: originalHeader.feePaymentDetails[0].discountPercentage?.toFixed(2) ?? '10.00',
      discountAmount: originalHeader.feePaymentDetails[0].discountAmount.toFixed(2),
      taxableAmount: originalHeader.feePaymentDetails[0].taxableAmount?.toFixed(2),
      gstPercentage: originalHeader.feePaymentDetails[0].gstPercentage?.toFixed(2),
      gstAmount: originalHeader.feePaymentDetails[0].gstAmount?.toFixed(2),
      totalAmountToBePaid: originalHeader.feePaymentDetails[0].totalAmountToBePaid.toFixed(2),
    };

    // Attempt 1: FeeStructure GST mutation
    let errFsGst: any = null;
    try {
      await feeStructureService.update(fixture.fs.id, { gstPercentage: '28.00' });
    } catch (e) {
      errFsGst = e;
    }
    assert.ok(errFsGst, 'Expected FeeStructure GST mutation to fail');
    assert.equal(errFsGst.status, 409);

    // Attempt 2: FeeStructure amount/name mutation
    let errFsMeta: any = null;
    try {
      await feeStructureService.update(fixture.fs.id, { name: 'Attempted Renaming', totalAmount: '99999.00' as any });
    } catch (e) {
      errFsMeta = e;
    }
    assert.ok(errFsMeta, 'Expected FeeStructure name/amount mutation to fail');
    assert.equal(errFsMeta.status, 409);

    // Attempt 3: FeeComponent amount mutation
    let errComp: any = null;
    try {
      await feeComponentService.update(fixture.fc.id, { amount: '99999.00' });
    } catch (e) {
      errComp = e;
    }
    assert.ok(errComp, 'Expected FeeComponent amount mutation to fail');
    assert.equal(errComp.status, 409);

    // Simulate downstream fee configuration read
    const configResult = await admissionService.getFeeConfiguration(adm.id);
    assert.equal(new Prisma.Decimal(configResult.feePaymentHeader.gstAmount).toFixed(2), '1620.00');

    // Fetch persisted snapshot records from database AFTER mutation attempts
    const afterHeader = await db.feePaymentHeader.findUnique({
      where: { id: originalHeader.id },
      include: { feePaymentDetails: true },
    });
    assert.ok(afterHeader);
    const afterDetail = afterHeader.feePaymentDetails[0];

    // Explicit field-by-field before vs after comparison
    assert.equal(afterDetail.originalAmount.toFixed(2), beforeDetail.originalAmount);
    assert.equal(afterDetail.discountPercentage?.toFixed(2) ?? '10.00', beforeDetail.discountPercentage);
    assert.equal(afterDetail.discountAmount.toFixed(2), beforeDetail.discountAmount);
    assert.equal(afterDetail.taxableAmount?.toFixed(2), beforeDetail.taxableAmount);
    assert.equal(afterDetail.gstPercentage?.toFixed(2), beforeDetail.gstPercentage);
    assert.equal(afterDetail.gstAmount?.toFixed(2), beforeDetail.gstAmount);
    assert.equal(afterDetail.totalAmountToBePaid.toFixed(2), beforeDetail.totalAmountToBePaid);

    assert.equal(afterHeader.grossAmount.toFixed(2), beforeHeader.grossAmount);
    assert.equal(afterHeader.discountAmount.toFixed(2), beforeHeader.discountAmount);
    assert.equal(afterHeader.taxableAmount?.toFixed(2), beforeHeader.taxableAmount);
    assert.equal(afterHeader.gstAmount?.toFixed(2), beforeHeader.gstAmount);
    assert.equal(afterHeader.netAmount.toFixed(2), beforeHeader.netAmount);

    console.log('  -> PASS: All historical snapshot fields (original, discount%, discountAmt, taxable, gst%, gstAmt, net) are 100% identical before and after rejected mutations.');
  }

  // ============================================================================
  // SCENARIO 12: AcademicYear closure vs FeeStructure update
  // ============================================================================
  console.log('[Scenario 12] AcademicYear closure vs FeeStructure update');
  {
    const fixture = await seedTestYearAndStructure('sc12', '18.00');
    // Set academic year to ACTIVE so it can be closed
    await db.academicYear.update({
      where: { id: fixture.ayId },
      data: { status: AcademicYearStatus.ACTIVE },
    });

    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Close AcademicYear holding AcademicYear FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: fixture.ayId },
          data: { status: AcademicYearStatus.CLOSED },
        });
      });
    })();

    // Tx 2: FeeStructure update attempting mutation during AcademicYear closure
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeStructureService.update(fixture.fs.id, {
          name: 'Update in Closing Year',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeStructure update to fail when AcademicYear becomes CLOSED');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const finalAy = await db.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.CLOSED);

    const finalFs = await db.feeStructure.findUnique({ where: { id: fixture.fs.id } });
    assert.notEqual(finalFs?.name, 'Update in Closing Year');
    console.log(`  -> PASS: Closure won. FeeStructure update blocked on AcademicYear lock (${tWait}ms), rejected with 409. AY=CLOSED, name unchanged.`);
  }

  // ============================================================================
  // SCENARIO 13: AcademicYear closure vs FeeComponent update
  // ============================================================================
  console.log('[Scenario 13] AcademicYear closure vs FeeComponent update');
  {
    const fixture = await seedTestYearAndStructure('sc13', '18.00');
    // Set academic year to ACTIVE so it can be closed
    await db.academicYear.update({
      where: { id: fixture.ayId },
      data: { status: AcademicYearStatus.ACTIVE },
    });

    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Close AcademicYear holding AcademicYear FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR UPDATE`;
        await delay(60);
        return tx.academicYear.update({
          where: { id: fixture.ayId },
          data: { status: AcademicYearStatus.CLOSED },
        });
      });
    })();

    // Tx 2: FeeComponent update attempting mutation during AcademicYear closure
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await feeComponentService.update(fixture.fc.id, {
          amount: '25000.00',
        });
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected FeeComponent update to fail when AcademicYear becomes CLOSED');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const finalAy = await db.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.CLOSED);

    const finalComp = await db.feeComponent.findUnique({ where: { id: fixture.fc.id } });
    assert.equal(finalComp?.amount.toFixed(2), '10000.00');
    console.log(`  -> PASS: Closure won. FeeComponent update blocked on AcademicYear lock (${tWait}ms), rejected with 409. AY=CLOSED, amount unchanged.`);
  }

  console.log('\n================================================================');
  console.log('ALL BE-ND2 STAGE 2 CONCURRENCY SCENARIOS VERIFIED 100% CLEAN!');
  console.log('================================================================\n');

  await db.$disconnect();
}

run().catch((err) => {
  console.error('CONCURRENCY TEST SUITE FAILED:', err);
  process.exit(1);
});
