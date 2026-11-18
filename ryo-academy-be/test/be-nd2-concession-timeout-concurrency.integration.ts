import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionConcessionService } from '../src/admission/fee-concession/admission-concession.service.js';
import {
  AdmissionStatus,
  CalculationMode,
  DayOfWeek,
  Gender,
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
  console.log('BE-ND2: CONCESSION TIMEOUT CONCURRENCY TEST SUITE (10s TIMEOUT)');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-conc-${runId}`;
  const collegeAdminId = `usr-col-conc-${runId}`;

  try {
    // 1. Setup School and Admin User
    await inspectDb.school.create({
      data: { id: schoolId, name: `Concession Timeout School ${runId}`, schoolCode: `CT-${runId}` },
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
        email: `admin-conc-${runId}@ryo.local`,
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

    async function seedAdmissionFixture(prefix: string) {
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
          gstPercentage: new Prisma.Decimal('0.00'),
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
          components: [{ feeComponentId: fc.id, discountPercentage: '0.00' }],
        },
        adminActor as any,
      );

      await inspectDb.feePaymentHeader.updateMany({
        where: { admissionId: admission.id },
        data: { pricingVersion: 'LEGACY' as any },
      });

      const feeDetails = await inspectDb.feePaymentDetails.findFirstOrThrow({
        where: { feePaymentHeader: { admissionId: admission.id } },
      });

      return { admission, feeDetails, fs, fc };
    }

    // ============================================================================
    // TEST A: Lock released within timeout (Tx A holds lock ~6s, Tx B succeeds)
    // ============================================================================
    console.log('[Test A] Lock released within timeout: Tx A holds ~6s, Tx B assignConcession succeeds');
    {
      const fixture = await seedAdmissionFixture('t-a');
      const concessionServiceB = new AdmissionConcessionService(db2);

      const txAHeld = createBarrier();
      const txARelease = createBarrier();

      let txACompleted = false;
      const txAPromise = db1.$transaction(
        async (tx: any) => {
          await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
          txAHeld.resolve();
          await txARelease.promise;
          txACompleted = true;
        },
        { timeout: 30000, maxWait: 5000 },
      );

      await txAHeld.promise;
      console.log('  -> Tx A acquired Admission row lock');

      const startTime = Date.now();
      const txBPromise = concessionServiceB.assignConcession(
        fixture.admission.id,
        {
          feePaymentDetailsId: fixture.feeDetails.id,
          payableAmount: '8000.00',
        },
        collegeAdminId,
      );

      const contentionMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active after ${contentionMs}ms`);

      // Hold for 6000ms (breaches old 5s default, well within new 10s limit)
      await delay(6000);
      console.log('  -> Tx A releasing lock at t ~ 6000ms');
      txARelease.resolve();
      await txAPromise;
      assert.equal(txACompleted, true, 'Tx A committed successfully');

      const resultB = await txBPromise;
      const elapsed = Date.now() - startTime;
      console.log(`  -> Tx B completed successfully in ${elapsed}ms (elapsed >= 6000ms)`);
      assert.ok(elapsed >= 5800, `Expected elapsed >= 5800ms, got ${elapsed}ms`);

      // Verify concession and balances
      const concession = await inspectDb.admissionFeeConcession.findFirst({
        where: { admissionId: fixture.admission.id },
      });
      assert.ok(concession, 'Concession must exist in DB');
      assert.equal(concession.calculatedDiscountAmount.toString(), '2000');
      assert.equal(concession.calculationMode, CalculationMode.PAYABLE);

      const detail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
        where: { id: fixture.feeDetails.id },
      });
      assert.equal(detail.discountAmount.toString(), '2000');
      assert.equal(detail.finalAmount.toString(), '8000');
      assert.equal(detail.totalAmountToBePaid.toString(), '8000');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '10000');
      assert.equal(header.discountAmount.toString(), '2000');
      assert.equal(header.netAmount.toString(), '8000');
      assert.equal(header.totalDueAmount.toString(), '8000');
      console.log('  -> PASS: Test A verified successfully.\n');
    }

    // ============================================================================
    // TEST B: Lock exceeds timeout (Tx A holds lock > 10s, Tx B fails and atomicity verified)
    // ============================================================================
    console.log('[Test B] Lock exceeds timeout: Tx A holds lock > 10s, Tx B fails within bounded interval');
    {
      const fixture = await seedAdmissionFixture('t-b');
      const concessionServiceB = new AdmissionConcessionService(db2);

      const txAHeld = createBarrier();
      const txARelease = createBarrier();

      const txAPromise = db1.$transaction(
        async (tx: any) => {
          await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
          txAHeld.resolve();
          await txARelease.promise;
        },
        { timeout: 30000, maxWait: 5000 },
      );

      await txAHeld.promise;
      console.log('  -> Tx A acquired Admission row lock');

      const startTime = Date.now();
      let txBError: any = null;

      const txBPromise = concessionServiceB
        .assignConcession(
          fixture.admission.id,
          {
            feePaymentDetailsId: fixture.feeDetails.id,
            payableAmount: '7500.00',
          },
          collegeAdminId,
        )
        .catch((err) => {
          txBError = err;
        });

      await waitForLockContention(inspectDb);
      console.log('  -> PostgreSQL lock contention confirmed. Holding lock for 11.5s (exceeding Tx B 10s timeout)...');

      // Hold lock past Tx B's 10,000ms timeout
      await delay(11500);

      // Release Tx A so PostgreSQL frees the lock and Tx B attempts its next operation
      console.log('  -> Tx A releasing lock at t ~ 11500ms');
      txARelease.resolve();
      await txAPromise;

      // Await Tx B's completion/failure
      await txBPromise;
      const elapsed = Date.now() - startTime;
      console.log(`  -> Tx B failed in ${elapsed}ms`);

      assert.ok(txBError, 'Tx B must fail when lock is held past 10s timeout');
      console.log(`  -> Observed error type: ${txBError?.name || txBError?.constructor?.name}, message: "${txBError?.message?.slice(0, 100)}..."`);
      assert.ok(
        elapsed >= 9500 && elapsed <= 16000,
        `Expected Tx B failure interval between 9.5s and 16s, got ${elapsed}ms`,
      );

      // Verify DB atomicity: absolutely NO partial changes persisted
      const concessionCount = await inspectDb.admissionFeeConcession.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(concessionCount, 0, 'No concession should be created');

      const detail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
        where: { id: fixture.feeDetails.id },
      });
      assert.equal(detail.discountAmount.toString(), '0', 'Detail discount must remain 0');
      assert.equal(detail.finalAmount.toString(), '10000', 'Detail final amount must remain 10000');
      assert.equal(detail.totalAmountToBePaid.toString(), '10000', 'Detail payable must remain 10000');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.discountAmount.toString(), '0', 'Header discount must remain 0');
      assert.equal(header.netAmount.toString(), '10000', 'Header net must remain 10000');
      assert.equal(header.totalDueAmount.toString(), '10000', 'Header due must remain 10000');

      // Verify database remains fully usable
      const verifyRead = await inspectDb.admission.findUnique({
        where: { id: fixture.admission.id },
      });
      assert.ok(verifyRead, 'Database read succeeds after failure');
      console.log('  -> PASS: Test B verified successfully with complete atomicity preserved.\n');
    }

    // ============================================================================
    // TEST C: Other mutation paths (updateConcession and removeConcession with 6s lock hold)
    // ============================================================================
    console.log('[Test C] Other mutation paths: updateConcession and removeConcession hold ~6s');
    {
      const fixture = await seedAdmissionFixture('t-c');
      const concessionService = new AdmissionConcessionService(inspectDb);

      // Pre-seed an initial concession
      const initialConcession = await concessionService.assignConcession(
        fixture.admission.id,
        {
          feePaymentDetailsId: fixture.feeDetails.id,
          payableAmount: '8500.00',
        },
        collegeAdminId,
      );

      const concessionRecord = await inspectDb.admissionFeeConcession.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });

      // Part C1: updateConcession
      console.log('  -> Part C1: updateConcession with Tx A holding lock for 6s');
      {
        const txAHeld = createBarrier();
        const txARelease = createBarrier();

        const txAPromise = db1.$transaction(
          async (tx: any) => {
            await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
            txAHeld.resolve();
            await txARelease.promise;
          },
          { timeout: 30000, maxWait: 5000 },
        );

        await txAHeld.promise;
        const concessionServiceB = new AdmissionConcessionService(db2);

        const startTime = Date.now();
        const txBPromise = concessionServiceB.updateConcession(
          fixture.admission.id,
          concessionRecord.id,
          { payableAmount: '7000.00' },
          collegeAdminId,
        );

        await waitForLockContention(inspectDb);
        await delay(6000);
        txARelease.resolve();
        await txAPromise;

        const updateResult = await txBPromise;
        const elapsed = Date.now() - startTime;
        console.log(`     updateConcession completed in ${elapsed}ms (elapsed >= 6000ms)`);
        assert.ok(elapsed >= 5800, `Expected elapsed >= 5800ms, got ${elapsed}ms`);

        const updatedDetail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
          where: { id: fixture.feeDetails.id },
        });
        assert.equal(updatedDetail.discountAmount.toString(), '3000');
        assert.equal(updatedDetail.finalAmount.toString(), '7000');
        assert.equal(updatedDetail.totalAmountToBePaid.toString(), '7000');

        const revision = await inspectDb.admissionFeeConcessionRevision.findFirst({
          where: { sourceConcessionId: concessionRecord.id },
        });
        assert.ok(revision, 'Revision must be recorded on update');
        assert.equal(revision.previousPayableAmount?.toString(), '8500');
        console.log('     PASS: Part C1 verified.');
      }

      // Part C2: removeConcession
      console.log('  -> Part C2: removeConcession with Tx A holding lock for 6s');
      {
        const txAHeld = createBarrier();
        const txARelease = createBarrier();

        const txAPromise = db1.$transaction(
          async (tx: any) => {
            await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${fixture.admission.id} FOR UPDATE`;
            txAHeld.resolve();
            await txARelease.promise;
          },
          { timeout: 30000, maxWait: 5000 },
        );

        await txAHeld.promise;
        const concessionServiceB = new AdmissionConcessionService(db2);

        const startTime = Date.now();
        const txBPromise = concessionServiceB.removeConcession(
          fixture.admission.id,
          concessionRecord.id,
        );

        await waitForLockContention(inspectDb);
        await delay(6000);
        txARelease.resolve();
        await txAPromise;

        await txBPromise;
        const elapsed = Date.now() - startTime;
        console.log(`     removeConcession completed in ${elapsed}ms (elapsed >= 6000ms)`);
        assert.ok(elapsed >= 5800, `Expected elapsed >= 5800ms, got ${elapsed}ms`);

        const removedConcession = await inspectDb.admissionFeeConcession.findUnique({
          where: { id: concessionRecord.id },
        });
        assert.equal(removedConcession, null, 'Concession must be deleted');

        const restoredDetail = await inspectDb.feePaymentDetails.findUniqueOrThrow({
          where: { id: fixture.feeDetails.id },
        });
        assert.equal(restoredDetail.discountAmount.toString(), '0');
        assert.equal(restoredDetail.finalAmount.toString(), '10000');
        assert.equal(restoredDetail.totalAmountToBePaid.toString(), '10000');

        const restoredHeader = await inspectDb.feePaymentHeader.findFirstOrThrow({
          where: { admissionId: fixture.admission.id },
        });
        assert.equal(restoredHeader.discountAmount.toString(), '0');
        assert.equal(restoredHeader.netAmount.toString(), '10000');
        assert.equal(restoredHeader.totalDueAmount.toString(), '10000');
        console.log('     PASS: Part C2 verified.');
      }

      console.log('  -> PASS: Test C verified successfully.\n');
    }

    console.log('================================================================');
    console.log('ALL CONCESSION TIMEOUT CONCURRENCY TESTS PASSED SUCCESSFULLY');
    console.log('================================================================\n');
  } finally {
    await db1.$disconnect();
    await db2.$disconnect();
    await inspectDb.$disconnect();
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR in concession timeout concurrency test]:', err);
  process.exit(1);
});
