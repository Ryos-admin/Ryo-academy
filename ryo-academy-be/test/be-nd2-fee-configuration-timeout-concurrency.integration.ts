import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import {
  AdmissionStatus,
  CalculationMode,
  DayOfWeek,
  Gender,
  Relation,
  FeePricingVersion,
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
  console.log('BE-ND2: ADMISSION FEE CONFIGURATION TIMEOUT CONCURRENCY TEST SUITE');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-feeconf-${runId}`;
  const collegeAdminId = `usr-col-feeconf-${runId}`;

  try {
    // 1. Setup School and Admin User
    await inspectDb.school.create({
      data: { id: schoolId, name: `Fee Config School ${runId}`, schoolCode: `FC-${runId}` },
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
        email: `admin-feeconf-${runId}@ryo.local`,
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

    async function seedAdmissionWithTwoComponents(prefix: string) {
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
          totalAmount: 15000,
          gstPercentage: new Prisma.Decimal('0.00'),
          isActive: true,
        },
      });

      const fcMandatory = await inspectDb.feeComponent.create({
        data: {
          id: `fc-m-${prefix}-${runId}`,
          name: `Tuition ${prefix} ${runId}`,
          feeStructureId: fs.id,
          amount: 10000,
          discountApplicable: true,
          isMandatory: true,
          isActive: true,
        },
      });

      const fcOptional = await inspectDb.feeComponent.create({
        data: {
          id: `fc-o-${prefix}-${runId}`,
          name: `Activity ${prefix} ${runId}`,
          feeStructureId: fs.id,
          amount: 5000,
          discountApplicable: false,
          isMandatory: false,
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
          selectedFeeComponentIds: [fcMandatory.id, fcOptional.id],
          components: [
            { feeComponentId: fcMandatory.id, discountPercentage: '0.00' },
            { feeComponentId: fcOptional.id, discountPercentage: '0.00' },
          ],
        },
        adminActor as any,
      );

      const details = await inspectDb.feePaymentDetails.findMany({
        where: { feePaymentHeader: { admissionId: admission.id } },
        orderBy: { originalAmount: 'desc' },
      });

      const detailMandatory = details.find((d) => d.feeComponentId === fcMandatory.id)!;
      const detailOptional = details.find((d) => d.feeComponentId === fcOptional.id)!;

      return {
        admission,
        fs,
        fcMandatory,
        fcOptional,
        detailMandatory,
        detailOptional,
      };
    }

    // ============================================================================
    // TEST 1: Six-second lock contention
    // ============================================================================
    console.log('[Test 1] Six-second lock contention: Tx A holds ~6s, Tx B updateFeeConfiguration succeeds');
    {
      const fixture = await seedAdmissionWithTwoComponents('t1');
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
      // Tx B updates fee configuration: select only mandatory component (deselect optional component)
      const txBPromise = admissionService2.updateFeeConfiguration(
        fixture.admission.id,
        {
          selectedFeeComponentIds: [fixture.detailMandatory.id],
        },
      );

      const contentionMs = await waitForLockContention(inspectDb);
      console.log(`  -> PostgreSQL lock contention confirmed active after ${contentionMs}ms`);

      // Hold for 6000ms (exceeds old 5s default timeout)
      await delay(6000);
      console.log('  -> Tx A releasing lock at t ~ 6000ms');
      txARelease.resolve();
      await txAPromise;
      assert.equal(txACompleted, true, 'Tx A committed successfully');

      const resultB = await txBPromise;
      const elapsed = Date.now() - startTime;
      console.log(`  -> Tx B completed successfully in ${elapsed}ms (elapsed >= 6000ms)`);
      assert.ok(elapsed >= 5800, `Expected elapsed >= 5800ms, got ${elapsed}ms`);

      // Verify updated fee configuration
      const updatedDetails = await inspectDb.feePaymentDetails.findMany({
        where: { feePaymentHeader: { admissionId: fixture.admission.id } },
      });
      const updatedMandatory = updatedDetails.find((d) => d.id === fixture.detailMandatory.id)!;
      const updatedOptional = updatedDetails.find((d) => d.id === fixture.detailOptional.id)!;

      assert.equal(updatedMandatory.isIncluded, true, 'Mandatory component must be included');
      assert.equal(updatedOptional.isIncluded, false, 'Optional component must be excluded');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '10000', 'Gross amount should only reflect included mandatory component');
      assert.equal(header.netAmount.toString(), '10000', 'Net amount should be 10000');
      assert.equal(header.totalDueAmount.toString(), '10000', 'Due amount should be 10000');
      console.log('  -> PASS: Test 1 verified successfully.\n');
    }

    // ============================================================================
    // TEST 2: Timeout boundary and atomicity
    // ============================================================================
    console.log('[Test 2] Timeout boundary and atomicity: Tx A holds lock for ~11.5s, Tx B fails within bounded interval');
    {
      const fixture = await seedAdmissionWithTwoComponents('t2');
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
        .updateFeeConfiguration(
          fixture.admission.id,
          {
            selectedFeeComponentIds: [fixture.detailMandatory.id],
          },
        )
        .catch((err) => {
          txBError = err;
        });

      await waitForLockContention(inspectDb);
      console.log('  -> PostgreSQL lock contention confirmed. Holding lock for 11.5s (exceeding Tx B 10s timeout)...');

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

      // Verify complete atomicity: no partial changes persisted
      const details = await inspectDb.feePaymentDetails.findMany({
        where: { feePaymentHeader: { admissionId: fixture.admission.id } },
      });
      const dMandatory = details.find((d) => d.id === fixture.detailMandatory.id)!;
      const dOptional = details.find((d) => d.id === fixture.detailOptional.id)!;

      assert.equal(dMandatory.isIncluded, true, 'Mandatory component remains included');
      assert.equal(dOptional.isIncluded, true, 'Optional component remains included (not excluded)');

      const concessionCount = await inspectDb.admissionFeeConcession.count({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(concessionCount, 0, 'No concessions modified or created');

      const header = await inspectDb.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: fixture.admission.id },
      });
      assert.equal(header.grossAmount.toString(), '15000', 'Gross amount remains untouched at 15000');
      assert.equal(header.netAmount.toString(), '15000', 'Net amount remains untouched at 15000');
      assert.equal(header.totalDueAmount.toString(), '15000', 'Due amount remains untouched at 15000');

      // Verify database remains fully usable
      const verifyRead = await inspectDb.admission.findUnique({
        where: { id: fixture.admission.id },
      });
      assert.ok(verifyRead, 'Database read succeeds after failure');
      console.log('  -> PASS: Test 2 verified successfully with complete atomicity preserved.\n');
    }

    console.log('================================================================');
    console.log('ALL FEE CONFIGURATION TIMEOUT CONCURRENCY TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    await db1.$disconnect();
    await db2.$disconnect();
    await inspectDb.$disconnect();
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR in fee configuration timeout concurrency test]:', err);
  process.exit(1);
});
