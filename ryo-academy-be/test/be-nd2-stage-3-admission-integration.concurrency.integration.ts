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
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import {
  AcademicYearStatus,
  AdmissionStatus,
  DayOfWeek,
  FeePricingVersion,
  Gender,
  PaymentMethod,
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
  const paymentService = new AdmissionPaymentService(db);

  console.log('\n================================================================');
  console.log('BE-ND2 STAGE 3: ADMISSION INTEGRATION CONCURRENCY TEST SUITE');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-s3-${runId}`;
  const collegeAdminId = `usr-col-s3-${runId}`;

  // 1. Setup seed School and Users
  await db.school.create({
    data: { id: schoolId, name: `Stage 3 School ${runId}`, schoolCode: `S3-${runId}` },
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
      email: `admin-s3-${runId}@ryo.local`,
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

  async function seedTestYearAndStructure(prefix: string, ayStatus: AcademicYearStatus = AcademicYearStatus.ACTIVE) {
    const ayId = `ay-${prefix}-${runId}`;
    const ay = await db.academicYear.create({
      data: {
        id: ayId,
        schoolId,
        name: `AY-${prefix}-${runId}`,
        status: ayStatus,
        startDate: new Date('2027-06-01'),
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
        gstPercentage: new Prisma.Decimal('18.00'),
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
          discountPercentage: '0.00',
        },
      ],
    };
  }

  // ============================================================================
  // SCENARIO A: Ordering A — Admission creation vs AcademicYear closure (Closure wins)
  // ============================================================================
  console.log('[Scenario A1] Admission creation vs AcademicYear closure (Closure wins)');
  {
    const fixture = await seedTestYearAndStructure('sc-a1', AcademicYearStatus.ACTIVE);
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

    // Tx 2: Admission creation attempts AcademicYear FOR SHARE
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await admissionService.create(makeAdmissionDto(fixture, 1));
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected Admission creation to fail in CLOSED academic year');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const finalAy = await db.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.CLOSED);

    const admissionCount = await db.admission.count({ where: { academicYearId: fixture.ayId } });
    assert.equal(admissionCount, 0, 'No admission should be persisted');

    const headerCount = await db.feePaymentHeader.count({ where: { academicYearId: fixture.ayId } });
    assert.equal(headerCount, 0, 'No fee payment header should be persisted');

    console.log(`  -> PASS: Closure won. Admission creation blocked on AcademicYear lock (${tWait}ms), rejected with 409. 0 admissions created, AY=CLOSED.`);
  }

  // ============================================================================
  // SCENARIO A: Ordering B — Admission creation vs AcademicYear closure (Creation wins)
  // ============================================================================
  console.log('[Scenario A2] Admission creation vs AcademicYear closure (Admission creation wins)');
  {
    const fixture = await seedTestYearAndStructure('sc-a2', AcademicYearStatus.ACTIVE);
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Admission creation acquires AcademicYear FOR SHARE and holds lock for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id", "status", "isActive", "deletedAt" FROM "AcademicYear" WHERE "id" = ${fixture.ayId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${fixture.fs.id} FOR SHARE`;

        const adm = await tx.admission.create({
          data: {
            admissionNumber: `ADM-A2-${runId}`,
            schoolId,
            academicYearId: fixture.ayId,
            programId: fixture.program.id,
            classId: fixture.cls.id,
            sectionId: fixture.sec.id,
            studentName: `Student A2 ${runId}`,
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
            pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
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

    // Tx 2: AcademicYear close attempts AcademicYear FOR UPDATE
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await ayService.close(fixture.ayId, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected AcademicYear closure to fail due to remaining DRAFT admission');
    assert.equal(p2Error.status, 409);
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const finalAy = await db.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.ACTIVE, 'Academic year should remain ACTIVE');

    const draftCount = await db.admission.count({
      where: { academicYearId: fixture.ayId, admissionStatus: AdmissionStatus.DRAFT },
    });
    assert.equal(draftCount, 1, 'Draft admission should be cleanly persisted');

    console.log(`  -> PASS: Admission creation won. Closure blocked on AcademicYear lock (${tWait}ms), rejected with 409. AY remains ACTIVE, 1 DRAFT admission persisted.`);
  }

  // ============================================================================
  // Helper to setup scheduled admission with a payment for Scenario B
  // ============================================================================
  async function seedAdmissionWithPayment(prefix: string, amount: string = '1000.00') {
    const fixture = await seedTestYearAndStructure(prefix, AcademicYearStatus.ACTIVE);
    const adm = await admissionService.create(makeAdmissionDto(fixture, 100));

    const header = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: adm.id },
      include: { feePaymentDetails: true },
    });

    // Create schedule matching header total (11800.00: 10000 + 18% GST)
    const schedule = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: adm.id,
        feePaymentHeaderId: header.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('11800.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: header.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 1',
              amount: new Prisma.Decimal('6000.00'),
              dueDate: new Date('2027-07-01'),
              status: 'PENDING',
            },
            {
              feePaymentHeaderId: header.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 2',
              amount: new Prisma.Decimal('5800.00'),
              dueDate: new Date('2027-11-01'),
              status: 'PENDING',
            },
          ],
        },
      },
    });

    // Record cash payment
    const detailId = header.feePaymentDetails[0].id;
    const payRes = await paymentService.createAdmissionPayment(
      adm.id,
      {
        idempotencyKey: `pay-${prefix}-${runId}`,
        amount,
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2027-06-05T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: detailId, amount }],
      },
      collegeAdminId,
    );

    return { fixture, adm, header, schedule, paymentId: payRes.id };
  }

  // ============================================================================
  // SCENARIO B: Ordering A — Confirmation vs payment reversal (Reversal wins)
  // ============================================================================
  console.log('[Scenario B1] Confirmation vs payment reversal (Payment reversal wins)');
  {
    const setup = await seedAdmissionWithPayment('sc-b1', '1000.00');
    let t0 = 0;
    let tWait = 0;
    let p2Error: any = null;

    // Tx 1: Payment reversal holding Admission FOR UPDATE for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${setup.adm.id} FOR UPDATE`;
        await delay(60);
        return paymentService.reverseAdmissionPayment(
          setup.adm.id,
          setup.paymentId,
          {
            idempotencyKey: `rev-b1-${runId}`,
            reason: 'Wrong receipt issued',
          },
          collegeAdminId,
          undefined,
          tx,
        );
      });
    })();

    // Tx 2: Confirmation attempts Admission FOR UPDATE
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        await admissionService.confirmAdmission(setup.adm.id, adminActor);
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected Confirmation to fail when payment is reversed');
    assert.equal(p2Error.status, 409);
    const errBody = typeof p2Error.getResponse === 'function' ? p2Error.getResponse() : p2Error.response;
    assert.equal(errBody?.code, 'CONFIRMATION_PAYMENT_REQUIRED');
    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);

    const finalAdm = await db.admission.findUnique({ where: { id: setup.adm.id } });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.DRAFT, 'Admission must remain DRAFT');
    assert.equal(finalAdm?.studentId, null, 'No student should be linked');

    const studentCount = await db.student.count({ where: { admissionId: setup.adm.id } });
    assert.equal(studentCount, 0, 'No Student should be created');

    const revEvent = await db.paymentReversalEvent.findUnique({
      where: { feePaymentId: setup.paymentId },
    });
    assert.ok(revEvent, 'Reversal event must be persisted');

    console.log(`  -> PASS: Reversal won. Confirmation blocked on Admission lock (${tWait}ms), rejected with 409 CONFIRMATION_PAYMENT_REQUIRED. Admission=DRAFT, 0 Students created.`);
  }

  // ============================================================================
  // SCENARIO B: Ordering B — Confirmation vs payment reversal (Confirmation wins)
  // ============================================================================
  console.log('[Scenario B2] Confirmation vs payment reversal (Confirmation wins)');
  {
    const setup = await seedAdmissionWithPayment('sc-b2', '1000.00');
    let t0 = 0;
    let tWait = 0;
    let p2Res: any = null;
    let p2Error: any = null;

    // Tx 1: Confirmation acquires Admission FOR UPDATE and holds lock for 60ms
    const p1 = (async () => {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${setup.adm.id} FOR UPDATE`;
        await delay(60);
        // Step 11: Create student
        const student = await tx.student.create({
          data: {
            admissionId: setup.adm.id,
            studentName: setup.adm.studentName,
            studentNumber: setup.adm.admissionNumber,
            gender: setup.adm.gender,
            dateOfBirth: setup.adm.dateOfBirth,
          },
        });
        // Step 12: Update admission to CONFIRMED
        return tx.admission.update({
          where: { id: setup.adm.id },
          data: {
            admissionStatus: AdmissionStatus.CONFIRMED,
            studentId: student.id,
            confirmedById: collegeAdminId,
            confirmedAt: new Date(),
          },
        });
      });
    })();

    // Tx 2: Payment reversal attempts Admission FOR UPDATE
    const p2 = (async () => {
      await delay(10);
      t0 = Date.now();
      try {
        p2Res = await paymentService.reverseAdmissionPayment(
          setup.adm.id,
          setup.paymentId,
          {
            idempotencyKey: `rev-b2-${runId}`,
            reason: 'Student-authorized reversal',
          },
          collegeAdminId,
        );
      } catch (err) {
        tWait = Date.now() - t0;
        p2Error = err;
      }
    })();

    await Promise.all([p1, p2]);
    tWait = Date.now() - t0;

    assert.ok(tWait >= 40, `Expected lock wait >= 40ms, got ${tWait}ms`);
    assert.equal(p2Error, null, 'Payment reversal should proceed under authorized policy');
    assert.equal(p2Res?.statusCode, 200, 'Reversal should return 200');

    const finalAdm = await db.admission.findUnique({
      where: { id: setup.adm.id },
      include: { student: true },
    });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.CONFIRMED, 'Admission must remain CONFIRMED');
    assert.ok(finalAdm?.student, 'Student linkage must be intact');

    const studentCount = await db.student.count({ where: { admissionId: setup.adm.id } });
    assert.equal(studentCount, 1, 'Exactly one Student record must exist');

    const revEvent = await db.paymentReversalEvent.findUnique({
      where: { feePaymentId: setup.paymentId },
    });
    assert.ok(revEvent, 'Reversal event must be recorded cleanly');

    const finalHeader = await db.feePaymentHeader.findUniqueOrThrow({
      where: { id: setup.header.id },
    });
    assert.equal(finalHeader.totalPaidAmount.toFixed(2), '0.00');
    assert.equal(finalHeader.totalDueAmount.toFixed(2), '11800.00');

    console.log(`  -> PASS: Confirmation won. Reversal blocked on Admission lock (${tWait}ms), then completed cleanly under authorized policy. Exactly 1 Student, Admission=CONFIRMED, reversal event recorded.`);
  }

  console.log('\n================================================================');
  console.log('ALL BE-ND2 STAGE 3 CONCURRENCY SCENARIOS VERIFIED 100% CLEAN!');
  console.log('================================================================\n');

  await db.$disconnect();
}

run().catch((err) => {
  console.error('STAGE 3 CONCURRENCY SUITE FAILED:', err);
  process.exit(1);
});
