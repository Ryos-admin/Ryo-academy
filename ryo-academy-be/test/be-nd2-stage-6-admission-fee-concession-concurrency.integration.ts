import assert from 'node:assert/strict';
import util from 'node:util';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionConcessionService } from '../src/admission/fee-concession/admission-concession.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import {
  AdmissionStatus,
  CalculationMode,
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
  console.log('BE-ND2 STAGE 6: ADMISSION FEE & CONCESSION PRODUCTION CONCURRENCY');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-s6-${runId}`;
  const collegeAdminId = `usr-col-s6-${runId}`;

  try {
    // 1. Setup seed School and Admin User
    await inspectDb.school.create({
      data: { id: schoolId, name: `Stage 6 School ${runId}`, schoolCode: `S6-${runId}` },
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
        email: `admin-s6-${runId}@ryo.local`,
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

    async function seedAdmissionFixture(
      prefix: string,
      options: { hasOptional?: boolean; pricingVersion?: string; existingConcession?: boolean } = {},
    ) {
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

      const isLegacy = options.pricingVersion === 'LEGACY';
      const fs = await inspectDb.feeStructure.create({
        data: {
          id: `fs-${prefix}-${runId}`,
          name: `Fee Plan ${prefix} ${runId}`,
          academicYearId: ayId,
          programId: program.id,
          classId: cls.id,
          totalAmount: options.hasOptional ? 15000 : 10000,
          gstPercentage: isLegacy ? new Prisma.Decimal('0.00') : new Prisma.Decimal('18.00'),
          isActive: true,
        },
      });

      const fcMandatory = await inspectDb.feeComponent.create({
        data: {
          id: `fc-man-${prefix}-${runId}`,
          name: `Tuition ${prefix} ${runId}`,
          feeStructureId: fs.id,
          amount: 10000,
          discountApplicable: true,
          isMandatory: true,
          isActive: true,
        },
      });

      let fcOptional: any = null;
      if (options.hasOptional) {
        fcOptional = await inspectDb.feeComponent.create({
          data: {
            id: `fc-opt-${prefix}-${runId}`,
            name: `Activity ${prefix} ${runId}`,
            feeStructureId: fs.id,
            amount: 5000,
            discountApplicable: false,
            isMandatory: false,
            isActive: true,
          },
        });
      }

      const admissionRepo = new AdmissionRepository(inspectDb);
      const admissionService = new AdmissionService(inspectDb, admissionRepo);

      const selectedIds = [fcMandatory.id];
      const components = [{ feeComponentId: fcMandatory.id, discountPercentage: '0.00' }];
      if (options.hasOptional && fcOptional) {
        selectedIds.push(fcOptional.id);
        components.push({ feeComponentId: fcOptional.id, discountPercentage: '0.00' });
      }

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
          selectedFeeComponentIds: selectedIds,
          components,
        },
      );

      if (options.pricingVersion === 'LEGACY') {
        await inspectDb.feePaymentHeader.updateMany({
          where: { admissionId: admission.id },
          data: { pricingVersion: 'LEGACY' as any },
        });
      }

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: admission.id },
        include: { feePaymentDetails: true },
      });

      const detailMandatory = header.feePaymentDetails.find((d) => d.feeComponentId === fcMandatory.id)!;
      const detailOptional = fcOptional
        ? header.feePaymentDetails.find((d) => d.feeComponentId === fcOptional.id)
        : null;

      let concession: any = null;
      if (options.existingConcession) {
        // Seed an existing concession of 2000 discount
        concession = await inspectDb.admissionFeeConcession.create({
          data: {
            schoolId,
            admissionId: admission.id,
            feePaymentDetailsId: detailMandatory.id,
            calculatedDiscountAmount: new Prisma.Decimal('2000.00'),
            calculationMode: CalculationMode.PAYABLE,
            requiresReview: false,
            appliedById: collegeAdminId,
          },
        });

        // Update detail and header to match
        const isLegacy = options.pricingVersion === 'LEGACY';
        if (isLegacy) {
          await inspectDb.feePaymentDetails.update({
            where: { id: detailMandatory.id },
            data: {
              discountAmount: new Prisma.Decimal('2000.00'),
              finalAmount: new Prisma.Decimal('8000.00'),
              totalAmountToBePaid: new Prisma.Decimal('8000.00'),
            },
          });
          await inspectDb.feePaymentHeader.update({
            where: { id: header.id },
            data: {
              discountAmount: new Prisma.Decimal('2000.00'),
              netAmount: new Prisma.Decimal('8000.00'),
              totalFeeAmount: new Prisma.Decimal('8000.00'),
              totalDueAmount: new Prisma.Decimal('8000.00'),
            },
          });
        } else {
          // V0: taxable = 8000, gst = 1440, net = 9440
          await inspectDb.feePaymentDetails.update({
            where: { id: detailMandatory.id },
            data: {
              discountAmount: new Prisma.Decimal('2000.00'),
              discountPercentage: new Prisma.Decimal('20.00'),
              taxableAmount: new Prisma.Decimal('8000.00'),
              gstAmount: new Prisma.Decimal('1440.00'),
              finalAmount: new Prisma.Decimal('9440.00'),
              totalAmountToBePaid: new Prisma.Decimal('9440.00'),
            },
          });
          await inspectDb.feePaymentHeader.update({
            where: { id: header.id },
            data: {
              discountAmount: new Prisma.Decimal('2000.00'),
              taxableAmount: new Prisma.Decimal('8000.00'),
              gstAmount: new Prisma.Decimal('1440.00'),
              netAmount: new Prisma.Decimal('9440.00'),
              totalFeeAmount: new Prisma.Decimal('9440.00'),
              totalDueAmount: new Prisma.Decimal('9440.00'),
            },
          });
        }
      }

      return {
        admission,
        header,
        detailMandatory,
        detailOptional,
        concession,
        fs,
        fcMandatory,
        fcOptional,
      };
    }

    // ============================================================================
    // SCENARIO A: Concession Assignment vs Payment Creation
    // ============================================================================

    // A1: Concession assignment acquires lock first, commits. Payment unblocks and succeeds.
    console.log('[Scenario A1] assignConcession wins first vs createAdmissionPayment');
    {
      const fixture = await seedAdmissionFixture('a1', { pricingVersion: 'LEGACY' });
      const concessionService1 = new AdmissionConcessionService(db1);
      const paymentService2 = new AdmissionPaymentService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

      const origTx1 = db1.$transaction.bind(db1);
      (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
        return origTx1(async (tx: any) => {
          const origHeaderUpdate = tx.feePaymentHeader.update.bind(tx.feePaymentHeader);
          tx.feePaymentHeader.update = async (...args: any[]) => {
            const res = await origHeaderUpdate(...args);
            tx1LockHeld.resolve();
            await tx1CommitBarrier.promise;
            return res;
          };
          return cb(tx);
        }, ...rest);
      };

      // Tx1: assign concession (payable 8000 -> discount 2000)
      const p1 = concessionService1.assignConcession(
        fixture.admission.id,
        {
          feePaymentDetailsId: fixture.detailMandatory.id,
          payableAmount: '8000.00',
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: create payment of 1000
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await paymentService2.createAdmissionPayment(
            fixture.admission.id,
            {
              idempotencyKey: `pay-a1-${runId}`,
              amount: '1000.00',
              paymentMethod: PaymentMethod.CASH,
              paymentDate: '2027-06-05T10:00:00.000Z',
              allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.equal(p2Err, null, 'Payment should succeed after concession commit');
      assert.ok(p2Res, 'Payment response returned');

      // Verify DB state
      const conc = await inspectDb.admissionFeeConcession.findFirst({
        where: { admissionId: fixture.admission.id },
      });
      assert.ok(conc, 'Concession must be persisted');
      assert.equal(conc.calculatedDiscountAmount.toString(), '2000');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '10000');
      assert.equal(header.discountAmount.toString(), '2000');
      assert.equal(header.netAmount.toString(), '8000');
      assert.equal(header.totalPaidAmount.toString(), '1000');
      assert.equal(header.totalDueAmount.toString(), '7000');

      console.log('  -> PASS: Scenario A1 passed.\n');
    }

    // A2: Payment creation acquires lock first, commits. Concession unblocks and rejects with ConflictException.
    console.log('[Scenario A2] createAdmissionPayment wins first vs assignConcession');
    {
      const fixture = await seedAdmissionFixture('a2', { pricingVersion: 'LEGACY' });
      const paymentService1 = new AdmissionPaymentService(db1);
      const concessionService2 = new AdmissionConcessionService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

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

      // Tx1: create payment
      const p1 = paymentService1.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-a2-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: assign concession
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await concessionService2.assignConcession(
            fixture.admission.id,
            {
              feePaymentDetailsId: fixture.detailMandatory.id,
              payableAmount: '8000.00',
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.ok(p2Err, 'assignConcession must be rejected when payment exists');
      assert.equal(p2Err.status, 409);
      assert.match(p2Err.message || p2Err.response?.message, /Fee configuration cannot be changed after financial activity/);

      // Verify DB: payment persisted, concession NOT created
      const concCount = await inspectDb.admissionFeeConcession.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(concCount, 0, 'No concession should be created');

      const payCount = await inspectDb.feePayment.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(payCount, 1, 'Payment should remain persisted');

      console.log('  -> PASS: Scenario A2 passed.\n');
    }

    // ============================================================================
    // SCENARIO B: Concession Update vs Payment Creation
    // ============================================================================

    // B1: Concession update wins first, commits. Payment creation unblocks and succeeds.
    console.log('[Scenario B1] updateConcession wins first vs createAdmissionPayment');
    {
      const fixture = await seedAdmissionFixture('b1', { pricingVersion: 'LEGACY', existingConcession: true });
      const concessionService1 = new AdmissionConcessionService(db1);
      const paymentService2 = new AdmissionPaymentService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

      const origTx1 = db1.$transaction.bind(db1);
      (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
        return origTx1(async (tx: any) => {
          const origHeaderUpdate = tx.feePaymentHeader.update.bind(tx.feePaymentHeader);
          tx.feePaymentHeader.update = async (...args: any[]) => {
            const res = await origHeaderUpdate(...args);
            tx1LockHeld.resolve();
            await tx1CommitBarrier.promise;
            return res;
          };
          return cb(tx);
        }, ...rest);
      };

      // Tx1: update concession from discount 2000 to discount 4000 (payable 6000)
      const p1 = concessionService1.updateConcession(
        fixture.admission.id,
        fixture.concession.id,
        {
          payableAmount: '6000.00',
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: create payment of 1000
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await paymentService2.createAdmissionPayment(
            fixture.admission.id,
            {
              idempotencyKey: `pay-b1-${runId}`,
              amount: '1000.00',
              paymentMethod: PaymentMethod.CASH,
              paymentDate: '2027-06-05T10:00:00.000Z',
              allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.equal(p2Err, null, 'Payment must succeed after concession update commit');

      // Verify DB: revision exists, concession updated, payment recorded
      const revCount = await inspectDb.admissionFeeConcessionRevision.count({
        where: { sourceConcessionId: fixture.concession.id },
      });
      assert.equal(revCount, 1, 'One revision must be persisted');

      const conc = await inspectDb.admissionFeeConcession.findUniqueOrThrow({
        where: { id: fixture.concession.id },
      });
      assert.equal(conc.calculatedDiscountAmount.toString(), '4000');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.discountAmount.toString(), '4000');
      assert.equal(header.netAmount.toString(), '6000');
      assert.equal(header.totalPaidAmount.toString(), '1000');
      assert.equal(header.totalDueAmount.toString(), '5000');

      console.log('  -> PASS: Scenario B1 passed.\n');
    }

    // B2: Payment creation wins first, commits. Concession update unblocks and rejects with ConflictException.
    console.log('[Scenario B2] createAdmissionPayment wins first vs updateConcession');
    {
      const fixture = await seedAdmissionFixture('b2', { pricingVersion: 'LEGACY', existingConcession: true });
      const paymentService1 = new AdmissionPaymentService(db1);
      const concessionService2 = new AdmissionConcessionService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

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

      // Tx1: create payment
      const p1 = paymentService1.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-b2-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: update concession
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          await concessionService2.updateConcession(
            fixture.admission.id,
            fixture.concession.id,
            {
              payableAmount: '6000.00',
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.ok(p2Err, 'updateConcession must be rejected when payment exists');
      assert.equal(p2Err.status, 409);
      assert.match(p2Err.message || p2Err.response?.message, /Fee configuration cannot be changed after financial activity/);

      // Verify DB: payment exists, concession remains at 2000, no revisions created
      const revCount = await inspectDb.admissionFeeConcessionRevision.count({
        where: { sourceConcessionId: fixture.concession.id },
      });
      assert.equal(revCount, 0, 'No revisions should be created');

      const conc = await inspectDb.admissionFeeConcession.findUniqueOrThrow({
        where: { id: fixture.concession.id },
      });
      assert.equal(conc.calculatedDiscountAmount.toString(), '2000');

      console.log('  -> PASS: Scenario B2 passed.\n');
    }

    // ============================================================================
    // SCENARIO C: Concession Removal vs Payment Creation
    // ============================================================================

    // C1: Concession removal wins first, commits. Payment unblocks and succeeds against baseline.
    console.log('[Scenario C1] removeConcession wins first vs createAdmissionPayment');
    {
      const fixture = await seedAdmissionFixture('c1', { pricingVersion: 'LEGACY', existingConcession: true });
      const concessionService1 = new AdmissionConcessionService(db1);
      const paymentService2 = new AdmissionPaymentService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

      const origTx1 = db1.$transaction.bind(db1);
      (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
        return origTx1(async (tx: any) => {
          const origHeaderUpdate = tx.feePaymentHeader.update.bind(tx.feePaymentHeader);
          tx.feePaymentHeader.update = async (...args: any[]) => {
            const res = await origHeaderUpdate(...args);
            tx1LockHeld.resolve();
            await tx1CommitBarrier.promise;
            return res;
          };
          return cb(tx);
        }, ...rest);
      };

      // Tx1: remove concession
      const p1 = concessionService1.removeConcession(
        fixture.admission.id,
        fixture.concession.id,
      );

      await tx1LockHeld.promise;

      // Tx2: create payment of 1000
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await paymentService2.createAdmissionPayment(
            fixture.admission.id,
            {
              idempotencyKey: `pay-c1-${runId}`,
              amount: '1000.00',
              paymentMethod: PaymentMethod.CASH,
              paymentDate: '2027-06-05T10:00:00.000Z',
              allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.equal(p2Err, null, 'Payment should succeed after concession removal');

      // Verify DB: concession deleted, net restored to 10000, paid = 1000, due = 9000
      const concCount = await inspectDb.admissionFeeConcession.count({
        where: { id: fixture.concession.id },
      });
      assert.equal(concCount, 0, 'Concession must be deleted');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '10000');
      assert.equal(header.discountAmount.toString(), '0');
      assert.equal(header.netAmount.toString(), '10000');
      assert.equal(header.totalPaidAmount.toString(), '1000');
      assert.equal(header.totalDueAmount.toString(), '9000');

      console.log('  -> PASS: Scenario C1 passed.\n');
    }

    // C2: Payment creation wins first, commits. Concession removal unblocks and rejects with ConflictException.
    console.log('[Scenario C2] createAdmissionPayment wins first vs removeConcession');
    {
      const fixture = await seedAdmissionFixture('c2', { pricingVersion: 'LEGACY', existingConcession: true });
      const paymentService1 = new AdmissionPaymentService(db1);
      const concessionService2 = new AdmissionConcessionService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

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

      // Tx1: create payment
      const p1 = paymentService1.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-c2-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: remove concession
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          await concessionService2.removeConcession(
            fixture.admission.id,
            fixture.concession.id,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.ok(p2Err, 'removeConcession must be rejected when payment exists');
      assert.equal(p2Err.status, 409);
      assert.match(p2Err.message || p2Err.response?.message, /Fee configuration cannot be changed after financial activity/);

      // Verify DB: concession remains present
      const concCount = await inspectDb.admissionFeeConcession.count({
        where: { id: fixture.concession.id },
      });
      assert.equal(concCount, 1, 'Concession must NOT be deleted');

      console.log('  -> PASS: Scenario C2 passed.\n');
    }

    // ============================================================================
    // SCENARIO D: Fee Component Configuration Update vs Payment Creation
    // ============================================================================

    // D1: Fee configuration update wins first, commits (deselected optional component). Payment unblocks and succeeds.
    console.log('[Scenario D1] updateFeeConfiguration wins first vs createAdmissionPayment');
    {
      const fixture = await seedAdmissionFixture('d1', { hasOptional: true, pricingVersion: 'LEGACY' });
      const admissionRepo1 = new AdmissionRepository(db1);
      const admissionService1 = new AdmissionService(db1, admissionRepo1);
      const paymentService2 = new AdmissionPaymentService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

      const origTx1 = db1.$transaction.bind(db1);
      (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
        return origTx1(async (tx: any) => {
          const origHeaderUpdate = tx.feePaymentHeader.update.bind(tx.feePaymentHeader);
          tx.feePaymentHeader.update = async (...args: any[]) => {
            const res = await origHeaderUpdate(...args);
            tx1LockHeld.resolve();
            await tx1CommitBarrier.promise;
            return res;
          };
          return cb(tx);
        }, ...rest);
      };

      // Tx1: deselect optional component
      const p1 = admissionService1.updateFeeConfiguration(
        fixture.admission.id,
        {
          selectedFeeComponentIds: [fixture.detailMandatory.id],
        },
      );

      await tx1LockHeld.promise;

      // Tx2: payment against mandatory component
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await paymentService2.createAdmissionPayment(
            fixture.admission.id,
            {
              idempotencyKey: `pay-d1-${runId}`,
              amount: '1000.00',
              paymentMethod: PaymentMethod.CASH,
              paymentDate: '2027-06-05T10:00:00.000Z',
              allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.equal(p2Err, null, 'Payment should succeed after fee configuration update');

      // Verify DB: optional component is excluded, net = 10000, paid = 1000, due = 9000
      const optDetail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
        where: { id: fixture.detailOptional!.id },
      });
      assert.equal(optDetail.isIncluded, false, 'Optional component must be excluded');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '10000');
      assert.equal(header.netAmount.toString(), '10000');
      assert.equal(header.totalPaidAmount.toString(), '1000');
      assert.equal(header.totalDueAmount.toString(), '9000');

      console.log('  -> PASS: Scenario D1 passed.\n');
    }

    // D2: Payment creation wins first, commits. Fee configuration update unblocks and rejects with ConflictException.
    console.log('[Scenario D2] createAdmissionPayment wins first vs updateFeeConfiguration');
    {
      const fixture = await seedAdmissionFixture('d2', { hasOptional: true, pricingVersion: 'LEGACY' });
      const paymentService1 = new AdmissionPaymentService(db1);
      const admissionRepo2 = new AdmissionRepository(db2);
      const admissionService2 = new AdmissionService(db2, admissionRepo2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

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

      // Tx1: create payment
      const p1 = paymentService1.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-d2-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: update fee configuration
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          await admissionService2.updateFeeConfiguration(
            fixture.admission.id,
            {
              selectedFeeComponentIds: [fixture.detailMandatory.id],
            },
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      assert.ok(p2Err, 'updateFeeConfiguration must reject after payment activity');
      assert.equal(p2Err.status, 409);
      assert.match(p2Err.message || p2Err.response?.message, /Fee configuration cannot be changed after financial activity/);

      // Verify DB: optional component remains included
      const optDetail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
        where: { id: fixture.detailOptional!.id },
      });
      assert.equal(optDetail.isIncluded, true, 'Optional component must remain included');

      console.log('  -> PASS: Scenario D2 passed.\n');
    }

    // ============================================================================
    // SCENARIO E: Concession Mutation vs Payment Reversal
    // ============================================================================

    // E1: Payment reversal wins first, commits. Concession mutation unblocks and rejects because reversal history permanently locks configuration.
    console.log('[Scenario E1] reverseAdmissionPayment wins first vs assignConcession (Reversal history permanent freeze)');
    {
      const fixture = await seedAdmissionFixture('e1', { pricingVersion: 'LEGACY' });
      const paymentServiceDirect = new AdmissionPaymentService(inspectDb);

      // Create initial payment
      const payRes = await paymentServiceDirect.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-e1-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      const paymentService1 = new AdmissionPaymentService(db1);
      const concessionService2 = new AdmissionConcessionService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

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

      // Tx1: reverse the payment
      const p1 = paymentService1.reverseAdmissionPayment(
        fixture.admission.id,
        payRes.id,
        {
          idempotencyKey: `rev-e1-${runId}`,
          reason: 'Corrective reversal for race audit',
        },
        collegeAdminId,
      );

      await tx1LockHeld.promise;

      // Tx2: attempt concession assignment
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          await concessionService2.assignConcession(
            fixture.admission.id,
            {
              feePaymentDetailsId: fixture.detailMandatory.id,
              payableAmount: '8000.00',
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      // Reversal succeeded
      const rev = await inspectDb.paymentReversalEvent.findFirst({
        where: { feePaymentId: payRes.id },
      });
      assert.ok(rev, 'Reversal event must be recorded');

      // Concession mutation must be rejected even though totalPaidAmount is now 0!
      assert.ok(p2Err, 'assignConcession must reject on reversed history');
      assert.equal(p2Err.status, 409);
      assert.match(p2Err.message || p2Err.response?.message, /Fee configuration cannot be changed after financial activity/);

      // Verify DB: totalPaidAmount = 0, but no concession exists
      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.totalPaidAmount.toString(), '0');
      assert.equal(header.totalDueAmount.toString(), header.netAmount.toString());

      const concCount = await inspectDb.admissionFeeConcession.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(concCount, 0, 'No concession should be created on reversed history');

      console.log('  -> PASS: Scenario E1 passed (Permanent freeze verified).\n');
    }

    // E2: Concession mutation attempts lock first when payment exists.
    // Concession mutation immediately fails activityGuard and rolls back. Reversal proceeds and succeeds.
    console.log('[Scenario E2] assignConcession attempts lock first on unreversed payment vs reverseAdmissionPayment');
    {
      const fixture = await seedAdmissionFixture('e2', { pricingVersion: 'LEGACY' });
      const paymentServiceDirect = new AdmissionPaymentService(inspectDb);

      // Create initial payment
      const payRes = await paymentServiceDirect.createAdmissionPayment(
        fixture.admission.id,
        {
          idempotencyKey: `pay-e2-${runId}`,
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-06-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: fixture.detailMandatory.id, amount: '1000.00' }],
        },
        collegeAdminId,
      );

      const concessionService1 = new AdmissionConcessionService(db1);
      const paymentService2 = new AdmissionPaymentService(db2);

      const tx1LockHeld = createBarrier();
      const tx1CommitBarrier = createBarrier();

      const origTx1 = db1.$transaction.bind(db1);
      (db1 as any).$transaction = async (cb: any, ...rest: any[]) => {
        return origTx1(async (tx: any) => {
          // Pause after finding admission
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

      // Tx1: calls assignConcession (holds lock)
      let p1Err: any = null;
      const p1 = (async () => {
        try {
          await concessionService1.assignConcession(
            fixture.admission.id,
            {
              feePaymentDetailsId: fixture.detailMandatory.id,
              payableAmount: '8000.00',
            },
            collegeAdminId,
          );
        } catch (err) {
          p1Err = err;
        }
      })();

      await tx1LockHeld.promise;

      // Tx2: reverseAdmissionPayment
      let p2Res: any = null;
      let p2Err: any = null;
      const p2 = (async () => {
        try {
          p2Res = await paymentService2.reverseAdmissionPayment(
            fixture.admission.id,
            payRes.id,
            {
              idempotencyKey: `rev-e2-${runId}`,
              reason: 'Reversal race check',
            },
            collegeAdminId,
          );
        } catch (err) {
          p2Err = err;
        }
      })();

      const waitMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active (${waitMs}ms elapsed). Releasing Tx1...`);
      tx1CommitBarrier.resolve();

      await Promise.all([p1, p2]);
      (db1 as any).$transaction = origTx1;

      // Tx1 must fail because payment exists
      assert.ok(p1Err, 'assignConcession must fail due to unreversed payment');
      assert.equal(p1Err.status, 409);

      // Tx2 must succeed
      assert.equal(p2Err, null, 'reverseAdmissionPayment should unblock and succeed');
      assert.ok(p2Res, 'Reversal result returned');

      const rev = await inspectDb.paymentReversalEvent.findFirst({
        where: { feePaymentId: payRes.id },
      });
      assert.ok(rev, 'Reversal event must be recorded');

      console.log('  -> PASS: Scenario E2 passed.\n');
    }

    console.log('================================================================');
    console.log('ALL BE-ND2 STAGE 6 CONCURRENCY SCENARIOS (A1-E2) PASSED 100%!');
    console.log('================================================================\n');
  } finally {
    await db1.$disconnect();
    await db2.$disconnect();
    await inspectDb.$disconnect();
  }
}

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('STAGE 6 CONCURRENCY SUITE FAILED:', err?.stack || err?.message || util.inspect(err, { depth: null }));
  process.exit(1);
});
