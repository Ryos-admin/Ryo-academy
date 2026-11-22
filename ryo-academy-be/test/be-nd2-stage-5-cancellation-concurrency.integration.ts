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

  const db1 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const db2 = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const inspectDb = new DatabaseService({ getOrThrow: () => databaseUrl } as any);

  await db1.$connect();
  await db2.$connect();
  await inspectDb.$connect();
  await assertQaDatabase(inspectDb);

  console.log('\n================================================================');
  console.log('BE-ND2 STAGE 5: ADMISSION CANCELLATION FINANCIAL SAFETY & CONCURRENCY');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-s5-${runId}`;
  const collegeAdminId = `usr-col-s5-${runId}`;

  try {
    // 1. Setup seed School and Users
  await inspectDb.school.create({
    data: { id: schoolId, name: `Stage 5 School ${runId}`, schoolCode: `S5-${runId}` },
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
      email: `admin-s5-${runId}@ryo.local`,
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

  async function seedTestYearAndStructure(prefix: string) {
    const ayId = `ay-${prefix}-${runId}`;
    await inspectDb.academicYear.create({
      data: {
        id: ayId,
        schoolId,
        name: `AY-${prefix}-${runId}`,
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

  async function seedScheduledAdmission(prefix: string, seq: number) {
    const fixture = await seedTestYearAndStructure(prefix);
    const admissionRepo = new AdmissionRepository(inspectDb);
    const admissionService = new AdmissionService(inspectDb, admissionRepo);

    const adm = await admissionService.create(makeAdmissionDto(fixture, seq));

    const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: adm.id },
      include: { feePaymentDetails: true },
    });

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

    return { fixture, adm, header, schedule };
  }

  async function seedAdmissionWithPayment(prefix: string, amount: string = '1000.00') {
    const { fixture, adm, header, schedule } = await seedScheduledAdmission(prefix, 100);
    const paymentService = new AdmissionPaymentService(inspectDb);

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
  // SCENARIO A1: Cancellation vs Payment Reversal (Cancellation acquires lock first)
  // Cancellation rejects with HTTP 409 CANCELLATION_UNRESOLVED_PAYMENTS.
  // Reversal unblocks and succeeds. Cancellation then succeeds after reversal.
  // ============================================================================
  console.log('[Scenario A1] Cancellation vs Payment Reversal (Cancellation acquires lock first)');
  {
    const setup = await seedAdmissionWithPayment('a1', '1000.00');

    const admissionRepo1 = new AdmissionRepository(db1);
    const admissionService1 = new AdmissionService(db1, admissionRepo1);
    const paymentService2 = new AdmissionPaymentService(db2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after lockAdmission executes in updateStatusById
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origFindUnique = tx.admission.findUnique.bind(tx.admission);
        tx.admission.findUnique = async (...args: any[]) => {
          const res = await origFindUnique(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p1Error: any = null;
    let p2Res: any = null;
    let p2Error: any = null;

    // Tx1: calls production updateStatusById(CANCELLED)
    const p1 = (async () => {
      try {
        await admissionService1.updateStatusById(setup.adm.id, adminActor, 'CANCELLED');
      } catch (err) {
        p1Error = err;
      }
    })();

    // Wait until Tx1 holds Admission row lock
    await tx1LockHeld.promise;

    // Tx2: calls production reverseAdmissionPayment()
    const p2 = (async () => {
      try {
        p2Res = await paymentService2.reverseAdmissionPayment(
          setup.adm.id,
          setup.paymentId,
          {
            idempotencyKey: `rev-a1-${runId}`,
            reason: 'Corrective reversal for cancellation',
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

    // Release Tx1 barrier
    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    // Assert Tx1 failed with HTTP 409 CANCELLATION_UNRESOLVED_PAYMENTS
    assert.ok(p1Error, 'Expected cancellation to reject when unreversed payments exist');
    assert.equal(p1Error.status, 409);
    const errBody = typeof p1Error.getResponse === 'function' ? p1Error.getResponse() : p1Error.response;
    assert.equal(errBody?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');

    // Assert Tx2 succeeded post-rejection of Tx1
    assert.equal(p2Error, null, 'Payment reversal must succeed');
    assert.equal(p2Res?.statusCode, 200, 'Reversal should return 200');

    // Verify Admission remained DRAFT after rejected cancellation
    const midAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
    assert.equal(midAdm?.admissionStatus, AdmissionStatus.DRAFT, 'Admission must remain DRAFT');

    // Now run cancellation again: since payment is reversed, it should succeed!
    const admissionRepoInspect = new AdmissionRepository(inspectDb);
    const admissionServiceInspect = new AdmissionService(inspectDb, admissionRepoInspect);
    const cancelRes = await admissionServiceInspect.updateStatusById(setup.adm.id, adminActor, 'CANCELLED');
    assert.equal(cancelRes.admissionStatus, AdmissionStatus.CANCELLED, 'Cancellation must succeed after reversal');

    // Verify financial records remain preserved
    const finalPayment = await inspectDb.feePayment.findUnique({ where: { id: setup.paymentId } });
    assert.ok(finalPayment, 'FeePayment record must NOT be deleted');
    const reversalEvent = await inspectDb.paymentReversalEvent.findUnique({ where: { feePaymentId: setup.paymentId } });
    assert.ok(reversalEvent, 'PaymentReversalEvent record must be preserved');

    console.log('  -> PASS: Cancellation blocked on unreversed payment with HTTP 409 CANCELLATION_UNRESOLVED_PAYMENTS. Reversal proceeded. Subsequent cancellation succeeded. Records preserved.');
  }

  // ============================================================================
  // SCENARIO A2: Reversal vs Cancellation (Reversal acquires lock first)
  // Reversal completes. Cancellation unblocks, evaluates resolved ledger, succeeds.
  // ============================================================================
  console.log('[Scenario A2] Reversal vs Cancellation (Reversal acquires lock first)');
  {
    const setup = await seedAdmissionWithPayment('a2', '1000.00');

    const paymentService1 = new AdmissionPaymentService(db1);
    const admissionRepo2 = new AdmissionRepository(db2);
    const admissionService2 = new AdmissionService(db2, admissionRepo2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after reversal event is created
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origRevCreate = tx.paymentReversalEvent.create.bind(tx.paymentReversalEvent);
        tx.paymentReversalEvent.create = async (...args: any[]) => {
          const res = await origRevCreate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p1Res: any = null;
    let p1Error: any = null;
    let p2Res: any = null;
    let p2Error: any = null;

    // Tx1: calls actual production paymentService.reverseAdmissionPayment()
    const p1 = (async () => {
      try {
        p1Res = await paymentService1.reverseAdmissionPayment(
          setup.adm.id,
          setup.paymentId,
          {
            idempotencyKey: `rev-a2-${runId}`,
            reason: 'Reversal before cancellation',
          },
          collegeAdminId,
        );
      } catch (err) {
        p1Error = err;
      }
    })();

    await tx1LockHeld.promise;

    // Tx2: calls production admissionService.updateStatusById(CANCELLED)
    const p2 = (async () => {
      try {
        p2Res = await admissionService2.updateStatusById(setup.adm.id, adminActor, 'CANCELLED');
      } catch (err) {
        p2Error = err;
      }
    })();

    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.equal(p1Error, null, 'Reversal must succeed');
    assert.equal(p1Res?.statusCode, 200);

    assert.equal(p2Error, null, 'Cancellation must succeed after reversal completes');
    assert.equal(p2Res?.admissionStatus, AdmissionStatus.CANCELLED);

    const finalAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.CANCELLED);

    const paymentCount = await inspectDb.feePayment.count({ where: { admissionId: setup.adm.id } });
    assert.equal(paymentCount, 1, 'Payment record must be preserved');

    const revCount = await inspectDb.paymentReversalEvent.count({ where: { feePaymentId: setup.paymentId } });
    assert.equal(revCount, 1, 'Reversal record must be preserved');

    console.log('  -> PASS: Reversal won, updated balances to 0. Cancellation unblocked and evaluated resolved ledger, successfully cancelling admission.');
  }

  // ============================================================================
  // SCENARIO B1: Cancellation vs Payment Creation (Cancellation wins)
  // Cancellation succeeds. Payment creation rejects with HTTP 400.
  // ============================================================================
  console.log('[Scenario B1] Cancellation vs Payment Creation (Cancellation wins)');
  {
    const { adm, header } = await seedScheduledAdmission('b1', 200);

    const admissionRepo1 = new AdmissionRepository(db1);
    const admissionService1 = new AdmissionService(db1, admissionRepo1);
    const paymentService2 = new AdmissionPaymentService(db2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after admission is marked CANCELLED
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

    let p1Res: any = null;
    let p1Error: any = null;
    let p2Error: any = null;

    const p1 = (async () => {
      try {
        p1Res = await admissionService1.updateStatusById(adm.id, adminActor, 'CANCELLED');
      } catch (err) {
        p1Error = err;
      }
    })();

    await tx1LockHeld.promise;

    const p2 = (async () => {
      try {
        await paymentService2.createAdmissionPayment(
          adm.id,
          {
            idempotencyKey: `pay-b1-${runId}`,
            amount: '1000.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2027-06-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: header.feePaymentDetails[0].id, amount: '1000.00' }],
          },
          collegeAdminId,
        );
      } catch (err) {
        p2Error = err;
      }
    })();

    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.equal(p1Error, null, 'Cancellation should succeed');
    assert.equal(p1Res?.admissionStatus, AdmissionStatus.CANCELLED);

    assert.ok(p2Error, 'Payment collection must reject for cancelled admission');
    assert.equal(p2Error.status, 400);
    assert.match(p2Error.message || p2Error.response?.message, /cancelled admissions/);

    const paymentCount = await inspectDb.feePayment.count({ where: { admissionId: adm.id } });
    assert.equal(paymentCount, 0, 'No payment should be created for cancelled admission');

    console.log('  -> PASS: Cancellation won. Payment collection blocked on Admission lock, woke post-commit, saw status CANCELLED, and rejected with HTTP 400.');
  }

  // ============================================================================
  // SCENARIO B2: Payment Creation vs Cancellation (Payment Creation wins)
  // Payment creation succeeds. Cancellation unblocks and rejects with HTTP 409.
  // ============================================================================
  console.log('[Scenario B2] Payment Creation vs Cancellation (Payment Creation wins)');
  {
    const { adm, header } = await seedScheduledAdmission('b2', 300);

    const paymentService1 = new AdmissionPaymentService(db1);
    const admissionRepo2 = new AdmissionRepository(db2);
    const admissionService2 = new AdmissionService(db2, admissionRepo2);

    const tx1LockHeld = createBarrier();
    const tx1CommitBarrier = createBarrier();

    // Hook db1.$transaction: pause right after feePayment is created
    const origTx1 = db1.$transaction.bind(db1);
    (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
      return origTx1(async (tx: any) => {
        const origPayCreate = tx.feePayment.create.bind(tx.feePayment);
        tx.feePayment.create = async (...args: any[]) => {
          const res = await origPayCreate(...args);
          tx1LockHeld.resolve();
          await tx1CommitBarrier.promise;
          return res;
        };
        return cb(tx);
      }, ...rest);
    };

    let p1Res: any = null;
    let p1Error: any = null;
    let p2Error: any = null;

    const p1 = (async () => {
      try {
        p1Res = await paymentService1.createAdmissionPayment(
          adm.id,
          {
            idempotencyKey: `pay-b2-${runId}`,
            amount: '1000.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2027-06-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: header.feePaymentDetails[0].id, amount: '1000.00' }],
          },
          collegeAdminId,
        );
      } catch (err) {
        p1Error = err;
      }
    })();

    await tx1LockHeld.promise;

    const p2 = (async () => {
      try {
        await admissionService2.updateStatusById(adm.id, adminActor, 'CANCELLED');
      } catch (err) {
        p2Error = err;
      }
    })();

    const lockWaitMs = await waitForLockContention(inspectDb);
    console.log(`  -> PostgreSQL lock contention confirmed active (${lockWaitMs}ms elapsed). Releasing Tx1 commit...`);

    tx1CommitBarrier.resolve();

    await Promise.all([p1, p2]);

    assert.equal(p1Error, null, 'Payment creation should succeed');
    assert.ok(p1Res?.statusCode === 201 || p1Res?.statusCode === 200, 'Payment creation should return 201 or 200');

    assert.ok(p2Error, 'Cancellation must reject when unreversed payments exist');
    assert.equal(p2Error.status, 409);
    const errBody = typeof p2Error.getResponse === 'function' ? p2Error.getResponse() : p2Error.response;
    assert.equal(errBody?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');

    const finalAdm = await inspectDb.admission.findUnique({ where: { id: adm.id } });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.DRAFT, 'Admission must remain DRAFT');

    const paymentCount = await inspectDb.feePayment.count({ where: { admissionId: adm.id } });
    assert.equal(paymentCount, 1, 'Payment must remain recorded');

    console.log('  -> PASS: Payment creation won. Cancellation blocked on Admission lock, woke post-commit, saw unreversed payment, and rejected with HTTP 409 CANCELLATION_UNRESOLVED_PAYMENTS.');
  }

  // ============================================================================
  // SCENARIO C: Fully Reversed Historical Payment
  // DRAFT admission with 1 payment and 1 reversal, balances = 0, allocations reversed.
  // Cancellation succeeds. All historical records remain intact.
  // ============================================================================
  console.log('[Scenario C] Fully Reversed Historical Payment Cancellation');
  {
    const setup = await seedAdmissionWithPayment('sc-c', '1000.00');
    const paymentService = new AdmissionPaymentService(inspectDb);
    const admissionRepo = new AdmissionRepository(inspectDb);
    const admissionService = new AdmissionService(inspectDb, admissionRepo);

    // Perform reversal
    const revRes = await paymentService.reverseAdmissionPayment(
      setup.adm.id,
      setup.paymentId,
      {
        idempotencyKey: `rev-c-${runId}`,
        reason: 'Customer cancelled prior to enrollment',
      },
      collegeAdminId,
    );
    assert.equal(revRes.statusCode, 200);

    // Call production cancellation
    const cancelRes = await admissionService.updateStatusById(setup.adm.id, adminActor, 'CANCELLED');
    assert.equal(cancelRes.admissionStatus, AdmissionStatus.CANCELLED);

    const finalAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
    assert.equal(finalAdm?.admissionStatus, AdmissionStatus.CANCELLED);

    // Historical records verification
    const feePayment = await inspectDb.feePayment.findUnique({ where: { id: setup.paymentId } });
    assert.ok(feePayment, 'FeePayment must remain in DB');
    const revEvent = await inspectDb.paymentReversalEvent.findUnique({ where: { feePaymentId: setup.paymentId } });
    assert.ok(revEvent, 'PaymentReversalEvent must remain in DB');
    const allocations = await inspectDb.feePaymentInstallmentAllocation.findMany({ where: { feePaymentId: setup.paymentId } });
    assert.ok(allocations.length > 0, 'Allocations must remain in DB');
    for (const a of allocations) {
      assert.equal(a.allocatedAmount.toString(), a.reversedAmount.toString(), 'Allocation must be fully reversed');
    }

    console.log('  -> PASS: Fully reversed admission successfully cancelled. All historical payment, reversal, and allocation records remain intact.');
  }

  // ============================================================================
  // SCENARIO D: Inconsistent Financial State Rejections
  // D1: Non-zero header balance
  // D2: Non-zero detail balance
  // D3: Missing reversal event
  // D4: Partially reversed allocation
  // ============================================================================
  console.log('[Scenario D] Inconsistent Financial State Rejections');
  {
    const admissionRepo = new AdmissionRepository(inspectDb);
    const admissionService = new AdmissionService(inspectDb, admissionRepo);

    // D1: Non-zero header totalPaidAmount
    console.log('  [D1] Non-zero header totalPaidAmount');
    {
      const fixture = await seedTestYearAndStructure('d1');
      const adm = await admissionService.create(makeAdmissionDto(fixture, 401));
      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({ where: { admissionId: adm.id } });
      await inspectDb.feePaymentHeader.update({
        where: { id: header.id },
        data: { totalPaidAmount: new Prisma.Decimal('500.00') },
      });

      await assert.rejects(
        admissionService.updateStatusById(adm.id, adminActor, 'CANCELLED'),
        (err: any) => {
          assert.equal(err.status, 409);
          const body = typeof err.getResponse === 'function' ? err.getResponse() : err.response;
          assert.equal(body?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');
          return true;
        },
      );
      const postAdm = await inspectDb.admission.findUnique({ where: { id: adm.id } });
      assert.equal(postAdm?.admissionStatus, AdmissionStatus.DRAFT);
    }

    // D2: Non-zero detail amountPaid
    console.log('  [D2] Non-zero detail amountPaid');
    {
      const fixture = await seedTestYearAndStructure('d2');
      const adm = await admissionService.create(makeAdmissionDto(fixture, 402));
      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: adm.id },
        include: { feePaymentDetails: true },
      });
      await inspectDb.feePaymentDetails.update({
        where: { id: header.feePaymentDetails[0].id },
        data: { amountPaid: new Prisma.Decimal('250.00') },
      });

      await assert.rejects(
        admissionService.updateStatusById(adm.id, adminActor, 'CANCELLED'),
        (err: any) => {
          assert.equal(err.status, 409);
          const body = typeof err.getResponse === 'function' ? err.getResponse() : err.response;
          assert.equal(body?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');
          return true;
        },
      );
      const postAdm = await inspectDb.admission.findUnique({ where: { id: adm.id } });
      assert.equal(postAdm?.admissionStatus, AdmissionStatus.DRAFT);
    }

    // D3: Missing reversal event
    console.log('  [D3] Missing reversal event');
    {
      const setup = await seedAdmissionWithPayment('d3', '1000.00');
      // setup.paymentId is unreversed!
      await assert.rejects(
        admissionService.updateStatusById(setup.adm.id, adminActor, 'CANCELLED'),
        (err: any) => {
          assert.equal(err.status, 409);
          const body = typeof err.getResponse === 'function' ? err.getResponse() : err.response;
          assert.equal(body?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');
          return true;
        },
      );
      const postAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
      assert.equal(postAdm?.admissionStatus, AdmissionStatus.DRAFT);
    }

    // D4: Partially reversed installment allocation
    console.log('  [D4] Partially reversed installment allocation');
    {
      const setup = await seedAdmissionWithPayment('d4', '1000.00');
      const paymentService = new AdmissionPaymentService(inspectDb);
      // Reverse payment
      await paymentService.reverseAdmissionPayment(
        setup.adm.id,
        setup.paymentId,
        { idempotencyKey: `rev-d4-${runId}`, reason: 'Reversal' },
        collegeAdminId,
      );
      // Tamper an allocation to simulate partial reversal corruption
      const alloc = await inspectDb.feePaymentInstallmentAllocation.findFirstOrThrow({
        where: { feePaymentId: setup.paymentId },
      });
      await inspectDb.feePaymentInstallmentAllocation.update({
        where: { id: alloc.id },
        data: { reversedAmount: new Prisma.Decimal('500.00') }, // allocated was 1000.00
      });

      await assert.rejects(
        admissionService.updateStatusById(setup.adm.id, adminActor, 'CANCELLED'),
        (err: any) => {
          assert.equal(err.status, 409);
          const body = typeof err.getResponse === 'function' ? err.getResponse() : err.response;
          assert.equal(body?.code, 'CANCELLATION_UNRESOLVED_PAYMENTS');
          return true;
        },
      );
      const postAdm = await inspectDb.admission.findUnique({ where: { id: setup.adm.id } });
      assert.equal(postAdm?.admissionStatus, AdmissionStatus.DRAFT);
    }

    console.log('  -> PASS: All inconsistent financial state scenarios (D1-D4) successfully rejected cancellation with HTTP 409 CANCELLATION_UNRESOLVED_PAYMENTS without altering state.');
  }

  // ============================================================================
  // SCENARIO E: Student Lifecycle Defensive Deactivation on Cancellation
  // ============================================================================
  console.log('[Scenario E] Student Lifecycle Defensive Deactivation on Cancellation');
  {
    const admissionRepo = new AdmissionRepository(inspectDb);
    const admissionService = new AdmissionService(inspectDb, admissionRepo);

    // E1: DRAFT Admission with an active linked Student is deactivated defensively on cancellation
    console.log('  [E1] DRAFT admission with an active linked Student is deactivated defensively on cancellation');
    {
      const fixture = await seedTestYearAndStructure('e1');
      const adm = await admissionService.create(makeAdmissionDto(fixture, 501));

      // Pre-link an active Student to this DRAFT admission
      const stu = await inspectDb.student.create({
        data: {
          admissionId: adm.id,
          studentName: adm.studentName,
          studentNumber: adm.admissionNumber,
          gender: adm.gender,
          dateOfBirth: adm.dateOfBirth,
          isActive: true,
        },
      });
      await inspectDb.admission.update({
        where: { id: adm.id },
        data: { studentId: stu.id },
      });

      // Cancel through production AdmissionService.updateStatusById
      const cancelled = await admissionService.updateStatusById(adm.id, adminActor, 'CANCELLED');
      assert.equal(cancelled.admissionStatus, AdmissionStatus.CANCELLED);

      // Verify student state in DB
      const studentAfter = await inspectDb.student.findUnique({ where: { id: stu.id } });
      assert.ok(studentAfter, 'Student record must still exist');
      assert.equal(studentAfter.isActive, false, 'Student isActive must be false after cancellation');
      assert.equal(studentAfter.deletedAt, null, 'Student deletedAt must remain null (not soft-deleted)');

      // Verify financial records remain unchanged
      const headers = await inspectDb.feePaymentHeader.findMany({ where: { admissionId: adm.id } });
      assert.equal(headers.length, 1);
      assert.equal(headers[0].isActive, true);
    }

    // E2: DRAFT Admission without a Student cancels cleanly
    console.log('  [E2] DRAFT admission without a Student cancels cleanly');
    {
      const fixtureE2 = await seedTestYearAndStructure('e2');
      const admE2 = await admissionService.create(makeAdmissionDto(fixtureE2, 502));
      const cancelledE2 = await admissionService.updateStatusById(admE2.id, adminActor, 'CANCELLED');
      assert.equal(cancelledE2.admissionStatus, AdmissionStatus.CANCELLED);

      // Verify zero students exist for this admission
      const stuCount = await inspectDb.student.count({ where: { admissionId: admE2.id } });
      assert.equal(stuCount, 0);
    }

    // E3: CONFIRMED admission cancellation remains rejected without modifying Student state
    console.log('  [E3] CONFIRMED admission cancellation remains rejected without modifying Student state');
    {
      const setupE3 = await seedAdmissionWithPayment('e3', '1000.00');
      // Confirm the admission
      await admissionService.confirmAdmission(setupE3.adm.id, adminActor);
      const confirmedAdm = await inspectDb.admission.findUniqueOrThrow({
        where: { id: setupE3.adm.id },
        include: { student: true },
      });
      assert.equal(confirmedAdm.admissionStatus, AdmissionStatus.CONFIRMED);
      assert.ok(confirmedAdm.student, 'Confirmed student must exist');
      assert.equal(confirmedAdm.student.isActive, true);

      await assert.rejects(
        admissionService.updateStatusById(setupE3.adm.id, adminActor, 'CANCELLED'),
        (err: any) => {
          assert.equal(err.status, 409);
          const body = typeof err.getResponse === 'function' ? err.getResponse() : err.response;
          assert.equal(body?.message, 'Confirmed admissions cannot be cancelled.');
          return true;
        },
      );

      // Verify Student state is untouched
      const studentE3After = await inspectDb.student.findUniqueOrThrow({ where: { id: confirmedAdm.student.id } });
      assert.equal(studentE3After.isActive, true, 'Confirmed student must remain active when cancellation is rejected');
      assert.equal(studentE3After.deletedAt, null);
    }

    console.log('  -> PASS: All student lifecycle defensive deactivation scenarios (E1-E3) verified.');
  }

  console.log('\n================================================================');
  console.log('ALL BE-ND2 STAGE 5 CANCELLATION CONCURRENCY SCENARIOS PASSED 100%!');
  console.log('================================================================\n');
} finally {
    try {
      await inspectDb.student.deleteMany({ where: { admission: { schoolId } } });
      await inspectDb.installmentAllocationReversalEvent.deleteMany({ where: { paymentReversalEvent: { schoolId } } });
      await inspectDb.paymentReversalEvent.deleteMany({ where: { schoolId } });
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
    console.error('STAGE 5 CANCELLATION CONCURRENCY SUITE FAILED:', err);
    process.exit(1);
  });
