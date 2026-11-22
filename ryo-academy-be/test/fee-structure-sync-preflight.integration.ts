import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { FeeStructureSyncService } from '../src/admission/fee-component/fee-structure-sync.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { InstallmentTemplateService } from '../src/admission/installment/installment-template.service.js';
import { AdmissionInstallmentScheduleService } from '../src/admission/installment/admission-installment-schedule.service.js';
import { ScheduleCalculatorService } from '../src/admission/installment/schedule-calculator.service.js';
import {
  AdmissionStatus,
  CalculationMode,
  DayOfWeek,
  Gender,
  InstallmentCalculationType,
  Prisma,
  Relation,
} from '../generated/prisma/client.js';
import { ConflictException } from '@nestjs/common';

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

async function waitForLockContention(inspectDb: DatabaseService, maxWaitMs = 5000): Promise<number> {
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
  throw new Error(`Timeout waiting for lock contention after ${maxWaitMs}ms`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required');

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  const dbConcurrent = new DatabaseService({ getOrThrow: () => databaseUrl } as any);

  await db.$connect();
  await dbConcurrent.$connect();
  await assertQaDatabase(db);

  console.log('\n================================================================');
  console.log('FEE STRUCTURE SYNC STAGE 2 INTEGRATION TEST (COORDINATOR & PREFLIGHT)');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-sync2-${runId}`;
  const adminUserId = `usr-sync2-${runId}`;

  const feeStructureSyncService = new FeeStructureSyncService(db);
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);
  const admissionRepoConcurrent = new AdmissionRepository(dbConcurrent);
  const admissionServiceConcurrent = new AdmissionService(dbConcurrent, admissionRepoConcurrent);
  const templateService = new InstallmentTemplateService(db);
  const scheduleCalc = new ScheduleCalculatorService();
  const scheduleService = new AdmissionInstallmentScheduleService(db, scheduleCalc, templateService);

  try {
    // 1. Setup Base School, Role, User
    await db.school.create({
      data: { id: schoolId, name: `Sync Stage 2 School ${runId}`, schoolCode: `SYNC2-${runId}` },
    });

    const roleAdmin = await db.role.upsert({
      where: { name: 'COLLEGE_ADMIN' },
      update: {},
      create: { name: 'COLLEGE_ADMIN', description: 'College Admin' },
    });

    await db.user.create({
      data: {
        id: adminUserId,
        schoolId,
        firstName: 'Sync',
        lastName: 'Admin',
        email: `admin-sync2-${runId}@ryo.local`,
        passwordHash: 'dummyhash',
        roles: { create: { roleId: roleAdmin.id } },
      },
    });

    const adminActor = {
      userId: adminUserId,
      id: adminUserId,
      schoolId,
      roles: ['COLLEGE_ADMIN'],
    };

    // 2. Setup Academic Year, Program, Class, Section
    const ayId = `ay-sync2-${runId}`;
    await db.academicYear.create({
      data: {
        id: ayId,
        schoolId,
        name: `AY-SYNC2-${runId}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
      },
    });

    const program = await db.program.create({
      data: {
        id: `prg-sync2-${runId}`,
        name: `Program Sync2 ${runId}`,
        academicYearId: ayId,
        isActive: true,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
        startTime: '08:00',
        endTime: '14:00',
      },
    });

    const cls = await db.class.create({
      data: {
        id: `cls-sync2-${runId}`,
        name: `Class Sync2 ${runId}`,
        programId: program.id,
        isActive: true,
      },
    });

    const sec = await db.section.create({
      data: {
        id: `sec-sync2-${runId}`,
        name: `Section A Sync2`,
        classId: cls.id,
      },
    });

    // 3. Fee Structure and Components (Total = 15000: Mandatory 10000 + Optional 5000)
    const fs = await db.feeStructure.create({
      data: {
        id: `fs-sync2-${runId}`,
        name: `Fee Plan Sync2 ${runId}`,
        academicYearId: ayId,
        programId: program.id,
        classId: cls.id,
        totalAmount: 15000,
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: true,
      },
    });

    const fcMandatory = await db.feeComponent.create({
      data: {
        id: `fc-m-sync2-${runId}`,
        name: `Tuition Sync2 ${runId}`,
        feeStructureId: fs.id,
        amount: 10000,
        discountApplicable: true,
        isMandatory: true,
        isActive: true,
      },
    });

    const fcOptional = await db.feeComponent.create({
      data: {
        id: `fc-o-sync2-${runId}`,
        name: `Activity Sync2 ${runId}`,
        feeStructureId: fs.id,
        amount: 5000,
        discountApplicable: false,
        isMandatory: false,
        isActive: true,
      },
    });

    // Dedicated fixtures for Application-level concurrency test
    const clsApp = await db.class.create({
      data: {
        id: `cls-app-sync2-${runId}`,
        name: `Class App Sync2 ${runId}`,
        programId: program.id,
        isActive: true,
      },
    });

    const secApp = await db.section.create({
      data: {
        id: `sec-app-sync2-${runId}`,
        name: `Section App Sync2`,
        classId: clsApp.id,
      },
    });

    const fsApp = await db.feeStructure.create({
      data: {
        id: `fs-app-sync2-${runId}`,
        name: `Fee Plan App Sync2 ${runId}`,
        academicYearId: ayId,
        programId: program.id,
        classId: clsApp.id,
        totalAmount: 10000,
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: true,
      },
    });

    const fcAppMandatory = await db.feeComponent.create({
      data: {
        id: `fc-app-m-sync2-${runId}`,
        name: `Tuition App Sync2 ${runId}`,
        feeStructureId: fsApp.id,
        amount: 10000,
        discountApplicable: true,
        isMandatory: true,
        isActive: true,
      },
    });

    // 4. Installment Template: 2 installments 50% / 50%
    const template5050 = await templateService.create(
      {
        name: `50/50 Template Sync2 ${runId}`,
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 2,
        items: [
          { sequence: 1, label: 'Term 1', percentage: 50, intervalDaysAfterPrevious: 0 },
          { sequence: 2, label: 'Term 2', percentage: 50, intervalDaysAfterPrevious: 30 },
        ],
      },
      adminUserId,
    );

    // 5. Helper to create admissions
    const createTestAdmission = async (prefix: string, status: AdmissionStatus, withSchedule: boolean) => {
      const adm = await admissionService.create(
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
          parentRelation: Relation.MOTHER,
          parentPhone: '9876543210',
          addressLine1: '123 QA Lane',
          city: 'Metropolis',
          state: 'State',
          postalCode: '500001',
          country: 'India',
          createdById: adminUserId,
          selectedFeeComponentIds: [fcMandatory.id, fcOptional.id],
          components: [
            { feeComponentId: fcMandatory.id, discountPercentage: '0.00' },
            { feeComponentId: fcOptional.id, discountPercentage: '0.00' },
          ],
        },
        adminActor as any,
      );

      let schedule = null;
      if (withSchedule) {
        schedule = await scheduleService.createFromTemplate(
          adm.id,
          {
            templateId: template5050.id,
            firstDueDate: '2026-06-15',
          },
          adminUserId,
        );
      }

      if (status !== AdmissionStatus.DRAFT) {
        await db.admission.update({
          where: { id: adm.id },
          data: { admissionStatus: status },
        });
      }

      const header = await db.feePaymentHeader.findFirstOrThrow({
        where: { admissionId: adm.id },
      });

      return { admission: adm, header, schedule };
    };

    // Admission 1: DRAFT with schedule
    const admDraft = await createTestAdmission('DRAFT-SCHED', AdmissionStatus.DRAFT, true);
    // Admission 2: CONFIRMED with schedule
    const admConfirmed = await createTestAdmission('CONFIRMED-SCHED', AdmissionStatus.CONFIRMED, true);
    // Admission 3: CANCELLED with schedule
    const admCancelled = await createTestAdmission('CANCELLED-SCHED', AdmissionStatus.CANCELLED, true);
    // Admission 4: DRAFT without schedule
    const admNoSched = await createTestAdmission('DRAFT-NOSCHED', AdmissionStatus.DRAFT, false);

    console.log('✓ QA fixtures provisioned successfully.');

    // ------------------------------------------------------------------------
    // TEST 1: DISCOVERY & PREFLIGHT VALIDATION
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: Admission Discovery and Integrity Preflight ---');
    const { preflight } = await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);

    assert.equal(preflight.feeStructureId, fs.id);
    assert.equal(preflight.eligibleAdmissionCount, 3, 'Must discover exactly 3 eligible admissions (2 DRAFT, 1 CONFIRMED)');
    assert.equal(preflight.admissionsWithScheduleCount, 2, 'Must count 2 admissions with schedule');
    assert.equal(preflight.admissionsWithoutScheduleCount, 1, 'Must count 1 admission without schedule');

    const eligibleIds = preflight.eligibleAdmissionIds;
    assert.ok(eligibleIds.includes(admDraft.admission.id), 'Must include DRAFT admission with schedule');
    assert.ok(eligibleIds.includes(admConfirmed.admission.id), 'Must include CONFIRMED admission with schedule');
    assert.ok(eligibleIds.includes(admNoSched.admission.id), 'Must include DRAFT admission without schedule');
    assert.ok(!eligibleIds.includes(admCancelled.admission.id), 'Must EXCLUDE CANCELLED admission');

    // Verify admission without schedule still has NO schedule in DB
    const schedCountNoSched = await db.admissionInstallmentSchedule.count({
      where: { admissionId: admNoSched.admission.id },
    });
    assert.equal(schedCountNoSched, 0, 'Preflight must NEVER fabricate or create a schedule for an admission without one');
    console.log('✓ Discovery correctly included DRAFT/CONFIRMED, excluded CANCELLED, and detected schedule-less admission without fabricating one.');

    // ------------------------------------------------------------------------
    // TEST 2: PAID PROJECTION INTEGRITY MISMATCH
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Paid Projection Integrity Check ---');
    const detailToTamper = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeaderId: admDraft.header.id },
    });

    // Tamper detail amountPaid to 500 without updating header
    await db.feePaymentDetails.update({
      where: { id: detailToTamper.id },
      data: { amountPaid: new Prisma.Decimal('500.00') },
    });

    await assert.rejects(
      async () => {
        await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal((err.getResponse() as any)?.code, 'PAID_PROJECTION_INTEGRITY_MISMATCH');
        return true;
      },
      'Must abort with PAID_PROJECTION_INTEGRITY_MISMATCH when detail paid sum != header paid total',
    );

    // Restore detail
    await db.feePaymentDetails.update({
      where: { id: detailToTamper.id },
      data: { amountPaid: new Prisma.Decimal('0.00') },
    });
    console.log('✓ Successfully caught and aborted on paid projection mismatch.');

    // ------------------------------------------------------------------------
    // TEST 3: SCHEDULE TOTAL PARITY MISMATCH
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Schedule Total Parity Check ---');
    await db.admissionInstallmentSchedule.update({
      where: { id: admDraft.schedule!.id },
      data: { totalAmount: new Prisma.Decimal('14000.00') },
    });

    await assert.rejects(
      async () => {
        await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal((err.getResponse() as any)?.code, 'SCHEDULE_INTEGRITY_VIOLATION');
        return true;
      },
      'Must abort with SCHEDULE_INTEGRITY_VIOLATION when schedule total != header netAmount',
    );

    // Restore schedule total
    await db.admissionInstallmentSchedule.update({
      where: { id: admDraft.schedule!.id },
      data: { totalAmount: new Prisma.Decimal('15000.00') },
    });
    console.log('✓ Successfully caught and aborted on schedule total parity mismatch.');

    // ------------------------------------------------------------------------
    // TEST 4: PENDING INSTALLMENT SUM PARITY MISMATCH
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Pending Installment Sum Parity Check ---');
    const firstInstallment = await db.admissionInstallment.findFirstOrThrow({
      where: { scheduleId: admDraft.schedule!.id, sequence: 1 },
    });

    await db.admissionInstallment.update({
      where: { id: firstInstallment.id },
      data: { amount: new Prisma.Decimal('8000.00') },
    });

    await assert.rejects(
      async () => {
        await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal((err.getResponse() as any)?.code, 'SCHEDULE_INTEGRITY_VIOLATION');
        return true;
      },
      'Must abort with SCHEDULE_INTEGRITY_VIOLATION when pending installments sum != header due',
    );

    // Restore installment amount
    await db.admissionInstallment.update({
      where: { id: firstInstallment.id },
      data: { amount: new Prisma.Decimal('7500.00') },
    });
    console.log('✓ Successfully caught and aborted on pending installment sum parity mismatch.');

    // ------------------------------------------------------------------------
    // TEST 5: ADMISSION WITHOUT SCHEDULE INDEPENDENT BALANCE CHECK
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Admission Without Schedule Independent Balance Check ---');
    await db.feePaymentHeader.update({
      where: { id: admNoSched.header.id },
      data: { totalDueAmount: new Prisma.Decimal('10000.00') },
    });

    await assert.rejects(
      async () => {
        await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal((err.getResponse() as any)?.code, 'HEADER_BALANCE_INTEGRITY_MISMATCH');
        return true;
      },
      'Must abort when schedule-less admission header balance != netAmount - totalPaidAmount',
    );

    // Restore header due
    await db.feePaymentHeader.update({
      where: { id: admNoSched.header.id },
      data: { totalDueAmount: new Prisma.Decimal('15000.00') },
    });
    console.log('✓ Successfully validated independent header balance on schedule-less admission.');

    // ------------------------------------------------------------------------
    // TEST 6: POSTGRESQL LOCK-MANAGER SERIALIZATION (SQL-LEVEL FOR UPDATE vs FOR SHARE)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: PostgreSQL Lock-Manager Serialization Check (SQL-level FOR UPDATE vs FOR SHARE) ---');
    const lockAcquiredBarrier = createBarrier();
    const releaseLockBarrier = createBarrier();
    let coordinatorFinished = false;

    // Launch coordinator in background holding Level 1 lock
    const coordinatorPromise = feeStructureSyncService.runInSyncCoordination(
      fs.id,
      adminUserId,
      async (tx, context) => {
        lockAcquiredBarrier.resolve();
        await releaseLockBarrier.promise;
        return { count: context.eligibleAdmissionIds.length };
      },
    ).then((res) => {
      coordinatorFinished = true;
      return res;
    });

    // Wait until coordinator has acquired lock and entered callback
    await lockAcquiredBarrier.promise;

    // Concurrent transaction attempting SELECT FOR SHARE
    let concurrentCompleted = false;
    let concurrentBlockedDuration = 0;
    const concurrentPromise = dbConcurrent.$transaction(async (tx) => {
      const startTime = Date.now();
      await tx.$executeRaw`SET LOCAL lock_timeout = '4000ms'`;
      await tx.$queryRaw`
        SELECT "id" FROM "FeeStructure" WHERE "id" = ${fs.id} FOR SHARE
      `;
      concurrentBlockedDuration = Date.now() - startTime;
      concurrentCompleted = true;
    });

    // Verify lock contention exists in PostgreSQL
    const contentionDetected = await waitForLockContention(db, 3000);
    assert.ok(contentionDetected >= 0, 'Concurrent FOR SHARE must be blocked by Level 1 FOR UPDATE');
    assert.equal(concurrentCompleted, false, 'Concurrent transaction must remain blocked while coordinator holds lock');

    // Release coordinator
    releaseLockBarrier.resolve();
    const coordResult = await coordinatorPromise;
    await concurrentPromise;

    assert.equal(coordResult.result?.count, 3);
    assert.equal(coordResult.preflight.eligibleAdmissionCount, 3);
    assert.equal(concurrentCompleted, true, 'Concurrent transaction unblocks and completes after coordinator commits');
    console.log(`✓ Lock serialization confirmed: concurrent SELECT FOR SHARE was blocked for ${concurrentBlockedDuration}ms until coordinator finished.`);

    // ------------------------------------------------------------------------
    // TEST 7: APPLICATION-LEVEL CONCURRENCY VERIFICATION (AdmissionService.create vs Coordinator)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Application-Level Concurrency Verification (AdmissionService.create vs Coordinator) ---');
    const appLockAcquiredBarrier = createBarrier();
    const appReleaseLockBarrier = createBarrier();

    // 1. Start synchronization coordinator holding FeeStructure Level 1 lock
    const appCoordinatorPromise = feeStructureSyncService.runInSyncCoordination(
      fsApp.id,
      adminUserId,
      async (tx, context) => {
        // While holding Level 1 FOR UPDATE lock on fsApp.id, update the master component: 10000 -> 12000
        await tx.feeComponent.update({
          where: { id: fcAppMandatory.id },
          data: { amount: new Prisma.Decimal('12000.00') },
        });
        await tx.feeStructure.update({
          where: { id: fsApp.id },
          data: { totalAmount: new Prisma.Decimal('12000.00') },
        });

        // Notify that lock is acquired and master is updated within the uncommitted transaction
        appLockAcquiredBarrier.resolve();
        // Await barrier to hold lock and block concurrent admission creation
        await appReleaseLockBarrier.promise;
        return { updatedAmount: '12000.00' };
      },
    );

    // 2. Wait until coordinator holds exclusive lock
    await appLockAcquiredBarrier.promise;

    // 3. Concurrently invoke the real AdmissionService.create() application path
    let admissionStarted = false;
    let admissionCompleted = false;
    let createdAdmissionResult: any = null;
    let admissionError: any = null;

    const admissionConcurrentPromise = (async () => {
      admissionStarted = true;
      try {
        createdAdmissionResult = await admissionServiceConcurrent.create(
          {
            schoolId,
            academicYearId: ayId,
            programId: program.id,
            classId: clsApp.id,
            sectionId: secApp.id,
            studentName: `Concurrent Student ${runId}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2018-05-15'),
            parentName: `Parent Concurrent`,
            parentRelation: Relation.MOTHER,
            parentPhone: '9876543210',
            addressLine1: '789 Concurrency Way',
            city: 'Metropolis',
            state: 'State',
            postalCode: '500001',
            country: 'India',
            createdById: adminUserId,
            selectedFeeComponentIds: [fcAppMandatory.id],
            components: [
              { feeComponentId: fcAppMandatory.id, discountPercentage: '0.00' },
            ],
          },
          adminActor as any,
        );
      } catch (err) {
        admissionError = err;
      } finally {
        admissionCompleted = true;
      }
    })();

    // 4. Verify the admission-creation transaction actually waits on the conflicting FeeStructure lock
    const appContentionTime = await waitForLockContention(db, 5000);
    assert.ok(appContentionTime >= 0, 'AdmissionService.create must be observed waiting on PostgreSQL lock contention');
    assert.equal(admissionStarted, true, 'AdmissionService.create must have started');
    assert.equal(admissionCompleted, false, 'AdmissionService.create must remain blocked while coordinator holds lock');
    assert.equal(createdAdmissionResult, null, 'No admission result while blocked');

    // 5. Allow coordinator to complete and commit
    appReleaseLockBarrier.resolve();
    const appCoordResult = await appCoordinatorPromise;
    await admissionConcurrentPromise;

    // 6. Verify admission-creation resumed successfully
    assert.ifError(admissionError);
    assert.equal(admissionCompleted, true, 'AdmissionService.create must complete successfully after unblocking');
    assert.ok(createdAdmissionResult?.id, 'Admission must be created with valid ID');

    // 7 & 8. Verify authoritative reread under lock: reflects committed 12000 master, NOT stale 10000
    const createdHeader = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: createdAdmissionResult.id, isActive: true },
    });
    const createdDetails = await db.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: createdHeader.id },
    });

    assert.equal(new Prisma.Decimal(createdHeader.netAmount).toFixed(2), '12000.00', 'Header netAmount must reflect committed 12000.00, not stale 10000.00');
    assert.equal(new Prisma.Decimal(createdHeader.totalFeeAmount).toFixed(2), '12000.00', 'Header totalFeeAmount must reflect committed 12000.00');
    assert.equal(new Prisma.Decimal(createdHeader.totalDueAmount).toFixed(2), '12000.00', 'Header totalDueAmount must reflect committed 12000.00');
    assert.equal(new Prisma.Decimal(createdHeader.totalPaidAmount).toFixed(2), '0.00', 'Header totalPaidAmount must be 0');

    assert.equal(createdDetails.length, 1, 'Must have exactly 1 FeePaymentDetails row');
    assert.equal(createdDetails[0].feeComponentId, fcAppMandatory.id);
    assert.equal(new Prisma.Decimal(createdDetails[0].originalAmount).toFixed(2), '12000.00', 'Detail originalAmount must reflect re-read committed component amount (12000.00)');

    // 9. Verify no duplicate, partial, or orphaned records remain
    const admissionsCountForClass = await db.admission.count({
      where: { classId: clsApp.id },
    });
    assert.equal(admissionsCountForClass, 1, 'Must have exactly 1 admission for clsApp');

    const headersCount = await db.feePaymentHeader.count({
      where: { admissionId: createdAdmissionResult.id },
    });
    assert.equal(headersCount, 1, 'Must have exactly 1 header for the created admission');

    assert.equal(createdAdmissionResult.admissionStatus, AdmissionStatus.DRAFT, 'Created admission must be in DRAFT status');
    assert.equal(createdAdmissionResult.studentName, `Concurrent Student ${runId}`);
    assert.equal(createdAdmissionResult.studentId, null, 'DRAFT admission must not have studentId assigned before confirmation');
    console.log('✓ Application-level concurrency verified: AdmissionService.create waited on lock, unblocked, re-read authoritative master data (12000.00), and completed without orphans.');

    // ------------------------------------------------------------------------
    // TEST 8: ZERO FINANCIAL MUTATION GUARANTEE
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Zero Financial Mutation Guarantee ---');
    const headerSnapshotsBefore = await db.feePaymentHeader.findMany({
      where: { admission: { schoolId } },
      orderBy: { id: 'asc' },
    });
    const detailsSnapshotsBefore = await db.feePaymentDetails.findMany({
      where: { feePaymentHeader: { admission: { schoolId } } },
      orderBy: { id: 'asc' },
    });
    const installmentsSnapshotsBefore = await db.admissionInstallment.findMany({
      where: { schedule: { admission: { schoolId } } },
      orderBy: { id: 'asc' },
    });

    // Run coordinator again with empty callback
    await feeStructureSyncService.runInSyncCoordination(fs.id, adminUserId);

    const headerSnapshotsAfter = await db.feePaymentHeader.findMany({
      where: { admission: { schoolId } },
      orderBy: { id: 'asc' },
    });
    const detailsSnapshotsAfter = await db.feePaymentDetails.findMany({
      where: { feePaymentHeader: { admission: { schoolId } } },
      orderBy: { id: 'asc' },
    });
    const installmentsSnapshotsAfter = await db.admissionInstallment.findMany({
      where: { schedule: { admission: { schoolId } } },
      orderBy: { id: 'asc' },
    });

    assert.deepEqual(
      headerSnapshotsBefore.map((h) => ({ id: h.id, due: h.totalDueAmount.toString(), net: h.netAmount.toString() })),
      headerSnapshotsAfter.map((h) => ({ id: h.id, due: h.totalDueAmount.toString(), net: h.netAmount.toString() })),
      'FeePaymentHeaders must be completely unchanged',
    );
    assert.deepEqual(
      detailsSnapshotsBefore.map((d) => ({ id: d.id, orig: d.originalAmount.toString(), paid: d.amountPaid.toString() })),
      detailsSnapshotsAfter.map((d) => ({ id: d.id, orig: d.originalAmount.toString(), paid: d.amountPaid.toString() })),
      'FeePaymentDetails must be completely unchanged',
    );
    assert.deepEqual(
      installmentsSnapshotsBefore.map((i) => ({ id: i.id, amount: i.amount.toString(), status: i.status })),
      installmentsSnapshotsAfter.map((i) => ({ id: i.id, amount: i.amount.toString(), status: i.status })),
      'AdmissionInstallments must be completely unchanged',
    );
    console.log('✓ Stage 2 coordinator and preflight introduced zero financial mutations.');

    console.log('\n================================================================');
    console.log('ALL FEE STRUCTURE SYNC STAGE 2 INTEGRATION TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    console.log('[Guaranteed Teardown] Cleaning up test fixtures...');
    try {
      // Teardown in reverse dependency order
      await db.installmentLineageTransferEdge.deleteMany({
        where: { event: { schedule: { admission: { schoolId } } } },
      });
      await db.installmentLineageEvent.deleteMany({
        where: { schedule: { admission: { schoolId } } },
      });
      await db.admissionInstallment.deleteMany({
        where: { schedule: { admission: { schoolId } } },
      });
      await db.admissionInstallmentSchedule.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.feePaymentDetails.deleteMany({
        where: { feePaymentHeader: { admission: { schoolId } } },
      });
      await db.feePaymentHeader.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.student.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.admission.deleteMany({
        where: { schoolId },
      });
      await db.installmentTemplateItem.deleteMany({
        where: { template: { name: { contains: runId } } },
      });
      await db.installmentTemplate.deleteMany({
        where: { name: { contains: runId } },
      });
      await db.feeComponent.deleteMany({
        where: { feeStructure: { academicYear: { schoolId } } },
      });
      await db.feeStructure.deleteMany({
        where: { academicYear: { schoolId } },
      });
      await db.section.deleteMany({
        where: { class: { program: { academicYear: { schoolId } } } },
      });
      await db.class.deleteMany({
        where: { program: { academicYear: { schoolId } } },
      });
      await db.program.deleteMany({
        where: { academicYear: { schoolId } },
      });
      await db.academicYear.deleteMany({
        where: { schoolId },
      });
      await db.userRole.deleteMany({
        where: { user: { schoolId } },
      });
      await db.user.deleteMany({
        where: { schoolId },
      });
      await db.school.deleteMany({
        where: { id: schoolId },
      });

      // Verify zero residue
      const remainingAdmissions = await db.admission.count({ where: { schoolId } });
      const remainingHeaders = await db.feePaymentHeader.count({ where: { admission: { schoolId } } });
      assert.equal(remainingAdmissions, 0, 'Zero admissions residue');
      assert.equal(remainingHeaders, 0, 'Zero headers residue');
      console.log('✓ Teardown complete. Residue verified as zero.');
    } catch (cleanupErr) {
      console.warn(`[Teardown Warning] ${cleanupErr?.message}`);
    } finally {
      await db.$disconnect();
      await dbConcurrent.$disconnect();
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  });
