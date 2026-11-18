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
  Gender,
  PaymentMethod,
  Relation,
  Prisma,
} from '../generated/prisma/client.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createBarrier() {
  let resolve!: () => void;
  let reject!: (err: any) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForLockContention(inspectDb: DatabaseService, maxWaitMs = 10000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const rows = await inspectDb.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE state = 'active'
        AND wait_event_type = 'Lock'
        AND pid <> pg_backend_pid()
    `;
    const blockedCount = Number(rows[0]?.count ?? 0);
    if (blockedCount > 0) {
      return Date.now() - start;
    }
    await delay(10);
  }
  throw new Error(`Timeout waiting for PostgreSQL lock contention after ${maxWaitMs}ms`);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  // Create three independent DatabaseService instances:
  // db1 for Tx1, db2 for Tx2, inspectDb for contention inspection and assertions
  const db1 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const db2 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const inspectDb = new DatabaseService({ getOrThrow: () => databaseUrl } as any);

  await db1.$connect();
  await db2.$connect();
  await inspectDb.$connect();
  await assertQaDatabase(inspectDb);

  console.log('\n================================================================');
  console.log('BE-ND2 STAGE 4: PRODUCTION-TO-PRODUCTION CONCURRENCY TEST SUITE');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-s4-${runId}`;
  const collegeAdminId = `usr-col-s4-${runId}`;

  // 1. Setup seed School and Users
  await inspectDb.school.create({
    data: { id: schoolId, name: `Stage 4 School ${runId}`, schoolCode: `S4-${runId}` },
  });

  const roleAdmin = await inspectDb.role.upsert({
    where: { name: 'COLLEGE_ADMIN' },
    update: {},
    create: { name: 'COLLEGE_ADMIN', description: 'College Admin' },
  });

  await inspectDb.user.create({
    data: {
      id: collegeAdminId,
      schoolId,
      firstName: 'College',
      lastName: 'Admin',
      email: `admin-s4-${runId}@ryo.local`,
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
    const ay = await inspectDb.academicYear.create({
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

    const program = await inspectDb.program.create({
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

    const cls = await inspectDb.class.create({
      data: {
        id: `cls-${prefix}-${runId}`,
        name: `Class ${prefix} ${runId}`,
        programId: program.id,
        isActive: true,
      },
    });

    const sec = await inspectDb.section.create({
      data: {
        id: `sec-${prefix}-${runId}`,
        name: `Section A ${prefix}`,
        classId: cls.id,
      },
    });

    const fs = await inspectDb.feeStructure.create({
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

    const fc = await inspectDb.feeComponent.create({
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
  // SCENARIO A1: Production ayService.close() vs production admissionService.create()
  // Closure wins
  // ============================================================================
  console.log('[Scenario A1] Production ayService.close() vs production admissionService.create() (Closure wins)');
  {
    const fixture = await seedTestYearAndStructure('prod-a1', AcademicYearStatus.ACTIVE);

    const calendarService1 = new AcademicCalendarService(db1);
    const ayService1 = new AcademicYearService(db1, calendarService1);
    const admissionRepo2 = new AdmissionRepository(db2);
    const admissionService2 = new AdmissionService(db2, admissionRepo2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after tx.academicYear.update succeeds
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origAyUpdate = tx.academicYear.update.bind(tx.academicYear);
        tx.academicYear.update = async (...args: any[]) => {
          const res = await origAyUpdate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p2Error: any = null;

    // Tx1: calls actual production ayService.close()
    const p1 = ayService1.close(fixture.ayId, adminActor);

    // Wait until Tx1 holds AcademicYear row lock
    await tx1LockHeld.promise;

    // Tx2: calls actual production admissionService.create()
    const p2 = (async () => {
      try {
        await admissionService2.create(makeAdmissionDto(fixture, 1));
      } catch (err) {
        p2Error = err;
      }
    })();

    // Verify real PostgreSQL lock contention on AcademicYear
    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    // Release Tx1 commit barrier
    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected production admissionService.create() to fail in CLOSED academic year');
    assert.equal(p2Error.status, 409);
    assert.equal(p2Error.response?.message || p2Error.message, 'Admissions cannot be created in a CLOSED academic year');

    const finalAy = await inspectDb.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.CLOSED);

    const admissionCount = await inspectDb.admission.count({ where: { academicYearId: fixture.ayId } });
    assert.equal(admissionCount, 0, 'No admission should be persisted');

    const headerCount = await inspectDb.feePaymentHeader.count({ where: { academicYearId: fixture.ayId } });
    assert.equal(headerCount, 0, 'No fee payment header should be persisted');

    console.log('  -> PASS: Production ayService.close() won. Production admissionService.create() blocked in PostgreSQL, unblocked post-commit, and cleanly rejected with HTTP 409.');
  }

  // ============================================================================
  // SCENARIO A2: Production admissionService.create() vs production ayService.close()
  // Admission creation wins
  // ============================================================================
  console.log('[Scenario A2] Production admissionService.create() vs production ayService.close() (Creation wins)');
  {
    const fixture = await seedTestYearAndStructure('prod-a2', AcademicYearStatus.ACTIVE);

    const admissionRepo1 = new AdmissionRepository(db1);
    const admissionService1 = new AdmissionService(db1, admissionRepo1);
    const calendarService2 = new AcademicCalendarService(db2);
    const ayService2 = new AcademicYearService(db2, calendarService2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after tx.feePaymentHeader.create succeeds
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origHeaderCreate = tx.feePaymentHeader.create.bind(tx.feePaymentHeader);
        tx.feePaymentHeader.create = async (...args: any[]) => {
          const res = await origHeaderCreate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p2Error: any = null;

    // Tx1: calls actual production admissionService.create()
    const p1 = admissionService1.create(makeAdmissionDto(fixture, 1));

    // Wait until Tx1 holds AcademicYear and FeeStructure FOR SHARE locks and has inserted records
    await tx1LockHeld.promise;

    // Tx2: calls actual production ayService.close()
    const p2 = (async () => {
      try {
        await ayService2.close(fixture.ayId, adminActor);
      } catch (err) {
        p2Error = err;
      }
    })();

    // Verify real PostgreSQL lock contention on AcademicYear (Tx2 FOR UPDATE blocked on Tx1 FOR SHARE)
    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    // Release Tx1 commit barrier
    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected production ayService.close() to fail due to remaining DRAFT admission');
    assert.equal(p2Error.status, 409);
    assert.match(p2Error.message || p2Error.response?.message, /cannot be closed while 1 DRAFT admission/);

    const finalAy = await inspectDb.academicYear.findUnique({ where: { id: fixture.ayId } });
    assert.equal(finalAy?.status, AcademicYearStatus.ACTIVE, 'Academic year should remain ACTIVE');

    const draftCount = await inspectDb.admission.count({
      where: { academicYearId: fixture.ayId, admissionStatus: AdmissionStatus.DRAFT },
    });
    assert.equal(draftCount, 1, 'Draft admission should be cleanly persisted');

    const headerCount = await inspectDb.feePaymentHeader.count({ where: { academicYearId: fixture.ayId } });
    assert.equal(headerCount, 1, 'Fee payment header should be cleanly persisted');

    console.log('  -> PASS: Production admissionService.create() won. Production ayService.close() blocked on row lock in PostgreSQL, saw 1 DRAFT admission post-commit, and rejected with HTTP 409.');
  }

  // ============================================================================
  // Helper to setup scheduled admission with a payment for Scenario B
  // ============================================================================
  async function seedAdmissionWithPayment(prefix: string, amount: string = '1000.00') {
    const fixture = await seedTestYearAndStructure(prefix, AcademicYearStatus.ACTIVE);
    const admissionRepo = new AdmissionRepository(inspectDb);
    const admissionService = new AdmissionService(inspectDb, admissionRepo);
    const paymentService = new AdmissionPaymentService(inspectDb);

    const adm = await admissionService.create(makeAdmissionDto(fixture, 100));

    const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: adm.id },
      include: { feePaymentDetails: true },
    });

    // Create schedule matching header total (11800.00: 10000 + 18% GST)
    const schedule = await inspectDb.admissionInstallmentSchedule.create({
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
  // SCENARIO B1: Production paymentService.reverseAdmissionPayment() vs production admissionService.confirmAdmission()
  // Reversal wins
  // ============================================================================
  console.log('[Scenario B1] Production paymentService.reverseAdmissionPayment() vs production admissionService.confirmAdmission() (Reversal wins)');
  {
    const setup = await seedAdmissionWithPayment('prod-b1', '1000.00');

    const paymentService1 = new AdmissionPaymentService(db1);
    const admissionRepo2 = new AdmissionRepository(db2);
    const admissionService2 = new AdmissionService(db2, admissionRepo2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after tx.financialLog.create succeeds in reversal
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origLogCreate = tx.financialLog.create.bind(tx.financialLog);
        tx.financialLog.create = async (...args: any[]) => {
          const res = await origLogCreate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p2Error: any = null;

    // Tx1: calls actual production paymentService.reverseAdmissionPayment()
    const p1 = paymentService1.reverseAdmissionPayment(
      setup.adm.id,
      setup.paymentId,
      {
        idempotencyKey: `rev-prod-b1-${runId}`,
        reason: 'Duplicate payment issued',
      },
      collegeAdminId,
    );

    // Wait until Tx1 holds Admission row lock and has executed reversal writes
    await tx1LockHeld.promise;

    // Tx2: calls actual production admissionService.confirmAdmission()
    const p2 = (async () => {
      try {
        await admissionService2.confirmAdmission(setup.adm.id, adminActor);
      } catch (err) {
        p2Error = err;
      }
    })();

    // Verify real PostgreSQL lock contention on Admission row
    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    // Release Tx1 commit barrier
    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.ok(p2Error, 'Expected production confirmAdmission() to fail when payment is reversed');
    assert.equal(p2Error.status, 409);
    const errBody = typeof p2Error.getResponse === 'function' ? p2Error.getResponse() : p2Error.response;
    assert.equal(errBody?.code, 'CONFIRMATION_PAYMENT_REQUIRED');

    const finalAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.DRAFT, 'Admission must remain DRAFT');
    assert.equal(finalAdm?.studentId, null, 'No student should be linked');

    const studentCount = await inspectDb.student.count({ where: { admissionId: setup.adm.id } });
    assert.equal(studentCount, 0, 'No Student should be created');

    const revEvent = await inspectDb.paymentReversalEvent.findUnique({
      where: { feePaymentId: setup.paymentId },
    });
    assert.ok(revEvent, 'Reversal event must be persisted');

    const finalHeader = await inspectDb.feePaymentHeader.findUniqueOrThrow({
      where: { id: setup.header.id },
    });
    assert.equal(finalHeader.totalPaidAmount.toFixed(2), '0.00');
    assert.equal(finalHeader.totalDueAmount.toFixed(2), '11800.00');

    console.log('  -> PASS: Production paymentService.reverseAdmissionPayment() won. Production confirmAdmission() blocked on Admission lock, woke post-commit, saw zero non-reversed payments, and rejected with HTTP 409 CONFIRMATION_PAYMENT_REQUIRED.');
  }

  // ============================================================================
  // SCENARIO B2: Production admissionService.confirmAdmission() vs production paymentService.reverseAdmissionPayment()
  // Confirmation wins
  // ============================================================================
  console.log('[Scenario B2] Production admissionService.confirmAdmission() vs production paymentService.reverseAdmissionPayment() (Confirmation wins)');
  {
    const setup = await seedAdmissionWithPayment('prod-b2', '1000.00');

    const admissionRepo1 = new AdmissionRepository(db1);
    const admissionService1 = new AdmissionService(db1, admissionRepo1);
    const paymentService2 = new AdmissionPaymentService(db2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after tx.admission.update succeeds (sets CONFIRMED and studentId)
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origAdmUpdate = tx.admission.update.bind(tx.admission);
        tx.admission.update = async (...args: any[]) => {
          const res = await origAdmUpdate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p2Res: any = null;
    let p2Error: any = null;

    // Tx1: calls actual production admissionService.confirmAdmission()
    const p1 = admissionService1.confirmAdmission(setup.adm.id, adminActor);

    // Wait until Tx1 holds Admission row lock and has confirmed admission
    await tx1LockHeld.promise;

    // Tx2: calls actual production paymentService.reverseAdmissionPayment()
    const p2 = (async () => {
      try {
        p2Res = await paymentService2.reverseAdmissionPayment(
          setup.adm.id,
          setup.paymentId,
          {
            idempotencyKey: `rev-prod-b2-${runId}`,
            reason: 'Authorized post-confirmation reversal',
          },
          collegeAdminId,
        );
      } catch (err) {
        p2Error = err;
      }
    })();

    // Verify real PostgreSQL lock contention on Admission row
    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    // Release Tx1 commit barrier
    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.equal(p2Error, null, 'Payment reversal should proceed under authorized policy');
    assert.equal(p2Res?.statusCode, 200, 'Reversal should return 200');

    const finalAdm = await inspectDb.admission.findUnique({
      where: { id: setup.adm.id },
      include: { student: true },
    });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.CONFIRMED, 'Admission must remain CONFIRMED');
    assert.ok(finalAdm?.student, 'Student linkage must be intact');

    const studentCount = await inspectDb.student.count({ where: { admissionId: setup.adm.id } });
    assert.equal(studentCount, 1, 'Exactly one Student record must exist');

    const revEvent = await inspectDb.paymentReversalEvent.findUnique({
      where: { feePaymentId: setup.paymentId },
    });
    assert.ok(revEvent, 'Reversal event must be recorded cleanly');

    const finalHeader = await inspectDb.feePaymentHeader.findUniqueOrThrow({
      where: { id: setup.header.id },
    });
    assert.equal(finalHeader.totalPaidAmount.toFixed(2), '0.00');
    assert.equal(finalHeader.totalDueAmount.toFixed(2), '11800.00');

    console.log('  -> PASS: Production admissionService.confirmAdmission() won. Production paymentService.reverseAdmissionPayment() blocked on Admission lock, then proceeded under authorized policy. Exactly 1 Student, Admission=CONFIRMED, balances reconciled.');
  }

  console.log('\n================================================================');
  console.log('ALL BE-ND2 STAGE 4 PRODUCTION CONCURRENCY SCENARIOS PASSED 100%!');
  console.log('================================================================\n');

  await db1.$disconnect();
  await db2.$disconnect();
  await inspectDb.$disconnect();
}

run().catch((err) => {
  console.error('STAGE 4 CONCURRENCY SUITE FAILED:', err);
  process.exit(1);
});
