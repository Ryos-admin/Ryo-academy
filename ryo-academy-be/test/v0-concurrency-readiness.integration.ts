import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import { AdmissionInstallmentScheduleService } from '../src/admission/installment/admission-installment-schedule.service.js';
import { ScheduleCalculatorService } from '../src/admission/installment/schedule-calculator.service.js';
import { InstallmentTemplateService } from '../src/admission/installment/installment-template.service.js';
import {
  AdmissionStatus,
  FeePricingVersion,
  Gender,
  InstallmentRowStatus,
  PaymentMethod,
  Prisma,
} from '../generated/prisma/client.js';
import { ConflictException, BadRequestException } from '@nestjs/common';

const databaseUrl = process.env.DATABASE_URL;

function checkQaTarget() {
  assert.ok(databaseUrl, 'DATABASE_URL must be set for the QA harness');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/ryo_qa');
  assert.ok(!url.hostname.includes('neon.tech'), 'Never target Neon or remote databases');
}

/**
 * Universal Database Invariant Verification
 * Verified after every concurrent scenario:
 * 1. Header paid and due amounts reconcile.
 * 2. FeePaymentDetails amountPaid matches active payment attribution.
 * 3. Component attribution totals match payment amounts.
 * 4. Installment net allocations never exceed installment amounts.
 * 5. Reversed amounts never exceed allocated amounts.
 * 6. No V0 installment row splitting or recreation.
 * 7. No orphaned or cross-header allocation records.
 * 8. No duplicate reversal events.
 * 9. FinancialLog and payment history remain consistent.
 */
async function assertDatabaseInvariants(db: DatabaseService, headerId: string) {
  const header = await db.feePaymentHeader.findUniqueOrThrow({
    where: { id: headerId },
    include: {
      feePaymentDetails: true,
      payments: {
        include: {
          reversalEvent: true,
          detailAttributions: true,
          installmentAllocations: true,
        },
      },
      installmentSchedule: {
        include: {
          installments: {
            include: {
              allocations: true,
            },
            orderBy: { sequence: 'asc' },
          },
        },
      },
    },
  });

  const activePayments = header.payments.filter((p) => !p.reversalEvent);

  // 1. Header paid and due amounts reconcile
  const activePaymentSum = activePayments.reduce(
    (sum, p) => sum.plus(new Prisma.Decimal(p.amount.toString())),
    new Prisma.Decimal(0),
  );
  const totalFee = new Prisma.Decimal(header.totalFeeAmount.toString());
  const totalPaid = new Prisma.Decimal(header.totalPaidAmount.toString());
  const totalDue = new Prisma.Decimal(header.totalDueAmount.toString());

  assert.ok(
    totalPaid.equals(activePaymentSum),
    `Header totalPaidAmount (${totalPaid}) matches active payments sum (${activePaymentSum})`,
  );
  assert.ok(
    totalFee.minus(totalPaid).equals(totalDue),
    `Header due (${totalDue}) = fee (${totalFee}) - paid (${totalPaid})`,
  );

  // 2. FeePaymentDetails amountPaid matches active payment attribution
  for (const detail of header.feePaymentDetails) {
    const detailPaid = new Prisma.Decimal(detail.amountPaid.toString());
    let expectedPaid = new Prisma.Decimal(0);
    for (const pay of activePayments) {
      const attr = pay.detailAttributions.find((a) => a.feePaymentDetailsId === detail.id);
      if (attr) {
        expectedPaid = expectedPaid.plus(new Prisma.Decimal(attr.amount.toString()));
      }
    }
    assert.ok(
      detailPaid.equals(expectedPaid),
      `Detail "${detail.id}" amountPaid (${detailPaid}) matches active attribution (${expectedPaid})`,
    );
  }

  // 3. Component attribution totals match payment amounts
  for (const pay of header.payments) {
    const payAmt = new Prisma.Decimal(pay.amount.toString());
    const attrSum = pay.detailAttributions.reduce(
      (sum, a) => sum.plus(new Prisma.Decimal(a.amount.toString())),
      new Prisma.Decimal(0),
    );
    assert.ok(
      payAmt.equals(attrSum),
      `Payment "${pay.id}" amount (${payAmt}) matches detail attributions sum (${attrSum})`,
    );
  }

  // 4. Installment net allocations never exceed installment amounts & reversedAmount <= allocatedAmount
  if (header.installmentSchedule) {
    for (const inst of header.installmentSchedule.installments) {
      const instAmt = new Prisma.Decimal(inst.amount.toString());
      let netAlloc = new Prisma.Decimal(0);

      for (const alloc of inst.allocations) {
        const allocated = new Prisma.Decimal(alloc.allocatedAmount.toString());
        const reversed = new Prisma.Decimal(alloc.reversedAmount.toString());
        assert.ok(
          reversed.lte(allocated),
          `Allocation reversed (${reversed}) <= allocated (${allocated})`,
        );
        netAlloc = netAlloc.plus(allocated.minus(reversed));
      }

      assert.ok(
        netAlloc.lte(instAmt),
        `Installment "${inst.id}" net allocation (${netAlloc}) <= amount (${instAmt})`,
      );

      if (netAlloc.gte(instAmt)) {
        assert.ok(
          inst.status === InstallmentRowStatus.PAID ||
            inst.status === InstallmentRowStatus.PAID_EARLY,
          `Fully covered installment "${inst.id}" must be PAID or PAID_EARLY, got ${inst.status}`,
        );
        assert.ok(
          inst.paidAt !== null,
          `Fully covered installment "${inst.id}" must have non-null paidAt`,
        );
      } else {
        assert.equal(
          inst.status,
          InstallmentRowStatus.PENDING,
          `Partially paid installment "${inst.id}" must be PENDING`,
        );
        assert.equal(
          inst.paidAt,
          null,
          `Partially paid installment "${inst.id}" must have null paidAt`,
        );
      }
    }

    // 5. No V0 installment row splitting or recreation (sequence count matches schedule.installmentCount)
    assert.equal(
      header.installmentSchedule.installments.length,
      header.installmentSchedule.installmentCount,
      'Installment count must equal schedule.installmentCount (no row splitting)',
    );
    for (const inst of header.installmentSchedule.installments) {
      assert.equal(
        inst.supersededAt,
        null,
        `V0 installment "${inst.id}" supersededAt must be null (no superseded V0 rows)`,
      );
    }

    // 6. No orphaned or cross-header allocation records
    const allocs = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentHeaderId: headerId },
      include: { installment: true, feePayment: true },
    });
    for (const a of allocs) {
      assert.equal(
        a.installment.feePaymentHeaderId,
        headerId,
        'Allocation installment feePaymentHeaderId matches header',
      );
      assert.equal(
        a.feePayment.feePaymentHeaderId,
        headerId,
        'Allocation feePayment feePaymentHeaderId matches header',
      );
    }
  }

  // 7. No duplicate reversal events
  const reversalEvents = await db.paymentReversalEvent.findMany({
    where: { feePayment: { feePaymentHeaderId: headerId } },
  });
  const reversedPaymentIds = new Set(reversalEvents.map((r) => r.feePaymentId));
  assert.equal(
    reversalEvents.length,
    reversedPaymentIds.size,
    'No duplicate reversal events per payment',
  );

  // 8. FinancialLog and payment history remain consistent
  const finLogs = await db.financialLog.findMany({
    where: {
      sourceType: 'FEE_PAYMENT',
      sourceId: { in: header.payments.map((p) => p.id) },
    },
  });
  for (const p of header.payments) {
    const payLogs = finLogs.filter((l) => l.sourceId === p.id && l.flowType === 'INCOME');
    assert.equal(
      payLogs.length,
      1,
      `Payment ${p.id} must have exactly 1 payment log`,
    );
    if (p.reversalEvent) {
      const revLogs = finLogs.filter((l) => l.sourceId === p.id && l.flowType === 'REVERSAL');
      assert.equal(
        revLogs.length,
        1,
        `Reversed payment ${p.id} must have exactly 1 reversal log`,
      );
    }
  }
}

async function main() {
  checkQaTarget();
  console.log('Target verified as disposable local QA database: 127.0.0.1:55432/ryo_qa');

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const repo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, repo);
  const paymentService = new AdmissionPaymentService(db);
  const calculatorService = new ScheduleCalculatorService();
  const templateService = new InstallmentTemplateService(db);
  const scheduleService = new AdmissionInstallmentScheduleService(
    db,
    calculatorService,
    templateService,
  );

  const suffix = Date.now().toString().slice(-6);
  const schoolId = `sch-m54-${suffix}`;
  const userId = `usr-m54-${suffix}`;
  const academicYearId = `ay-m54-${suffix}`;
  const programId = `prog-m54-${suffix}`;
  const classId = `cls-m54-${suffix}`;
  const sectionId = `sec-m54-${suffix}`;
  const feeStructureId = `fs-m54-${suffix}`;
  const compTuitionId = `fc-tui-m54-${suffix}`;
  const compExamId = `fc-exm-m54-${suffix}`;

  let admScenarioAId: string | null = null;
  let admScenarioBId: string | null = null;
  let admScenarioCId: string | null = null;
  let admScenarioDId: string | null = null;

  try {
    console.log('1. Setting up isolated test fixtures on disposable PostgreSQL...');
    await db.school.create({
      data: {
        id: schoolId,
        name: `BE-M5.4 QA School ${suffix}`,
        schoolCode: `SCH-M54-${suffix}`,
      },
    });

    await db.user.create({
      data: {
        id: userId,
        schoolId,
        firstName: 'Concurrency',
        lastName: 'Admin',
        email: `admin-m54-${suffix}@example.com`,
        passwordHash: 'dummy',
      },
    });

    await db.academicYear.create({
      data: {
        id: academicYearId,
        schoolId,
        name: `AY 2026-27 ${suffix}`,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
      },
    });

    await db.program.create({
      data: {
        id: programId,
        academicYearId,
        name: `Program ${suffix}`,
        startTime: '09:00',
        endTime: '15:00',
        daysOfWeek: ['MONDAY'],
      },
    });

    await db.class.create({
      data: { id: classId, programId, name: `Class 5 ${suffix}` },
    });

    await db.section.create({
      data: { id: sectionId, classId, name: `Section A ${suffix}` },
    });

    await db.feeStructure.create({
      data: {
        id: feeStructureId,
        academicYearId,
        programId,
        classId,
        name: `Fee Structure ${suffix}`,
        description: 'BE-M5.4 Concurrency Fee Structure',
        totalAmount: new Prisma.Decimal('2000.00'),
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: true,
        feeComponents: {
          create: [
            {
              id: compTuitionId,
              name: 'Tuition Fee',
              amount: new Prisma.Decimal('1200.00'),
              isMandatory: true,
              discountApplicable: true,
              isActive: true,
            },
            {
              id: compExamId,
              name: 'Examination Fee',
              amount: new Prisma.Decimal('800.00'),
              isMandatory: true,
              discountApplicable: false,
              isActive: true,
            },
          ],
        },
      },
    });

    // =========================================================================
    // --- Scenario A: Payment vs. Reversal Concurrency ---
    // =========================================================================
    console.log('\n2. Scenario A — Payment vs. Reversal Concurrency...');
    const admA = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Student Scenario A',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2015-05-05'),
      parentName: 'Parent A',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543211',
      parentEmail: 'parent.a@example.com',
      addressLine1: 'Address A',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userId,
      components: [
        { feeComponentId: compTuitionId, discountPercentage: '0.00' },
        { feeComponentId: compExamId, discountPercentage: '0.00' },
      ],
    } as any);
    admScenarioAId = admA.id;

    const headerA = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admScenarioAId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailA = headerA.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;
    const examDetailA = headerA.feePaymentDetails.find((d) => d.feeComponentId === compExamId)!;

    // Create schedule for Admission A: 2 installments of 1000 each (total 2000)
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admScenarioAId,
        feePaymentHeaderId: headerA.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerA.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 1 Installment',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerA.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 2 Installment',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
    });

    // Make initial Payment 1: 600.00 on Tuition
    const payA1 = await paymentService.createAdmissionPayment(
      admScenarioAId,
      {
        idempotencyKey: `scen-a-pay-1-${suffix}`,
        amount: '600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-05T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailA.id, amount: '600.00' }],
      },
      userId,
    );
    assert.equal(payA1.statusCode, 201);

    // Concurrently:
    // Op 1: Payment 2 (500.00: Tuition 300, Exam 200)
    // Op 2: Reverse Payment 1 (600.00)
    console.log('   Executing concurrent Payment 2 and Reversal of Payment 1...');
    const resultsA = await Promise.all([
      paymentService.createAdmissionPayment(
        admScenarioAId,
        {
          idempotencyKey: `scen-a-pay-2-${suffix}`,
          amount: '500.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-10T10:00:00.000Z',
          allocations: [
            { feePaymentDetailsId: tuitionDetailA.id, amount: '300.00' },
            { feePaymentDetailsId: examDetailA.id, amount: '200.00' },
          ],
        },
        userId,
      ),
      paymentService.reverseAdmissionPayment(
        admScenarioAId,
        payA1.id,
        {
          idempotencyKey: `scen-a-rev-1-${suffix}`,
          reason: 'Concurrent reversal of payment 1',
        },
        userId,
      ),
    ]);

    assert.equal(resultsA[0].statusCode, 201, 'Payment 2 succeeded');
    assert.equal(resultsA[1].statusCode, 200, 'Reversal of Payment 1 succeeded');

    // Run universal database invariant check
    await assertDatabaseInvariants(db, headerA.id);
    console.log('   ✓ Scenario A passed: Clean serialization through Admission lock, zero deadlock, invariants reconciled');

    // =========================================================================
    // --- Scenario B: Schedule Update vs. Payment Concurrency ---
    // =========================================================================
    console.log('\n3. Scenario B — Schedule Update vs. Payment Concurrency...');
    const admB = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Student Scenario B',
      gender: Gender.MALE,
      dateOfBirth: new Date('2015-06-06'),
      parentName: 'Parent B',
      parentRelation: 'FATHER' as any,
      parentPhone: '9876543212',
      parentEmail: 'parent.b@example.com',
      addressLine1: 'Address B',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userId,
      components: [
        { feeComponentId: compTuitionId, discountPercentage: '0.00' },
        { feeComponentId: compExamId, discountPercentage: '0.00' },
      ],
    } as any);
    admScenarioBId = admB.id;

    const headerB = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admScenarioBId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailB = headerB.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;

    // Create initial unpaid schedule with 2 installments: 1000 + 1000
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admScenarioBId,
        feePaymentHeaderId: headerB.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerB.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Original Term 1',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerB.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Original Term 2',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
    });

    // Concurrently:
    // Op 1: Update draft schedule to 3 installments: 600 + 600 + 800 = 2000
    // Op 2: Collect first payment of 500.00
    console.log('   Executing concurrent Schedule Update and Payment 1...');
    const resultsB = await Promise.allSettled([
      scheduleService.updateDraftSchedule(
        admScenarioBId,
        {
          feePaymentHeaderId: headerB.id,
          installments: [
            { sequence: 1, label: 'Updated Term 1', amount: '600.00', dueDate: '2026-11-10T00:00:00.000Z' },
            { sequence: 2, label: 'Updated Term 2', amount: '600.00', dueDate: '2026-12-10T00:00:00.000Z' },
            { sequence: 3, label: 'Updated Term 3', amount: '800.00', dueDate: '2027-01-10T00:00:00.000Z' },
          ],
        },
        userId,
      ),
      paymentService.createAdmissionPayment(
        admScenarioBId,
        {
          idempotencyKey: `scen-b-pay-1-${suffix}`,
          amount: '500.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-10T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: tuitionDetailB.id, amount: '500.00' }],
        },
        userId,
      ),
    ]);

    const schedUpdateResult = resultsB[0];
    const paymentResult = resultsB[1];

    if (schedUpdateResult.status === 'fulfilled') {
      // Schedule update won the lock!
      console.log('   Branch A: Schedule update acquired lock first and succeeded.');
      assert.equal(paymentResult.status, 'fulfilled', 'Payment must also succeed against the updated schedule');
      // Payment must allocate to the updated schedule (which now has 3 installments)
      const schedAfter = await db.admissionInstallmentSchedule.findUniqueOrThrow({
        where: { feePaymentHeaderId: headerB.id },
        include: { installments: { orderBy: { sequence: 'asc' } } },
      });
      assert.equal(schedAfter.installmentCount, 3);
      assert.equal(schedAfter.installments.length, 3);
      assert.equal(schedAfter.installments[0].label, 'Updated Term 1');
    } else {
      // Payment won the lock!
      console.log('   Branch B: Payment acquired lock first and succeeded.');
      assert.equal(paymentResult.status, 'fulfilled', 'Payment must succeed');
      assert.equal(schedUpdateResult.status, 'rejected', 'Schedule update must fail with ConflictException');
      const error = (schedUpdateResult as PromiseRejectedResult).reason;
      assert.ok(error instanceof ConflictException, 'Error must be ConflictException');
      const response = error.getResponse();
      assert.equal(
        typeof response === 'object' && response !== null && (response as any).code,
        'SCHEDULE_FROZEN_PAYMENT_EXISTS',
        'Must fail with code SCHEDULE_FROZEN_PAYMENT_EXISTS',
      );
    }

    // Run universal database invariant check
    await assertDatabaseInvariants(db, headerB.id);
    console.log('   ✓ Scenario B passed: Schedule update vs. payment serialized with frozen-schedule protection');

    // =========================================================================
    // --- Scenario C: Two Concurrent Reversals ---
    // =========================================================================
    console.log('\n4. Scenario C — Two Concurrent Reversals with Distinct Idempotency Keys...');
    const admC = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Student Scenario C',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2015-07-07'),
      parentName: 'Parent C',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543213',
      parentEmail: 'parent.c@example.com',
      addressLine1: 'Address C',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userId,
      components: [
        { feeComponentId: compTuitionId, discountPercentage: '0.00' },
        { feeComponentId: compExamId, discountPercentage: '0.00' },
      ],
    } as any);
    admScenarioCId = admC.id;

    const headerC = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admScenarioCId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailC = headerC.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;

    // Create schedule for C
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admScenarioCId,
        feePaymentHeaderId: headerC.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 1,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerC.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Single Term',
              amount: new Prisma.Decimal('2000.00'),
              dueDate: new Date('2026-11-20T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
    });

    // Create payment to reverse
    const payC = await paymentService.createAdmissionPayment(
      admScenarioCId,
      {
        idempotencyKey: `scen-c-pay-1-${suffix}`,
        amount: '800.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailC.id, amount: '800.00' }],
      },
      userId,
    );

    // Concurrently submit two reversal requests with DIFFERENT idempotency keys
    console.log('   Executing two concurrent reversals for the same payment with distinct keys...');
    const resultsC = await Promise.allSettled([
      paymentService.reverseAdmissionPayment(
        admScenarioCId,
        payC.id,
        {
          idempotencyKey: `scen-c-rev-key-1-${suffix}`,
          reason: 'Reversal key 1',
        },
        userId,
      ),
      paymentService.reverseAdmissionPayment(
        admScenarioCId,
        payC.id,
        {
          idempotencyKey: `scen-c-rev-key-2-${suffix}`,
          reason: 'Reversal key 2',
        },
        userId,
      ),
    ]);

    const fulfilledC = resultsC.filter((r) => r.status === 'fulfilled');
    const rejectedC = resultsC.filter((r) => r.status === 'rejected');

    assert.equal(fulfilledC.length, 1, 'Exactly one reversal request must succeed');
    assert.equal(rejectedC.length, 1, 'Exactly one reversal request must be rejected');

    const rejectionReason = (rejectedC[0] as PromiseRejectedResult).reason;
    assert.ok(
      rejectionReason instanceof ConflictException,
      'Rejection must be ConflictException',
    );
    assert.ok(
      rejectionReason.message.includes('Payment has already been reversed'),
      `Rejection message must indicate payment has already been reversed, got: "${rejectionReason.message}"`,
    );

    // Assert in PostgreSQL that exactly one reversal event exists
    const revEventsC = await db.paymentReversalEvent.findMany({
      where: { feePaymentId: payC.id },
    });
    assert.equal(revEventsC.length, 1, 'Exactly one PaymentReversalEvent row in DB');

    // Run universal database invariant check
    await assertDatabaseInvariants(db, headerC.id);
    console.log('   ✓ Scenario C passed: Exactly one reversal applied, duplicate reversal strictly rejected with 409 Conflict');

    // =========================================================================
    // --- Scenario D: Two Concurrent Payments ---
    // =========================================================================
    console.log('\n5. Scenario D — Two Concurrent Payments against Scheduled Admission...');
    const admD = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Student Scenario D',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2015-08-08'),
      parentName: 'Parent D',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543214',
      parentEmail: 'parent.d@example.com',
      addressLine1: 'Address D',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userId,
      components: [
        { feeComponentId: compTuitionId, discountPercentage: '0.00' },
        { feeComponentId: compExamId, discountPercentage: '0.00' },
      ],
    } as any);
    admScenarioDId = admD.id;

    const headerD = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admScenarioDId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailD = headerD.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;
    const examDetailD = headerD.feePaymentDetails.find((d) => d.feeComponentId === compExamId)!;

    // Create schedule with 2 installments: Inst 1: 800, Inst 2: 1200 (total 2000)
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admScenarioDId,
        feePaymentHeaderId: headerD.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerD.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 1 Installment',
              amount: new Prisma.Decimal('800.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerD.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 2 Installment',
              amount: new Prisma.Decimal('1200.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
    });

    // Concurrently submit two distinct payments:
    // Payment A: 600.00 (Tuition 600)
    // Payment B: 500.00 (Tuition 200, Exam 300)
    // Total payments: 1100.00 (fits within 2000 total fee and component balances)
    // Installment FIFO expected:
    // First payment to serialize gets 600 or 500 into Inst 1.
    // Second payment to serialize finishes Inst 1 (up to 800) and spills remainder into Inst 2!
    // Inst 1 total net: 800 (settled, PAID_EARLY)
    // Inst 2 total net: 300 (partially paid, PENDING)
    console.log('   Executing two concurrent distinct payments (600.00 and 500.00)...');
    const resultsD = await Promise.all([
      paymentService.createAdmissionPayment(
        admScenarioDId,
        {
          idempotencyKey: `scen-d-pay-a-${suffix}`,
          amount: '600.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-10T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: tuitionDetailD.id, amount: '600.00' }],
        },
        userId,
      ),
      paymentService.createAdmissionPayment(
        admScenarioDId,
        {
          idempotencyKey: `scen-d-pay-b-${suffix}`,
          amount: '500.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-11T10:00:00.000Z',
          allocations: [
            { feePaymentDetailsId: tuitionDetailD.id, amount: '200.00' },
            { feePaymentDetailsId: examDetailD.id, amount: '300.00' },
          ],
        },
        userId,
      ),
    ]);

    assert.equal(resultsD[0].statusCode, 201);
    assert.equal(resultsD[1].statusCode, 201);

    // Verify installments state in PostgreSQL
    const schedD = await db.admissionInstallmentSchedule.findUniqueOrThrow({
      where: { feePaymentHeaderId: headerD.id },
      include: {
        installments: {
          include: { allocations: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    const [instD1, instD2] = schedD.installments;
    assert.equal(instD1.status, InstallmentRowStatus.PAID_EARLY, 'Inst 1 settled (PAID_EARLY)');
    assert.ok(instD1.paidAt !== null, 'Inst 1 paidAt is set');

    const instD1AllocSum = instD1.allocations.reduce(
      (sum, a) => sum.plus(new Prisma.Decimal(a.allocatedAmount.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(instD1AllocSum.toString(), '800', 'Inst 1 receives exactly 800 without over-allocation');

    assert.equal(instD2.status, InstallmentRowStatus.PENDING, 'Inst 2 partially paid (PENDING)');
    assert.equal(instD2.paidAt, null, 'Inst 2 paidAt is null');

    const instD2AllocSum = instD2.allocations.reduce(
      (sum, a) => sum.plus(new Prisma.Decimal(a.allocatedAmount.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(instD2AllocSum.toString(), '300', 'Inst 2 receives remaining 300');

    // Run universal database invariant check
    await assertDatabaseInvariants(db, headerD.id);
    console.log('   ✓ Scenario D passed: Concurrent payments serialized via FIFO without over-allocation; invariants conserved');

    console.log('\nALL BE-M5.4 CONCURRENCY SCENARIOS PASSED WITH ZERO ERRORS.');
  } finally {
    console.log('\n6. Cleaning up disposable test fixtures...');
    const admIds = [admScenarioAId, admScenarioBId, admScenarioCId, admScenarioDId].filter(
      Boolean,
    ) as string[];

    await db.feePaymentInstallmentAllocation.deleteMany({
      where: { header: { admissionId: { in: admIds } } },
    });
    await db.feePaymentDetailAttribution.deleteMany({
      where: { feePayment: { admissionId: { in: admIds } } },
    });
    await db.paymentReversalEvent.deleteMany({
      where: { schoolId },
    });
    await db.feePayment.deleteMany({
      where: { admissionId: { in: admIds } },
    });
    await db.admissionInstallment.deleteMany({
      where: { schedule: { admissionId: { in: admIds } } },
    });
    await db.admissionInstallmentSchedule.deleteMany({
      where: { admissionId: { in: admIds } },
    });
    await db.financialLog.deleteMany({
      where: { schoolId },
    });
    await db.feePaymentDetails.deleteMany({
      where: { feePaymentHeader: { admissionId: { in: admIds } } },
    });
    await db.feePaymentHeader.deleteMany({
      where: { admissionId: { in: admIds } },
    });
    await db.admission.deleteMany({
      where: { id: { in: admIds } },
    });
    await db.feeComponent.deleteMany({ where: { feeStructureId } });
    await db.feeStructure.deleteMany({ where: { id: feeStructureId } });
    await db.section.deleteMany({ where: { id: sectionId } });
    await db.class.deleteMany({ where: { id: classId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.academicYear.deleteMany({ where: { id: academicYearId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.school.deleteMany({ where: { id: schoolId } });

    // Verify residue
    const remPayments = await db.feePayment.count({ where: { schoolId } });
    const remAllocations = await db.feePaymentInstallmentAllocation.count({
      where: { header: { admission: { schoolId } } },
    });
    const remSchedules = await db.admissionInstallmentSchedule.count({ where: { schoolId } });
    const remSchools = await db.school.count({ where: { id: schoolId } });

    assert.equal(remPayments, 0, 'Zero payment residue');
    assert.equal(remAllocations, 0, 'Zero allocation residue');
    assert.equal(remSchedules, 0, 'Zero schedule residue');
    assert.equal(remSchools, 0, 'Zero school residue');
    console.log('   ✓ Guaranteed teardown complete. Zero residue verified in PostgreSQL.');

    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('Concurrency integration test failed:', err);
  process.exit(1);
});
