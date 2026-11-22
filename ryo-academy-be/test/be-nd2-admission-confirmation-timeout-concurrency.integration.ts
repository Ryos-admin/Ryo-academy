import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import {
  AdmissionStatus,
  DayOfWeek,
  Gender,
  PaymentMethod,
  Relation,
} from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';

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

  const db1 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const db2 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const inspectDb = new DatabaseService({ getOrThrow: () => databaseUrl } as any);

  await db1.$connect();
  await db2.$connect();
  await inspectDb.$connect();
  await assertQaDatabase(inspectDb);

  console.log('\n================================================================');
  console.log('BE-ND2: ADMISSION CONFIRMATION TIMEOUT CONCURRENCY TEST SUITE');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-conf-to-${runId}`;
  const collegeAdminId = `usr-col-conf-to-${runId}`;

  try {
    // 1. Setup School and Admin User
    await inspectDb.school.create({
      data: { id: schoolId, name: `Confirm Timeout School ${runId}`, schoolCode: `CT-${runId}` },
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
        email: `admin-confto-${runId}@ryo.local`,
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

    async function seedAdmissionWithScheduleAndPayment(prefix: string, payAmount: string = '1000.00') {
      const ayId = `ay-${prefix}-${runId}`;
      await inspectDb.academicYear.create({
        data: {
          id: ayId,
          schoolId,
          name: `AY-${prefix}-${runId}`,
          startDate: new Date('2027-06-01'),
          endDate: new Date('2028-05-31'),
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

      const admissionRepo = new AdmissionRepository(inspectDb);
      const admissionService = new AdmissionService(inspectDb, admissionRepo);
      const paymentService = new AdmissionPaymentService(inspectDb);

      const admission = await admissionService.create(
        {
          schoolId,
          academicYearId: ayId,
          programId: program.id,
          classId: cls.id,
          sectionId: sec.id,
          studentName: `Student ${prefix} ${runId}`,
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2018-05-15'),
          parentName: `Parent ${prefix}`,
          parentRelation: Relation.FATHER,
          parentPhone: '9876543210',
          addressLine1: '123 Main St',
          city: 'Metropolis',
          state: 'State',
          postalCode: '500001',
          country: 'India',
          createdById: collegeAdminId,
          selectedFeeComponentIds: [fc.id],
          components: [
            {
              feeComponentId: fc.id,
              discountPercentage: '0.00',
            },
          ],
        },
        adminActor as any,
      );

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: admission.id },
        include: { feePaymentDetails: true },
      });

      // Total fee with 18% GST: 10000 + 1800 = 11800.00
      const schedule = await inspectDb.admissionInstallmentSchedule.create({
        data: {
          schoolId,
          admissionId: admission.id,
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

      // Create qualifying payment (BE-ND1 prerequisite)
      const detailId = header.feePaymentDetails[0].id;
      const paymentRes = await paymentService.createAdmissionPayment(
        admission.id,
        {
          idempotencyKey: `pay-${prefix}-${runId}`,
          amount: payAmount,
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detailId, amount: payAmount }],
        },
        collegeAdminId,
      );

      return {
        admission,
        ayId,
        fs,
        fc,
        header,
        schedule,
        paymentId: paymentRes.id,
      };
    }

    // ============================================================================
    // TEST A: Six-second lock contention (Within Budget)
    // ============================================================================
    console.log('[Test A] Six-second lock contention: Tx A holds ~6s, Tx B confirmAdmission succeeds');
    {
      const fixture = await seedAdmissionWithScheduleAndPayment('t-a', '1000.00');
      const admissionRepo2 = new AdmissionRepository(db2);
      const admissionService2 = new AdmissionService(db2, admissionRepo2);

      const txAHeld = createBarrier();
      const txARelease = createBarrier();

      let txACompleted = false;
      const txAPromise = db1.$transaction(
        async (tx: any) => {
          await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
          txAHeld.resolve();
          await txARelease.promise;
          txACompleted = true;
        },
        { timeout: 30000, maxWait: 5000 },
      );

      await txAHeld.promise;
      console.log('  -> Tx A acquired Admission row lock');

      const startTime = Date.now();
      const txBPromise = admissionService2.confirmAdmission(
        fixture.admission.id,
        adminActor,
      );

      const contentionMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active after ${contentionMs}ms`);

      // Hold for 6000ms (exceeds old 5s default timeout, within new 10s budget)
      await delay(6000);
      console.log('  -> Tx A releasing lock at t ~ 6000ms');
      txARelease.resolve();
      await txAPromise;
      assert.equal(txACompleted, true, 'Tx A committed successfully');

      const resultB = await txBPromise;
      const elapsed = Date.now() - startTime;
      console.log(`  -> Tx B completed successfully in ${elapsed}ms (elapsed >= 6000ms)`);
      assert.ok(elapsed >= 5800, `Expected elapsed >= 5800ms, got ${elapsed}ms`);

      // 1. Verify Admission becomes CONFIRMED
      const confirmedAdm = await inspectDb.admission.findUniqueOrThrow({
        where: { id: fixture.admission.id },
      });
      assert.equal(confirmedAdm.admissionStatus, AdmissionStatus.CONFIRMED, 'Admission must be CONFIRMED');
      assert.ok(confirmedAdm.studentId, 'studentId must be populated');
      assert.equal(confirmedAdm.confirmedById, collegeAdminId, 'confirmedById must match actor');
      assert.ok(confirmedAdm.confirmedAt !== null, 'confirmedAt timestamp must be set');

      // 2. Verify exactly one Student record created and linked
      const studentCount = await inspectDb.student.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(studentCount, 1, 'Exactly one Student must be created');
      const linkedStudent = await inspectDb.student.findUniqueOrThrow({
        where: { id: confirmedAdm.studentId! },
      });
      assert.equal(linkedStudent.admissionId, fixture.admission.id, 'Student must link to Admission');

      // 3. Verify financial state and payment records remain intact
      const finalHeader = await inspectDb.feePaymentHeader.findUniqueOrThrow({
        where: { id: fixture.header.id },
      });
      assert.equal(finalHeader.totalPaidAmount.toFixed(2), '1000.00', 'Paid amount must remain 1000.00');
      assert.equal(finalHeader.totalDueAmount.toFixed(2), '10800.00', 'Due amount must remain 10800.00');

      const paymentCount = await inspectDb.feePayment.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(paymentCount, 1, 'Payment record must remain intact');

      console.log('  -> PASS: Test A verified successfully.\n');
    }

    // ============================================================================
    // TEST B: Lock wait exceeds budget (~11.5s hold)
    // ============================================================================
    console.log('[Test B] Lock exceeds timeout: Tx A holds lock for ~11.5s, Tx B fails within bounded interval');
    {
      const fixture = await seedAdmissionWithScheduleAndPayment('t-b', '1000.00');
      const admissionRepo2 = new AdmissionRepository(db2);
      const admissionService2 = new AdmissionService(db2, admissionRepo2);

      const txAHeld = createBarrier();
      const txARelease = createBarrier();

      const txAPromise = db1.$transaction(
        async (tx: any) => {
          await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
          txAHeld.resolve();
          await txARelease.promise;
        },
        { timeout: 30000, maxWait: 5000 },
      );

      await txAHeld.promise;
      console.log('  -> Tx A acquired Admission row lock');

      const startTime = Date.now();
      let txBError: any = null;

      const txBPromise = admissionService2
        .confirmAdmission(fixture.admission.id, adminActor)
        .catch((err) => {
          txBError = err;
        });

      const contentionMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active after ${contentionMs}ms. Holding lock for 11.5s (exceeding Tx B 10s timeout)...`);

      // Hold past the 10,000ms timeout
      await delay(11500);

      console.log('  -> Tx A releasing lock at t ~ 11500ms');
      txARelease.resolve();
      await txAPromise;

      await txBPromise;
      const elapsed = Date.now() - startTime;
      console.log(`  -> Tx B failed in ${elapsed}ms`);

      assert.ok(txBError, 'Tx B must fail when lock is held past 10s timeout');
      console.log(`  -> Observed error: ${txBError?.name || txBError?.constructor?.name}, message: "${txBError?.message?.slice(0, 100)}..."`);
      assert.ok(
        elapsed >= 9500 && elapsed <= 16000,
        `Expected Tx B failure interval between 9.5s and 16s, got ${elapsed}ms`,
      );

      // Verify complete atomicity & rollback:
      // 1. Admission remains DRAFT
      const unconfirmedAdm = await inspectDb.admission.findUniqueOrThrow({
        where: { id: fixture.admission.id },
      });
      assert.equal(unconfirmedAdm.admissionStatus, AdmissionStatus.DRAFT, 'Admission must remain DRAFT');
      assert.equal(unconfirmedAdm.studentId, null, 'studentId must remain null');
      assert.equal(unconfirmedAdm.confirmedById, null, 'confirmedById must remain null');
      assert.equal(unconfirmedAdm.confirmedAt, null, 'confirmedAt must remain null');

      // 2. Zero Student records created
      const studentCount = await inspectDb.student.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(studentCount, 0, 'No Student must be created on failed confirmation');

      // 3. Payment records, fee snapshots, and header balances remain unchanged
      const finalHeader = await inspectDb.feePaymentHeader.findUniqueOrThrow({
        where: { id: fixture.header.id },
      });
      assert.equal(finalHeader.totalPaidAmount.toFixed(2), '1000.00', 'Paid amount must remain 1000.00');
      assert.equal(finalHeader.totalDueAmount.toFixed(2), '10800.00', 'Due amount must remain 10800.00');

      const paymentCount = await inspectDb.feePayment.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(paymentCount, 1, 'Original payment must remain intact');

      // 4. Verify subsequent database operations succeed
      const verifyRead = await inspectDb.admission.findUnique({
        where: { id: fixture.admission.id },
      });
      assert.ok(verifyRead, 'Database read succeeds after failure');
      console.log('  -> PASS: Test B verified successfully with complete atomicity preserved.\n');
    }

    console.log('================================================================');
    console.log('ALL ADMISSION CONFIRMATION TIMEOUT CONCURRENCY TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    try {
      await inspectDb.student.deleteMany({ where: { admission: { schoolId } } });
      await inspectDb.feePaymentDetailAttribution.deleteMany({ where: { feePayment: { schoolId } } });
      await inspectDb.feePaymentInstallmentAllocation.deleteMany({ where: { header: { admission: { schoolId } } } });
      await inspectDb.feePayment.deleteMany({ where: { schoolId } });
      await inspectDb.admissionInstallment.deleteMany({ where: { schedule: { schoolId } } });
      await inspectDb.admissionInstallmentSchedule.deleteMany({ where: { schoolId } });
      await inspectDb.feePaymentDetails.deleteMany({ where: { feePaymentHeader: { admission: { schoolId } } } });
      await inspectDb.feePaymentHeader.deleteMany({ where: { admission: { schoolId } } });
      await inspectDb.admission.deleteMany({ where: { schoolId } });
      await inspectDb.feeComponent.deleteMany({ where: { feeStructure: { academicYear: { schoolId } } } });
      await inspectDb.feeStructure.deleteMany({ where: { academicYear: { schoolId } } });
      await inspectDb.section.deleteMany({ where: { class: { program: { academicYear: { schoolId } } } } });
      await inspectDb.class.deleteMany({ where: { program: { academicYear: { schoolId } } } });
      await inspectDb.program.deleteMany({ where: { academicYear: { schoolId } } });
      await inspectDb.academicYear.deleteMany({ where: { schoolId } });
      await inspectDb.userRole.deleteMany({ where: { user: { schoolId } } });
      await inspectDb.user.deleteMany({ where: { schoolId } });
      await inspectDb.school.deleteMany({ where: { id: schoolId } });
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }
    await db1.$disconnect();
    await db2.$disconnect();
    await inspectDb.$disconnect();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL ERROR in admission confirmation timeout concurrency test]:', err);
    process.exit(1);
  });
