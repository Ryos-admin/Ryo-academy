import assert from 'node:assert/strict';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { StudentService } from '../src/student/student.service.js';
import { PaymentReversalService } from '../src/student/payment-reversal.service.js';
import { InstallmentAllocationService } from '../src/admission/installment/installment-allocation.service.js';
import { HistoricalOffsetBackfillService } from '../src/admission/installment/historical-offset-backfill.service.js';
import {
  AdmissionStatus,
  FinancialFlowType,
  FinancialLogType,
  InstallmentRowStatus,
  InstallmentScheduleType,
  LineageEventType,
  Prisma,
} from '../generated/prisma/client.js';

const Decimal = Prisma.Decimal;

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const allocationService = new InstallmentAllocationService();
  const studentService = new StudentService(db, allocationService);
  const reversalService = new PaymentReversalService(db, studentService);
  const backfillService = new HistoricalOffsetBackfillService(db);

  console.log('--- Setting up isolated QA fixtures for Task 04B.5.2 Payment Reversal Integration ---');

  const schoolAId = 'sch-rev-a-' + Date.now();
  const schoolBId = 'sch-rev-b-' + Date.now();
  const collegeAdminAId = 'usr-col-a-' + Date.now();
  const officeAdminAId = 'usr-off-a-' + Date.now();
  const collegeAdminBId = 'usr-col-b-' + Date.now();

  const yearAId = 'ay-a-' + Date.now();
  const programAId = 'prg-a-' + Date.now();
  const classAId = 'cls-a-' + Date.now();
  const sectionAId = 'sec-a-' + Date.now();

  try {
    // 1. Schools and Users
    await db.school.createMany({
      data: [
        { id: schoolAId, name: 'QA Reversal School A', schoolCode: 'QA-RA-' + Math.floor(Math.random() * 100000) },
        { id: schoolBId, name: 'QA Reversal School B', schoolCode: 'QA-RB-' + Math.floor(Math.random() * 100000) },
      ],
    });

    await db.user.createMany({
      data: [
        { id: collegeAdminAId, email: `col-a-${Date.now()}@test.local`, passwordHash: 'dummy', firstName: 'College', lastName: 'Admin A', schoolId: schoolAId },
        { id: officeAdminAId, email: `off-a-${Date.now()}@test.local`, passwordHash: 'dummy', firstName: 'Office', lastName: 'Admin A', schoolId: schoolAId },
        { id: collegeAdminBId, email: `col-b-${Date.now()}@test.local`, passwordHash: 'dummy', firstName: 'College', lastName: 'Admin B', schoolId: schoolBId },
      ],
    });

    // 2. Academic structure
    await db.academicYear.create({
      data: {
        id: yearAId,
        schoolId: schoolAId,
        name: 'AY 2026-2027',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
      },
    });

    await db.program.create({
      data: {
        id: programAId,
        academicYearId: yearAId,
        name: 'High School',
        startTime: '08:00',
        endTime: '15:00',
        daysOfWeek: ['MONDAY', 'TUESDAY'],
      },
    });

    await db.class.create({
      data: {
        id: classAId,
        programId: programAId,
        name: 'Grade 10',
      },
    });

    await db.section.create({
      data: {
        id: sectionAId,
        classId: classAId,
        name: 'Section A',
      },
    });

    // Helper to setup admission with custom installment schedule
    async function setupAdmissionWithSchedule(options: {
      admissionNumber: string;
      studentNumber: string;
      totalFee: number;
      components: { name: string; amount: number }[];
      installments: { sequence: number; label: string; amount: number; dueDate: string }[];
      schoolId?: string;
    }) {
      const schId = options.schoolId ?? schoolAId;

      const cls = await db.class.create({
        data: {
          programId: programAId,
          name: `Class ${options.admissionNumber}`,
        },
      });

      const sec = await db.section.create({
        data: {
          classId: cls.id,
          name: 'Section A',
        },
      });

      const fs = await db.feeStructure.create({
        data: {
          academicYearId: yearAId,
          programId: programAId,
          classId: cls.id,
          name: `Fee ${options.admissionNumber}`,
          totalAmount: new Decimal(options.totalFee),
        },
      });

      const feeComponents: any[] = [];
      for (const comp of options.components) {
        const fc = await db.feeComponent.create({
          data: {
            feeStructureId: fs.id,
            name: comp.name,
            amount: new Decimal(comp.amount),
            discountApplicable: false,
            isMandatory: true,
          },
        });
        feeComponents.push(fc);
      }

      const adm = await db.admission.create({
        data: {
          schoolId: schId,
          academicYearId: yearAId,
          programId: programAId,
          classId: cls.id,
          sectionId: sec.id,
          studentName: 'Student ' + options.studentNumber,
          gender: 'MALE',
          dateOfBirth: new Date('2010-01-01'),
          parentName: 'Parent ' + options.studentNumber,
          parentRelation: 'FATHER',
          parentPhone: '9876543210',
          addressLine1: 'Address',
          city: 'City',
          state: 'State',
          country: 'Country',
          admissionNumber: options.admissionNumber,
          admissionSequence: Math.floor(Math.random() * 100000),
          admissionStatus: AdmissionStatus.CONFIRMED,
          createdById: officeAdminAId,
        },
      });

      const student = await db.student.create({
        data: {
          admissionId: adm.id,
          studentName: adm.studentName,
          studentNumber: options.studentNumber,
          gender: 'MALE',
          dateOfBirth: adm.dateOfBirth,
        },
      });

      const header = await db.feePaymentHeader.create({
        data: {
          admissionId: adm.id,
          academicYearId: yearAId,
          feeStructureId: fs.id,
          grossAmount: new Decimal(options.totalFee),
          discountAmount: new Decimal(0),
          netAmount: new Decimal(options.totalFee),
          totalFeeAmount: new Decimal(options.totalFee),
          totalPaidAmount: new Decimal(0),
          totalDueAmount: new Decimal(options.totalFee),
          isActive: true,
        },
      });

      for (const fc of feeComponents) {
        await db.feePaymentDetails.create({
          data: {
            feePaymentHeaderId: header.id,
            feeComponentId: fc.id,
            nameSnapshot: fc.name,
            originalAmount: fc.amount,
            discountApplicable: false,
            isMandatory: true,
            discountAmount: new Decimal(0),
            finalAmount: fc.amount,
            totalAmountToBePaid: fc.amount,
            amountPaid: new Decimal(0),
            paymentDate: new Date(),
          },
        });
      }

      const schedule = await db.admissionInstallmentSchedule.create({
        data: {
          schoolId: schId,
          admissionId: adm.id,
          feePaymentHeaderId: header.id,
          scheduleType: InstallmentScheduleType.CUSTOM,
          totalAmount: new Decimal(options.totalFee),
          installmentCount: options.installments.length,
        },
      });

      for (const inst of options.installments) {
        await db.admissionInstallment.create({
          data: {
            scheduleId: schedule.id,
            feePaymentHeaderId: header.id,
            sequence: inst.sequence,
            subSequence: 0,
            offsetAmount: new Decimal(0),
            label: inst.label,
            amount: new Decimal(inst.amount),
            dueDate: new Date(inst.dueDate),
            status: InstallmentRowStatus.PENDING,
          },
        });
      }

      const freshSchedule = await db.admissionInstallmentSchedule.findUnique({
        where: { id: schedule.id },
        include: { installments: true },
      });

      const initialEvent = await db.installmentLineageEvent.create({
        data: {
          scheduleId: schedule.id,
          eventType: LineageEventType.INITIAL_SCHEDULE,
          description: 'Initial schedule creation',
        },
      });

      await db.installmentLineageTransferEdge.createMany({
        data: freshSchedule!.installments.map((inst) => ({
          eventId: initialEvent.id,
          scheduleId: schedule.id,
          sourceInstallmentId: null,
          resultInstallmentId: inst.id,
          amount: inst.amount,
        })),
      });

      return { admission: adm, student, header, schedule: freshSchedule! };
    }

    // =========================================================================
    // PART 1: MIGRATION & HISTORICAL OFFSET BACKFILL INTEGRATION TESTS
    // =========================================================================
    console.log('\n--- Part 1: Migration & Historical Offset Backfill Tests ---');

    // MIG-01: Verify schema additions exist
    {
      const checkCols = await db.$queryRaw<any[]>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'AdmissionInstallment' AND column_name = 'offsetAmount'
      `;
      assert.equal(checkCols.length, 1, 'AdmissionInstallment.offsetAmount column must exist');
      console.log('✓ MIG-01 passed: Schema migration applied, offsetAmount column exists.');
    }

    // MIG-02: Backfill on un-split schedule (all offsets stay 0)
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-MIG02-' + Date.now(),
        studentNumber: 'STU-MIG02-' + Date.now(),
        totalFee: 30000,
        components: [{ name: 'Tuition', amount: 30000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 15000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 15000, dueDate: '2026-09-15' },
        ],
      });

      const result = await backfillService.backfillScheduleOffsets(fixture.schedule.id);
      assert.equal(result.success, true);

      const insts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id },
        orderBy: { sequence: 'asc' },
      });
      assert.equal(new Decimal(insts[0].offsetAmount).toNumber(), 0);
      assert.equal(new Decimal(insts[1].offsetAmount).toNumber(), 0);
      console.log('✓ MIG-02 passed: Un-split schedule backfill verified (offsets remain 0).');
    }

    // MIG-03: Backfill on partial split history
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-MIG03-' + Date.now(),
        studentNumber: 'STU-MIG03-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 20000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'mig03-pay-' + Date.now() },
        officeAdminAId,
      );

      // Force offsets to 0 to simulate pre-migration state
      await db.admissionInstallment.updateMany({
        where: { scheduleId: fixture.schedule.id },
        data: { offsetAmount: new Decimal(0) },
      });

      const result = await backfillService.backfillScheduleOffsets(fixture.schedule.id);
      assert.equal(result.success, true);

      const insts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id },
        orderBy: { subSequence: 'asc' },
      });
      // Root: subSequence 0, SUPERSEDED, offset 0
      // Settled child: subSequence 1, PAID or PAID_EARLY, offset 0
      // Remaining child: subSequence 2, PENDING, offset 5000
      assert.equal(insts[0].status, InstallmentRowStatus.SUPERSEDED);
      assert.equal(new Decimal(insts[0].offsetAmount).toNumber(), 0);
      const paidChild = insts[1];
      assert.ok(paidChild.status === InstallmentRowStatus.PAID || paidChild.status === InstallmentRowStatus.PAID_EARLY);
      assert.equal(new Decimal(paidChild.offsetAmount).toNumber(), 0);
      const remainingChild = insts[2];
      assert.equal(remainingChild.status, InstallmentRowStatus.PENDING);
      assert.equal(new Decimal(remainingChild.offsetAmount).toNumber(), 5000);
      console.log('✓ MIG-03 passed: Single partial split history backfilled correctly (offsets 0 and 5000).');
    }

    // MIG-04: Backfill multi-payment splits with interval validation
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-MIG04-' + Date.now(),
        studentNumber: 'STU-MIG04-' + Date.now(),
        totalFee: 30000,
        components: [{ name: 'Tuition', amount: 30000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 30000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'mig04-p1-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'mig04-p2-' + Date.now() },
        officeAdminAId,
      );

      // Reset offsets to simulate pre-migration state
      await db.admissionInstallment.updateMany({
        where: { scheduleId: fixture.schedule.id },
        data: { offsetAmount: new Decimal(0) },
      });

      const result = await backfillService.backfillScheduleOffsets(fixture.schedule.id);
      assert.equal(result.success, true);

      // Check active leaves:
      const activeLeaves = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id, supersededAt: null },
        orderBy: { offsetAmount: 'asc' },
      });
      assert.equal(activeLeaves.length, 3);
      assert.equal(new Decimal(activeLeaves[0].offsetAmount).toNumber(), 0);
      assert.equal(new Decimal(activeLeaves[1].offsetAmount).toNumber(), 5000);
      assert.equal(new Decimal(activeLeaves[2].offsetAmount).toNumber(), 15000);
      console.log('✓ MIG-04 passed: Multi-split intervals partitioned correctly [0,5000) [5000,15000) [15000,30000).');
    }

    // MIG-06: Malformed graph triggers rollback + BackfillExceptionLog
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-MIG06-' + Date.now(),
        studentNumber: 'STU-MIG06-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Insert a corrupt PAYMENT_AUTO_SPLIT event with wrong edge amount
      const corruptEvent = await db.installmentLineageEvent.create({
        data: {
          scheduleId: fixture.schedule.id,
          eventType: LineageEventType.PAYMENT_AUTO_SPLIT,
          description: 'Corrupt event for MIG-06 test',
        },
      });

      await db.installmentLineageTransferEdge.create({
        data: {
          eventId: corruptEvent.id,
          scheduleId: fixture.schedule.id,
          sourceInstallmentId: fixture.schedule.installments[0].id,
          resultInstallmentId: fixture.schedule.installments[0].id,
          amount: new Decimal(999999),
        },
      });

      const result = await backfillService.backfillScheduleOffsets(fixture.schedule.id);
      assert.equal(result.success, false);
      assert.ok(result.error);

      const log = await db.backfillExceptionLog.findFirst({
        where: { feePaymentHeaderId: fixture.header.id },
      });
      assert.ok(log, 'BackfillExceptionLog must be created on failure');
      console.log('✓ MIG-06 passed: Malformed graph failure rolled back; BackfillExceptionLog persisted.');
    }

    // =========================================================================
    // PART 2: PAYMENT REVERSAL FUNCTIONAL INTEGRATION SCENARIOS
    // =========================================================================
    console.log('\n--- Part 2: Payment Reversal Functional Integration Scenarios ---');

    // Case A (REV-01): Full single-installment payment reversal
    {
      console.log('\n--- Scenario Case A: Full Single-Installment Payment Reversal ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVA-' + Date.now(),
        studentNumber: 'STU-REVA-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'reva-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({
        where: { admissionId: fixture.admission.id },
      });
      assert.ok(payment);

      const headerAfterPay = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(headerAfterPay!.totalPaidAmount).toNumber(), 10000);
      assert.equal(new Decimal(headerAfterPay!.totalDueAmount).toNumber(), 0);

      const revKey = 'reva-rev-' + Date.now();
      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payment.id,
        { idempotencyKey: revKey, reason: 'Check bounced on deposit' },
        collegeAdminAId,
      );

      // Header balances restored
      const headerAfterRev = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(headerAfterRev!.totalPaidAmount).toNumber(), 0);
      assert.equal(new Decimal(headerAfterRev!.totalDueAmount).toNumber(), 10000);

      // Component detail restored
      const detail = await db.feePaymentDetails.findFirst({ where: { feePaymentHeaderId: fixture.header.id } });
      assert.equal(new Decimal(detail!.amountPaid).toNumber(), 0);

      // Original installment SUPERSEDED, restored child PENDING
      const insts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id },
        orderBy: { subSequence: 'asc' },
      });
      assert.equal(insts.length, 2);
      assert.equal(insts[0].status, InstallmentRowStatus.SUPERSEDED);
      assert.ok(insts[0].supersededAt !== null);

      const restoredChild = insts[1];
      assert.equal(restoredChild.status, InstallmentRowStatus.PENDING);
      assert.equal(new Decimal(restoredChild.amount).toNumber(), 10000);
      assert.equal(restoredChild.sequence, 1);
      assert.equal(new Decimal(restoredChild.offsetAmount).toNumber(), 0);

      // Lineage Event & Transfer Edge (1:1 REVERSAL_RESTORE)
      const revEvent = await db.installmentLineageEvent.findFirst({
        where: { scheduleId: fixture.schedule.id, eventType: LineageEventType.REVERSAL_RESTORE },
        include: { transferEdges: true },
      });
      assert.ok(revEvent);
      assert.equal(revEvent.feePaymentId, payment.id);
      assert.equal(revEvent.transferEdges.length, 1);
      assert.equal(revEvent.transferEdges[0].sourceInstallmentId, insts[0].id);
      assert.equal(revEvent.transferEdges[0].resultInstallmentId, restoredChild.id);
      assert.equal(new Decimal(revEvent.transferEdges[0].amount).toNumber(), 10000);

      // PaymentReversalEvent
      const pRevEvent = await db.paymentReversalEvent.findUnique({
        where: { feePaymentId: payment.id },
        include: { allocations: true },
      });
      assert.ok(pRevEvent);
      assert.equal(pRevEvent.idempotencyKey, revKey);
      assert.equal(pRevEvent.reversedByUserId, collegeAdminAId);
      assert.equal(new Decimal(pRevEvent.reversalAmount).toNumber(), 10000);
      assert.equal(pRevEvent.allocations.length, 1);

      // FinancialLog
      const finLog = await db.financialLog.findFirst({
        where: { sourceId: payment.id, type: FinancialLogType.FEE_PAYMENT_REVERSAL },
      });
      assert.ok(finLog);
      assert.equal(finLog.flowType, FinancialFlowType.REVERSAL);
      assert.equal(new Decimal(finLog.amount).toNumber(), 10000);

      console.log('✓ Case A passed: Full single-installment payment reversed with exact 1:1 lineage restoration.');
    }

    // Case B (REV-02): Partial split payment reversal and subsequent FIFO ordering
    {
      console.log('\n--- Scenario Case B: Partial Split Payment Reversal + FIFO Priority ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVB-' + Date.now(),
        studentNumber: 'STU-REVB-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 20000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'revb-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({
        where: { admissionId: fixture.admission.id },
      });
      assert.ok(payment);

      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payment.id,
        { idempotencyKey: 'revb-rev-' + Date.now(), reason: 'Partial payment reversal' },
        collegeAdminAId,
      );

      // After reversal: restored child (offset 0, amount 5000) + remaining child (offset 5000, amount 15000)
      const activeInsts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id, supersededAt: null },
        orderBy: [
          { dueDate: 'asc' },
          { sequence: 'asc' },
          { offsetAmount: 'asc' },
          { id: 'asc' },
        ],
      });
      assert.equal(activeInsts.length, 2);
      assert.equal(new Decimal(activeInsts[0].offsetAmount).toNumber(), 0);
      assert.equal(new Decimal(activeInsts[0].amount).toNumber(), 5000);
      assert.equal(new Decimal(activeInsts[1].offsetAmount).toNumber(), 5000);
      assert.equal(new Decimal(activeInsts[1].amount).toNumber(), 15000);

      // Pay ₹3,000 — FIFO allocator MUST select offset 0 first
      const nextPayKey = 'revb-subpay-' + Date.now();
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3000', idempotencyKey: nextPayKey },
        officeAdminAId,
      );

      const nextPay = await db.feePayment.findFirst({ where: { idempotencyKey: nextPayKey } });
      assert.ok(nextPay);
      const nextAlloc = await db.feePaymentInstallmentAllocation.findFirst({
        where: { feePaymentId: nextPay.id },
        include: { installment: true },
      });
      assert.ok(nextAlloc);
      // The allocation must target the installment with offsetAmount = 0
      assert.equal(new Decimal(nextAlloc.installment.offsetAmount).toNumber(), 0);

      console.log('✓ Case B passed: Partial split reversal restores FIFO priority via offsetAmount coordinate.');
    }

    // Case C: Multi-installment payment reversal
    {
      console.log('\n--- Scenario Case C: Multi-Installment Payment Reversal ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVC-' + Date.now(),
        studentNumber: 'STU-REVC-' + Date.now(),
        totalFee: 30000,
        components: [{ name: 'Tuition', amount: 30000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
          { sequence: 3, label: 'Inst 3', amount: 10000, dueDate: '2026-10-15' },
        ],
      });

      // Pay 15,000 (settles Inst 1 for 10000, splits Inst 2 for 5000)
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '15000', idempotencyKey: 'revc-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({
        where: { admissionId: fixture.admission.id },
      });
      assert.ok(payment);

      const allocsBeforeRev = await db.feePaymentInstallmentAllocation.findMany({
        where: { feePaymentId: payment.id },
      });
      assert.equal(allocsBeforeRev.length, 2);

      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payment.id,
        { idempotencyKey: 'revc-rev-' + Date.now(), reason: 'Multi-allocation reversal' },
        collegeAdminAId,
      );

      // Both allocations must be fully reversed
      const allocsAfterRev = await db.feePaymentInstallmentAllocation.findMany({
        where: { feePaymentId: payment.id },
        orderBy: { allocatedAmount: 'desc' },
      });
      assert.equal(new Decimal(allocsAfterRev[0].reversedAmount).toNumber(), 10000);
      assert.equal(new Decimal(allocsAfterRev[1].reversedAmount).toNumber(), 5000);
      for (const a of allocsAfterRev) {
        assert.equal(new Decimal(a.reversedAmount).toNumber(), new Decimal(a.allocatedAmount).toNumber());
      }

      // Header restored
      const header = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(header!.totalPaidAmount).toNumber(), 0);
      assert.equal(new Decimal(header!.totalDueAmount).toNumber(), 30000);

      console.log('✓ Case C passed: Multi-installment payment reversed with all allocations restored.');
    }

    // Case D: Subsequent payment preservation
    {
      console.log('\n--- Scenario Case D: Subsequent Payment Preservation ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVD-' + Date.now(),
        studentNumber: 'STU-REVD-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
        ],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'revd-p1-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'revd-p2-' + Date.now() },
        officeAdminAId,
      );

      const payments = await db.feePayment.findMany({
        where: { admissionId: fixture.admission.id },
        orderBy: { createdAt: 'asc' },
      });
      assert.equal(payments.length, 2);

      // Reverse first payment only
      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payments[0].id,
        { idempotencyKey: 'revd-rev1-' + Date.now(), reason: 'Reversing first payment only' },
        collegeAdminAId,
      );

      // Payment 2 allocation remains valid (reversedAmount = 0, installment PAID)
      const p2Alloc = await db.feePaymentInstallmentAllocation.findFirst({
        where: { feePaymentId: payments[1].id },
        include: { installment: true },
      });
      assert.ok(p2Alloc);
      assert.equal(new Decimal(p2Alloc.reversedAmount).toNumber(), 0);
      assert.ok(
        p2Alloc.installment.status === InstallmentRowStatus.PAID ||
        p2Alloc.installment.status === InstallmentRowStatus.PAID_EARLY,
      );
      assert.equal(p2Alloc.installment.supersededAt, null);

      // Header: 10,000 paid, 10,000 due
      const header = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(header!.totalPaidAmount).toNumber(), 10000);
      assert.equal(new Decimal(header!.totalDueAmount).toNumber(), 10000);

      console.log('✓ Case D passed: Subsequent valid payment preserved when earlier payment is reversed.');
    }

    // Case E: Double Reversal Prevention
    {
      console.log('\n--- Scenario Case E: Double Reversal Prevention ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVE-' + Date.now(),
        studentNumber: 'STU-REVE-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'reve-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(payment);

      // First reversal succeeds
      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payment.id,
        { idempotencyKey: 'reve-rev1-' + Date.now(), reason: 'First reversal' },
        collegeAdminAId,
      );

      // Second reversal must throw ConflictException
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: 'reve-rev2-' + Date.now(), reason: 'Second reversal attempt' },
          collegeAdminAId,
        ),
        (err: any) => err instanceof ConflictException && err.message.includes('already been reversed'),
      );

      console.log('✓ Case E passed: Double reversal rejected with ConflictException.');
    }

    // Case F: Idempotency Replay & Canonical Payload Authorization (Phase 2)
    {
      console.log('\n--- Scenario Case F: Idempotency Replay and Canonical Payload Authorization ---');
      const fixture1 = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVF1-' + Date.now(),
        studentNumber: 'STU-REVF1-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
        ],
      });

      const fixture2 = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVF2-' + Date.now(),
        studentNumber: 'STU-REVF2-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture1.student.id,
        { amount: '10000', idempotencyKey: 'revf-pay1A-' + Date.now() },
        officeAdminAId,
      );

      await studentService.recordStudentFeePayment(
        fixture1.student.id,
        { amount: '10000', idempotencyKey: 'revf-pay1B-' + Date.now() },
        officeAdminAId,
      );

      await studentService.recordStudentFeePayment(
        fixture2.student.id,
        { amount: '10000', idempotencyKey: 'revf-pay2-' + Date.now() },
        officeAdminAId,
      );

      const payments1 = await db.feePayment.findMany({
        where: { admissionId: fixture1.admission.id },
        orderBy: { createdAt: 'asc' },
      });
      const pay1 = payments1[0];
      const pay1B = payments1[1];
      const pay2 = await db.feePayment.findFirst({ where: { admissionId: fixture2.admission.id } });
      assert.ok(pay1 && pay1B && pay2);

      const sharedKey = 'revf-key-' + Date.now();

      // 1. Initial reversal for fixture1/pay1
      await reversalService.reverseStudentFeePayment(
        fixture1.student.id,
        pay1.id,
        { idempotencyKey: sharedKey, reason: 'Original reversal reason' },
        collegeAdminAId,
      );

      // 2. Safe replay with same key + same canonical parameters — returns student fees
      const replayRes = await reversalService.reverseStudentFeePayment(
        fixture1.student.id,
        pay1.id,
        { idempotencyKey: sharedKey, reason: '  Original reversal reason  ' }, // verifies reason trimming
        collegeAdminAId,
      );
      assert.ok(replayRes);

      // 3. Replay with different reason must throw ConflictException (409)
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture1.student.id,
          pay1.id,
          { idempotencyKey: sharedKey, reason: 'Mismatched reason payload' },
          collegeAdminAId,
        ),
        (err: any) => err instanceof ConflictException,
      );

      // 4. Replay with same key but different payment of same student must throw ConflictException (409)
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture1.student.id,
          pay1B.id,
          { idempotencyKey: sharedKey, reason: 'Original reversal reason' },
          collegeAdminAId,
        ),
        (err: any) => err instanceof ConflictException,
      );

      // 5. Replay with same key but different student must throw NotFoundException or ConflictException
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture2.student.id,
          pay1.id,
          { idempotencyKey: sharedKey, reason: 'Original reversal reason' },
          collegeAdminAId,
        ),
        (err: any) => err instanceof NotFoundException || err instanceof ConflictException,
      );

      // 6. Cross-school replay attempt rejected without information leakage (404)
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture1.student.id,
          pay1.id,
          { idempotencyKey: sharedKey, reason: 'Original reversal reason' },
          collegeAdminBId,
        ),
        (err: any) => err instanceof NotFoundException,
      );

      // 7. Unauthorized actor without school rejected with 403
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture1.student.id,
          pay1.id,
          { idempotencyKey: sharedKey, reason: 'Original reversal reason' },
          'usr-non-existent-' + Date.now(),
        ),
        (err: any) => err instanceof ForbiddenException,
      );

      console.log('✓ Case F passed: Safe replay succeeds; all canonical parameter mismatches rejected with 409/404/403.');
    }

    // Case G: RBAC & Tenant Isolation
    {
      console.log('\n--- Scenario Case G: RBAC & Tenant Isolation ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVG-' + Date.now(),
        studentNumber: 'STU-REVG-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'revg-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(payment);

      // Cross-school user (College Admin B from School B) must be rejected
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: 'revg-cross-' + Date.now(), reason: 'Cross-school attack' },
          collegeAdminBId,
        ),
        (err: any) => err instanceof NotFoundException,
      );

      // Non-existent user must be rejected with ForbiddenException
      await assert.rejects(
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: 'revg-nosch-' + Date.now(), reason: 'No school user' },
          'usr-non-existent-' + Date.now(),
        ),
        (err: any) => err instanceof ForbiddenException,
      );

      console.log('✓ Case G passed: Cross-school rejected with 404; un-scoped user rejected with 403.');
    }

    // Case H: Reverse-FIFO Component Rollback
    {
      console.log('\n--- Scenario Case H: Reverse-FIFO Component Rollback Order ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-REVH-' + Date.now(),
        studentNumber: 'STU-REVH-' + Date.now(),
        totalFee: 15000,
        components: [
          { name: 'Tuition', amount: 10000 },
          { name: 'Lab Fee', amount: 5000 },
        ],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 15000, dueDate: '2026-08-15' }],
      });

      // Pay 12,000 (fills Tuition 10,000 then Lab Fee 2,000)
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '12000', idempotencyKey: 'revh-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(payment);

      // Verify components before reversal
      const detailsBefore = await db.feePaymentDetails.findMany({
        where: { feePaymentHeaderId: fixture.header.id },
        orderBy: { createdAt: 'asc' },
      });
      const tuitionBefore = detailsBefore.find((d) => d.nameSnapshot === 'Tuition');
      const labBefore = detailsBefore.find((d) => d.nameSnapshot === 'Lab Fee');
      assert.ok(tuitionBefore && labBefore);
      assert.equal(new Decimal(tuitionBefore.amountPaid).toNumber(), 10000);
      assert.equal(new Decimal(labBefore.amountPaid).toNumber(), 2000);

      // Reverse
      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        payment.id,
        { idempotencyKey: 'revh-rev-' + Date.now(), reason: 'Reverse component attribution' },
        collegeAdminAId,
      );

      // Both components should return to 0
      const detailsAfter = await db.feePaymentDetails.findMany({
        where: { feePaymentHeaderId: fixture.header.id },
        orderBy: { createdAt: 'asc' },
      });
      for (const d of detailsAfter) {
        assert.equal(new Decimal(d.amountPaid).toNumber(), 0, `${d.nameSnapshot} amountPaid should be 0`);
      }

      console.log('✓ Case H passed: Component counters rolled back in reverse-FIFO order (all zeroed).');
    }

    // =========================================================================
    // PART 3: REAL CONCURRENCY INTEGRATION TESTS (PHASE 4: CONC-01 to CONC-06)
    // =========================================================================
    console.log('\n--- Part 3: Real Concurrency Integration Tests (Phase 4) ---');

    // CONC-01: Identical simultaneous reversal requests
    {
      console.log('\n--- CONC-01: Identical Simultaneous Reversal Requests ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC1-' + Date.now(),
        studentNumber: 'STU-CONC1-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'conc1-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(payment);

      const sharedKey = 'conc1-key-' + Date.now();
      const reason = 'Simultaneous duplicate reversal requests';

      // Fire both concurrently
      const [res1, res2] = await Promise.all([
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: sharedKey, reason },
          collegeAdminAId,
        ),
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: sharedKey, reason },
          collegeAdminAId,
        ),
      ]);

      assert.ok(res1 && res2);

      // Verify exactly ONE reversal event exists
      const revEvents = await db.paymentReversalEvent.findMany({
        where: { feePaymentId: payment.id },
      });
      assert.equal(revEvents.length, 1);
      assert.equal(revEvents[0].idempotencyKey, sharedKey);

      console.log('✓ CONC-01 passed: Simultaneous identical reversals safely deduplicated to exactly 1 event.');
    }

    // CONC-02: Same idempotency key across different admissions
    {
      console.log('\n--- CONC-02: Same Idempotency Key Across Admissions ---');
      const fixture1 = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC2A-' + Date.now(),
        studentNumber: 'STU-CONC2A-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });
      const fixture2 = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC2B-' + Date.now(),
        studentNumber: 'STU-CONC2B-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture1.student.id,
        { amount: '10000', idempotencyKey: 'conc2-pay1-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture2.student.id,
        { amount: '10000', idempotencyKey: 'conc2-pay2-' + Date.now() },
        officeAdminAId,
      );

      const pay1 = await db.feePayment.findFirst({ where: { admissionId: fixture1.admission.id } });
      const pay2 = await db.feePayment.findFirst({ where: { admissionId: fixture2.admission.id } });
      assert.ok(pay1 && pay2);

      const sharedKey = 'conc2-shared-' + Date.now();

      const results = await Promise.allSettled([
        reversalService.reverseStudentFeePayment(
          fixture1.student.id,
          pay1.id,
          { idempotencyKey: sharedKey, reason: 'Reversal 1' },
          collegeAdminAId,
        ),
        reversalService.reverseStudentFeePayment(
          fixture2.student.id,
          pay2.id,
          { idempotencyKey: sharedKey, reason: 'Reversal 2' },
          collegeAdminAId,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one request should succeed');
      assert.equal(rejected.length, 1, 'Losing request must be rejected');
      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejectedError instanceof ConflictException,
        `Expected ConflictException, got ${rejectedError}`,
      );

      console.log('✓ CONC-02 passed: Same key across different admissions cleanly rejected winner collision.');
    }

    // CONC-03: Different keys attempting to reverse the same payment
    {
      console.log('\n--- CONC-03: Different Keys Reversing Same Payment ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC3-' + Date.now(),
        studentNumber: 'STU-CONC3-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'conc3-pay-' + Date.now() },
        officeAdminAId,
      );

      const payment = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(payment);

      const results = await Promise.allSettled([
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: 'conc3-keyA-' + Date.now(), reason: 'Attempt A' },
          collegeAdminAId,
        ),
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payment.id,
          { idempotencyKey: 'conc3-keyB-' + Date.now(), reason: 'Attempt B' },
          collegeAdminAId,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejectedError instanceof ConflictException &&
          rejectedError.message.includes('already been reversed'),
      );

      console.log('✓ CONC-03 passed: Concurrent different keys on same payment serialized; exactly 1 succeeded.');
    }

    // CONC-04: Concurrent payment and reversal under same admission
    {
      console.log('\n--- CONC-04: Concurrent Payment and Reversal ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC4-' + Date.now(),
        studentNumber: 'STU-CONC4-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
        ],
      });

      // Settle installment 1 first
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'conc4-pay1-' + Date.now() },
        officeAdminAId,
      );

      const pay1 = await db.feePayment.findFirst({ where: { admissionId: fixture.admission.id } });
      assert.ok(pay1);

      // Now concurrently reverse pay1 while recording payment 2 (5,000)
      const results = await Promise.all([
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          pay1.id,
          { idempotencyKey: 'conc4-rev1-' + Date.now(), reason: 'Concurrent reversal' },
          collegeAdminAId,
        ),
        studentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: '5000', idempotencyKey: 'conc4-pay2-' + Date.now() },
          officeAdminAId,
        ),
      ]);
      assert.ok(results[0] && results[1]);

      // Assert final reconciliation
      const header = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(header!.totalPaidAmount).toNumber(), 5000);
      assert.equal(new Decimal(header!.totalDueAmount).toNumber(), 15000);

      // Active leaves check
      const activeLeaves = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id, supersededAt: null },
      });
      const pendingSum = activeLeaves
        .filter((l) => l.status === InstallmentRowStatus.PENDING)
        .reduce((sum, l) => sum.plus(new Decimal(l.amount)), new Decimal(0));
      assert.equal(pendingSum.toNumber(), 15000);

      console.log('✓ CONC-04 passed: Concurrent payment and reversal serialized without deadlock; aggregates reconciled.');
    }

    // CONC-05: Two different reversals under one admission concurrently
    {
      console.log('\n--- CONC-05: Two Concurrent Reversals Under One Admission ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC5-' + Date.now(),
        studentNumber: 'STU-CONC5-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
        ],
      });

      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'conc5-pay1-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'conc5-pay2-' + Date.now() },
        officeAdminAId,
      );

      const payments = await db.feePayment.findMany({
        where: { admissionId: fixture.admission.id },
        orderBy: { createdAt: 'asc' },
      });
      assert.equal(payments.length, 2);

      // Concurrently reverse both payments
      await Promise.all([
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payments[0].id,
          { idempotencyKey: 'conc5-rev1-' + Date.now(), reason: 'Reverse payment 1' },
          collegeAdminAId,
        ),
        reversalService.reverseStudentFeePayment(
          fixture.student.id,
          payments[1].id,
          { idempotencyKey: 'conc5-rev2-' + Date.now(), reason: 'Reverse payment 2' },
          collegeAdminAId,
        ),
      ]);

      const header = await db.feePaymentHeader.findUnique({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(header!.totalPaidAmount).toNumber(), 0);
      assert.equal(new Decimal(header!.totalDueAmount).toNumber(), 20000);

      console.log('✓ CONC-05 passed: Two reversals under same admission serialized cleanly; both restored.');
    }

    // CONC-06: Repeated partial split and reversal
    {
      console.log('\n--- CONC-06: Repeated Partial Split and Reversal ---');
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-CONC6-' + Date.now(),
        studentNumber: 'STU-CONC6-' + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 20000, dueDate: '2026-08-15' }],
      });

      // 1. Partial payment 1 (5,000)
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'conc6-p1-' + Date.now() },
        officeAdminAId,
      );

      // 2. Partial payment 2 (5,000)
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'conc6-p2-' + Date.now() },
        officeAdminAId,
      );

      const p1 = await db.feePayment.findFirst({ where: { idempotencyKey: { startsWith: 'conc6-p1-' } } });
      assert.ok(p1);

      // 3. Reverse payment 1 (restores offset 0)
      await reversalService.reverseStudentFeePayment(
        fixture.student.id,
        p1.id,
        { idempotencyKey: 'conc6-rev1-' + Date.now(), reason: 'Reverse partial 1' },
        collegeAdminAId,
      );

      // 4. Pay 3,000 (payment 3) — allocator must prioritize offset 0
      const p3Key = 'conc6-p3-' + Date.now();
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3000', idempotencyKey: p3Key },
        officeAdminAId,
      );

      const p3 = await db.feePayment.findFirst({ where: { idempotencyKey: p3Key } });
      const alloc3 = await db.feePaymentInstallmentAllocation.findFirst({
        where: { feePaymentId: p3!.id },
        include: { installment: true },
      });
      assert.ok(alloc3);
      assert.equal(new Decimal(alloc3.installment.offsetAmount).toNumber(), 0);

      // 5. Verify interval partition has no gaps or overlaps
      const allEdges = await db.installmentLineageTransferEdge.findMany({
        where: { scheduleId: fixture.schedule.id },
      });
      backfillService.validateSequenceIntervalIntegrity(
        1,
        new Decimal(20000),
        await db.admissionInstallment.findMany({ where: { scheduleId: fixture.schedule.id } }),
        allEdges,
      );

      console.log('✓ CONC-06 passed: Repeated split/reversal conserved interval partition; FIFO prioritized offset 0.');
    }

    // =========================================================================
    // PART 4: COMPREHENSIVE NEGATIVE-PATH BACKFILL TESTS (PHASE 5)
    // =========================================================================
    console.log('\n--- Part 4: Comprehensive Negative-Path Backfill Tests (Phase 5) ---');

    async function createNegativeTestFixture(testTag: string) {
      return setupAdmissionWithSchedule({
        admissionNumber: `ADM-NEG-${testTag}-` + Date.now(),
        studentNumber: `STU-NEG-${testTag}-` + Date.now(),
        totalFee: 20000,
        components: [{ name: 'Tuition', amount: 20000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' },
          { sequence: 2, label: 'Inst 2', amount: 10000, dueDate: '2026-09-15' },
        ],
      });
    }

    // NEG-01: Cross-sequence lineage edge
    {
      const fix = await createNegativeTestFixture('01');
      const insts = await db.admissionInstallment.findMany({ where: { scheduleId: fix.schedule.id }, orderBy: { sequence: 'asc' } });
      const ev = await db.installmentLineageEvent.create({
        data: { scheduleId: fix.schedule.id, eventType: LineageEventType.PAYMENT_AUTO_SPLIT, description: 'Cross sequence event' },
      });
      await db.installmentLineageTransferEdge.create({
        data: { eventId: ev.id, scheduleId: fix.schedule.id, sourceInstallmentId: insts[0].id, resultInstallmentId: insts[1].id, amount: new Decimal(5000) },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_SPLIT_EDGE_CARDINALITY') || res.error?.includes('ERR_CROSS_SEQUENCE_EDGE'));
      console.log('✓ NEG-01 passed: Cross-sequence / invalid split edge cardinality rejected.');
    }

    // NEG-02: Multiple incoming edges
    {
      const fix = await createNegativeTestFixture('02');
      const insts = await db.admissionInstallment.findMany({ where: { scheduleId: fix.schedule.id }, orderBy: { sequence: 'asc' } });
      const child = await db.admissionInstallment.create({
        data: {
          scheduleId: fix.schedule.id,
          feePaymentHeaderId: fix.header.id,
          sequence: 1,
          subSequence: 1,
          offsetAmount: new Decimal(0),
          rootInstallmentId: insts[0].id,
          label: 'Child',
          amount: new Decimal(10000),
          dueDate: insts[0].dueDate,
          status: InstallmentRowStatus.PENDING,
        },
      });
      const ev1 = await db.installmentLineageEvent.create({
        data: { scheduleId: fix.schedule.id, eventType: LineageEventType.REVERSAL_RESTORE, description: 'Restore 1' },
      });
      const ev2 = await db.installmentLineageEvent.create({
        data: { scheduleId: fix.schedule.id, eventType: LineageEventType.REVERSAL_RESTORE, description: 'Restore 2' },
      });
      await db.installmentLineageTransferEdge.createMany({
        data: [
          { eventId: ev1.id, scheduleId: fix.schedule.id, sourceInstallmentId: insts[0].id, resultInstallmentId: child.id, amount: new Decimal(10000) },
          { eventId: ev2.id, scheduleId: fix.schedule.id, sourceInstallmentId: insts[0].id, resultInstallmentId: child.id, amount: new Decimal(10000) },
        ],
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_INVALID_IN_DEGREE') || res.error?.includes('ERR_CLASSIFICATION_COUNT_MISMATCH'));
      console.log('✓ NEG-02 passed: Multiple incoming edges rejected.');
    }

    // NEG-03: Cycle
    {
      const fix = await createNegativeTestFixture('03');
      const insts = await db.admissionInstallment.findMany({ where: { scheduleId: fix.schedule.id }, orderBy: { sequence: 'asc' } });
      const ev = await db.installmentLineageEvent.create({
        data: { scheduleId: fix.schedule.id, eventType: LineageEventType.REVERSAL_RESTORE, description: 'Self cycle' },
      });
      await db.installmentLineageTransferEdge.create({
        data: { eventId: ev.id, scheduleId: fix.schedule.id, sourceInstallmentId: insts[0].id, resultInstallmentId: insts[0].id, amount: insts[0].amount },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_ROOT_HAS_INCOMING_EDGES') || res.error?.includes('ERR_CYCLE_OR_UNREACHABLE_NODE'));
      console.log('✓ NEG-03 passed: Cycle detected and rejected.');
    }

    // NEG-04: Disconnected installment
    {
      const fix = await createNegativeTestFixture('04');
      const insts = await db.admissionInstallment.findMany({ where: { scheduleId: fix.schedule.id }, orderBy: { sequence: 'asc' } });
      await db.admissionInstallment.create({
        data: {
          scheduleId: fix.schedule.id,
          feePaymentHeaderId: fix.header.id,
          sequence: 1,
          subSequence: 5,
          offsetAmount: new Decimal(0),
          rootInstallmentId: insts[0].id,
          label: 'Orphan',
          amount: new Decimal(5000),
          dueDate: insts[0].dueDate,
          status: InstallmentRowStatus.PENDING,
        },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_INVALID_IN_DEGREE') || res.error?.includes('ERR_CYCLE_OR_UNREACHABLE_NODE'));
      console.log('✓ NEG-04 passed: Disconnected/orphan installment rejected.');
    }

    // NEG-05: Unsupported event type
    {
      const fix = await createNegativeTestFixture('05');
      await db.installmentLineageEvent.create({
        data: {
          scheduleId: fix.schedule.id,
          eventType: LineageEventType.MANUAL_RESCHEDULE,
          description: 'Unsupported event',
        },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_UNSUPPORTED_EVENT_TYPE'));
      console.log('✓ NEG-05 passed: Unsupported event type rejected.');
    }

    // NEG-06: Zero-edge event
    {
      const fix = await createNegativeTestFixture('06');
      await db.installmentLineageEvent.create({
        data: {
          scheduleId: fix.schedule.id,
          eventType: LineageEventType.PAYMENT_AUTO_SPLIT,
          description: 'Zero edge split',
        },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_SPLIT_EDGE_CARDINALITY'));
      console.log('✓ NEG-06 passed: Zero-edge split event rejected.');
    }

    // NEG-07: Multiple INITIAL_SCHEDULE events
    {
      const fix = await createNegativeTestFixture('07');
      await db.installmentLineageEvent.create({
        data: {
          scheduleId: fix.schedule.id,
          eventType: LineageEventType.INITIAL_SCHEDULE,
          description: 'Second initial schedule',
        },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_INITIAL_EVENT_CARDINALITY'));
      console.log('✓ NEG-07 passed: Multiple INITIAL_SCHEDULE events rejected.');
    }

    // NEG-08: Missing expected sequence
    {
      const fix = await createNegativeTestFixture('08');
      await db.admissionInstallmentSchedule.update({
        where: { id: fix.schedule.id },
        data: { installmentCount: 3 },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_INITIAL_EDGE_CARDINALITY') || res.error?.includes('ERR_MISSING_EXPECTED_SEQUENCE'));
      console.log('✓ NEG-08 passed: Missing expected sequence rejected.');
    }

    // NEG-09: Root with non-null rootInstallmentId
    {
      const fix = await createNegativeTestFixture('09');
      const roots = await db.admissionInstallment.findMany({ where: { scheduleId: fix.schedule.id } });
      await db.admissionInstallment.update({
        where: { id: roots[0].id },
        data: { rootInstallmentId: roots[1].id },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_ROOT_CONVENTION_VIOLATION'));
      console.log('✓ NEG-09 passed: Root with non-null rootInstallmentId rejected.');
    }

    // NEG-10: Root amount sum does not equal schedule total
    {
      const fix = await createNegativeTestFixture('10');
      await db.admissionInstallmentSchedule.update({
        where: { id: fix.schedule.id },
        data: { totalAmount: new Decimal(99999) },
      });
      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_ROOT_SUM_SCHEDULE_MISMATCH'));
      console.log('✓ NEG-10 passed: Root amount sum vs schedule total mismatch rejected.');
    }

    // NEG-11 & NEG-12: Interval gap and overlap unit checks
    {
      const instA = { id: 'a', offsetAmount: new Decimal(0), amount: new Decimal(5000), status: InstallmentRowStatus.PENDING, supersededAt: null } as any;
      const instB_gap = { id: 'b', offsetAmount: new Decimal(6000), amount: new Decimal(4000), status: InstallmentRowStatus.PENDING, supersededAt: null } as any;
      const instB_overlap = { id: 'c', offsetAmount: new Decimal(4000), amount: new Decimal(6000), status: InstallmentRowStatus.PENDING, supersededAt: null } as any;

      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(10000), [instA, instB_gap], []),
        (err: any) => err.code === 'ERR_INTERVAL_GAP',
      );
      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(10000), [instA, instB_overlap], []),
        (err: any) => err.code === 'ERR_INTERVAL_OVERLAP',
      );
      console.log('✓ NEG-11 & NEG-12 passed: Interval gap and overlap strictly rejected.');
    }

    // NEG-13: Missing active leaf (terminal boundary mismatch)
    {
      const instA = { id: 'a', offsetAmount: new Decimal(0), amount: new Decimal(5000), status: InstallmentRowStatus.PENDING, supersededAt: null } as any;
      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(10000), [instA], []),
        (err: any) => err.code === 'ERR_TERMINAL_BOUNDARY_MISMATCH',
      );
      console.log('✓ NEG-13 passed: Missing active leaf (terminal boundary mismatch) rejected.');
    }

    // NEG-14: Active row with outgoing lineage
    {
      const instA = { id: 'a', offsetAmount: new Decimal(0), amount: new Decimal(5000), status: InstallmentRowStatus.PENDING, supersededAt: null } as any;
      const fakeEdge = { sourceInstallmentId: 'a', resultInstallmentId: 'b' } as any;
      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(5000), [instA], [fakeEdge]),
        (err: any) => err.code === 'ERR_MUTUAL_STATUS_SUPERSEDED_INCONSISTENCY' || err.code === 'ERR_ACTIVE_ROW_WITH_OUTGOING_LINEAGE',
      );
      console.log('✓ NEG-14 passed: Active row with outgoing lineage rejected.');
    }

    // NEG-15: Invalid status / supersededAt combination
    {
      const inst1 = { id: 'a', offsetAmount: new Decimal(0), amount: new Decimal(5000), status: InstallmentRowStatus.SUPERSEDED, supersededAt: null } as any;
      const inst2 = { id: 'b', offsetAmount: new Decimal(0), amount: new Decimal(5000), status: InstallmentRowStatus.PENDING, supersededAt: new Date() } as any;
      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(5000), [inst1], []),
        (err: any) => err.code === 'ERR_MUTUAL_STATUS_SUPERSEDED_INCONSISTENCY',
      );
      assert.throws(
        () => backfillService.validateSequenceIntervalIntegrity(1, new Decimal(5000), [inst2], []),
        (err: any) => err.code === 'ERR_MUTUAL_STATUS_SUPERSEDED_INCONSISTENCY',
      );
      console.log('✓ NEG-15 passed: Inconsistent status and supersededAt strictly rejected.');
    }

    // NEG-16: Historical feePaymentId context mismatch
    {
      const fix = await createNegativeTestFixture('16');
      const otherFix = await createNegativeTestFixture('16-other');
      await studentService.recordStudentFeePayment(
        fix.student.id,
        { amount: '5000', idempotencyKey: 'neg16-pay-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        otherFix.student.id,
        { amount: '5000', idempotencyKey: 'neg16-other-pay-' + Date.now() },
        officeAdminAId,
      );
      const otherPayment = await db.feePayment.findFirst({ where: { admissionId: otherFix.admission.id } });
      assert.ok(otherPayment);

      const splitEvent = await db.installmentLineageEvent.findFirst({
        where: { scheduleId: fix.schedule.id, eventType: LineageEventType.PAYMENT_AUTO_SPLIT },
      });
      assert.ok(splitEvent);

      await db.installmentLineageEvent.update({
        where: { id: splitEvent.id },
        data: { feePaymentId: otherPayment.id },
      });

      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_PAYMENT_CONTEXT_MISMATCH'));
      console.log('✓ NEG-16 passed: Historical feePaymentId context mismatch rejected.');
    }

    // NEG-17: Allocation edge amount mismatch
    {
      const fix = await createNegativeTestFixture('17');
      await studentService.recordStudentFeePayment(
        fix.student.id,
        { amount: '5000', idempotencyKey: 'neg17-pay-' + Date.now() },
        officeAdminAId,
      );
      const payment = await db.feePayment.findFirst({ where: { admissionId: fix.admission.id } });
      const splitEvent = await db.installmentLineageEvent.findFirst({
        where: { scheduleId: fix.schedule.id, eventType: LineageEventType.PAYMENT_AUTO_SPLIT },
        include: { transferEdges: true },
      });
      assert.ok(splitEvent && payment);

      await db.installmentLineageTransferEdge.update({
        where: { id: splitEvent.transferEdges[0].id },
        data: { amount: new Decimal(4000) },
      });

      const res = await backfillService.backfillScheduleOffsets(fix.schedule.id);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('ERR_SPLIT_CONSERVATION_MISMATCH') || res.error?.includes('ERR_ALLOCATION_EDGE_AMOUNT_MISMATCH'));
      console.log('✓ NEG-17 passed: Allocation vs edge amount mismatch rejected.');
    }

    // NEG-18: Independent failure logger error surfaced when independent logging fails
    {
      const mockFailingDb = {
        backfillExceptionLog: {
          create: () => {
            throw new Error('Disk full on failure log write');
          },
        },
      } as any;

      await assert.rejects(
        (backfillService as any).logDurableFailure(mockFailingDb, 'run-neg18', new Error('Original backfill error')),
        (err: any) => err.message.includes('Original backfill error') && err.message.includes('Disk full on failure log write'),
      );
      console.log('✓ NEG-18 passed: Both original error and failure logger error surfaced on secondary logging crash.');
    }

    // NEG-19: Interrupted migration-run recovery
    {
      const staleRunId = 'stale-run-' + Date.now();
      await db.offsetBackfillRun.create({
        data: {
          migrationRunId: staleRunId,
          status: 'RUNNING',
          startedAt: new Date(Date.now() - 3600000),
        },
      });

      try {
        await backfillService.runBackfill('fresh-run-' + Date.now());
      } catch {
        // Expected if DB has intentional test corruptions; we are specifically verifying stale-run detection
      }

      const staleRecord = await db.offsetBackfillRun.findUnique({
        where: { migrationRunId: staleRunId },
      });
      assert.ok(staleRecord);
      assert.equal(staleRecord.status, 'INTERRUPTED');
      console.log('✓ NEG-19 passed: Stale RUNNING records detected and marked INTERRUPTED on subsequent runner restart.');
    }

    console.log('\n========================================================================');
    console.log('ALL TASK 04B.5.2.2 CORRECTION & CONCURRENCY INTEGRATION TESTS PASSED!');
    console.log('========================================================================\n');

  } finally {
    console.log('--- Cleaning up QA fixtures ---');
    await db.$executeRawUnsafe(`
      DELETE FROM "OffsetBackfillRun";
      DELETE FROM "FinancialLog" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "InstallmentAllocationReversalEvent" WHERE "feePaymentId" IN (SELECT id FROM "FeePayment" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "PaymentReversalEvent" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "BackfillExceptionLog" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "InstallmentLineageTransferEdge" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "InstallmentLineageEvent" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "FeePaymentInstallmentAllocation" WHERE "feePaymentHeaderId" IN (SELECT id FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}')));
      DELETE FROM "FeePayment" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "AdmissionInstallment" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "Student" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "FeePaymentDetails" WHERE "feePaymentHeaderId" IN (SELECT id FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}')));
      DELETE FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "FeeComponent" WHERE "feeStructureId" IN (SELECT id FROM "FeeStructure" WHERE "academicYearId" = '${yearAId}');
      DELETE FROM "FeeStructure" WHERE "academicYearId" = '${yearAId}';
      DELETE FROM "Section" WHERE "classId" IN (SELECT id FROM "Class" WHERE "programId" = '${programAId}') OR "classId" = '${classAId}';
      DELETE FROM "Class" WHERE "programId" = '${programAId}' OR "id" = '${classAId}';
      DELETE FROM "Program" WHERE "id" = '${programAId}';
      DELETE FROM "AcademicYear" WHERE "id" = '${yearAId}';
      DELETE FROM "User" WHERE "id" IN ('${collegeAdminAId}', '${officeAdminAId}', '${collegeAdminBId}');
      DELETE FROM "School" WHERE "id" IN ('${schoolAId}', '${schoolBId}');
    `);
    await db.$disconnect();
    console.log('--- Teardown complete ---');
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
