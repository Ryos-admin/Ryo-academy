import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import { FeePricingVersion, PaymentMethod, AdmissionStatus, InstallmentRowStatus } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { BadRequestException, ConflictException } from '@nestjs/common';

const databaseUrl = process.env.DATABASE_URL;

function checkQaTarget() {
  assert.ok(databaseUrl, 'DATABASE_URL must be set for the QA harness');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/ryo_qa');
}

async function main() {
  checkQaTarget();
  console.log('Target verified as disposable local QA database: 127.0.0.1:55432/ryo_qa');

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const repo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, repo);
  const paymentService = new AdmissionPaymentService(db);

  const suffix = Date.now().toString().slice(-6);
  const schoolId = `sch-m52-${suffix}`;
  const userId = `usr-m52-${suffix}`;
  const academicYearId = `ay-m52-${suffix}`;
  const programId = `prog-m52-${suffix}`;
  const classId = `cls-m52-${suffix}`;
  const sectionId = `sec-m52-${suffix}`;
  const feeStructureId = `fs-m52-${suffix}`;
  const compTuitionId = `fc-tui-m52-${suffix}`;
  const compExamId = `fc-exm-m52-${suffix}`;

  let admNewId: string | null = null;
  let admGrandfatheredId: string | null = null;
  let admScheduledId: string | null = null;
  let admRollbackId: string | null = null;
  let admRollbackRevId: string | null = null;

  try {
    console.log('1. Setting up isolated test fixtures on disposable PostgreSQL...');
    await db.school.create({
      data: { id: schoolId, name: `BE-M5.2 QA School ${suffix}`, schoolCode: `SCH-M52-${suffix}` },
    });

    await db.user.create({
      data: {
        id: userId,
        schoolId,
        firstName: 'DualAlloc',
        lastName: 'Admin',
        email: `admin-m52-${suffix}@example.com`,
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
        description: 'BE-M5.2 Dual Attribution Fee Structure',
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
              name: 'Exam Fee',
              amount: new Prisma.Decimal('800.00'),
              isMandatory: false,
              discountApplicable: false,
              isActive: true,
            },
          ],
        },
      },
    });

    // --- Scenario 1: New V0 Admission without schedule ---
    console.log('2. Scenario 1: Payment on new unscheduled V0 admission without history...');
    const admNew = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'New Student Unscheduled',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-01-01'),
      parentName: 'Parent New',
      parentRelation: 'FATHER' as any,
      parentPhone: '9876543210',
      parentEmail: 'parent.new@example.com',
      addressLine1: 'Address New',
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
    admNewId = admNew.id;

    const headerNew = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admNewId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailNew = headerNew.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;

    await assert.rejects(
      paymentService.createAdmissionPayment(
        admNewId,
        {
          idempotencyKey: `pay-new-fail-${suffix}`,
          amount: '500.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-10T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: tuitionDetailNew.id, amount: '500.00' }],
        },
        userId
      ),
      (err: any) => {
        return (
          err instanceof ConflictException &&
          err.getResponse()['code'] === 'SCHEDULE_REQUIRED'
        );
      },
      'Unscheduled V0 admission without payment history must be rejected with 409 SCHEDULE_REQUIRED'
    );
    console.log('   ✓ Rejection with 409 SCHEDULE_REQUIRED verified on new unscheduled V0 admission');

    // --- Scenario 2: Grandfathered V0 admission with existing payment history ---
    console.log('3. Scenario 2: Grandfathered unscheduled V0 admission with existing payment history...');
    const admGrand = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Grandfathered Student',
      gender: 'FEMALE' as any,
      dateOfBirth: new Date('2015-02-02'),
      parentName: 'Parent Grand',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543211',
      parentEmail: 'parent.grand@example.com',
      addressLine1: 'Address Grand',
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
    admGrandfatheredId = admGrand.id;

    const headerGrand = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admGrandfatheredId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailGrand = headerGrand.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;

    // Seed historical payment predating BE-M5 (simulating grandfathered state)
    const histPay = await db.feePayment.create({
      data: {
        idempotencyKey: `hist-pay-${suffix}`,
        schoolId,
        userId,
        admissionId: admGrandfatheredId,
        feePaymentHeaderId: headerGrand.id,
        amount: new Prisma.Decimal('200.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    await db.feePaymentDetailAttribution.create({
      data: {
        feePaymentId: histPay.id,
        feePaymentDetailsId: tuitionDetailGrand.id,
        feePaymentHeaderId: headerGrand.id,
        amount: new Prisma.Decimal('200.00'),
      },
    });
    await db.feePaymentDetails.update({
      where: { id: tuitionDetailGrand.id },
      data: { amountPaid: new Prisma.Decimal('200.00') },
    });
    await db.feePaymentHeader.update({
      where: { id: headerGrand.id },
      data: {
        totalPaidAmount: new Prisma.Decimal('200.00'),
        totalDueAmount: new Prisma.Decimal('1800.00'),
      },
    });

    // Now collect payment on this grandfathered unscheduled admission
    const grandPayRes = await paymentService.createAdmissionPayment(
      admGrandfatheredId,
      {
        idempotencyKey: `pay-grand-ok-${suffix}`,
        amount: '300.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailGrand.id, amount: '300.00' }],
      },
      userId
    );
    assert.equal(grandPayRes.statusCode, 201);
    assert.equal(grandPayRes.installmentAllocations.length, 0, 'Grandfathered payment creates 0 installment allocations');
    const grandInstallmentAllocsInDb = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentId: grandPayRes.id },
    });
    assert.equal(grandInstallmentAllocsInDb.length, 0, 'Zero installment allocations persisted for grandfathered header');
    console.log('   ✓ Grandfathered unscheduled header preserved with pure component attribution');

    // --- Scenario 3: Scheduled V0 Admission with Dual Attribution ---
    console.log('4. Scenario 3: Scheduled V0 Admission with Dual Attribution & Strict FIFO...');
    const admSched = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Scheduled Student',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-03-03'),
      parentName: 'Parent Sched',
      parentRelation: 'FATHER' as any,
      parentPhone: '9876543212',
      parentEmail: 'parent.sched@example.com',
      addressLine1: 'Address Sched',
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
    admScheduledId = admSched.id;

    const headerSched = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admScheduledId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailSched = headerSched.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;
    const examDetailSched = headerSched.feePaymentDetails.find((d) => d.feeComponentId === compExamId)!;

    // Create 3 installments:
    // Inst 1: 800.00, due 2026-11-15 (canonical UTC date: '2026-11-15')
    // Inst 2: 700.00, due 2026-12-15 (canonical UTC date: '2026-12-15')
    // Inst 3: 500.00, due 2027-01-15 (canonical UTC date: '2027-01-15')
    // Total = 2000.00 matching header totalFeeAmount
    const schedule = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admScheduledId,
        feePaymentHeaderId: headerSched.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 3,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerSched.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 1 Installment',
              amount: new Prisma.Decimal('800.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerSched.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 2 Installment',
              amount: new Prisma.Decimal('700.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerSched.id,
              sequence: 3,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 3 Installment',
              amount: new Prisma.Decimal('500.00'),
              dueDate: new Date('2027-01-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    });

    const [inst1, inst2, inst3] = schedule.installments;

    // --- Sub-Scenario 3A: Partial payment on Installment 1 (500.00 paid of 800.00 obligation) ---
    console.log('4A. Sub-Scenario 3A: Partial payment on Installment 1 (500.00 paid of 800.00)...');
    const pay1Res = await paymentService.createAdmissionPayment(
      admScheduledId,
      {
        idempotencyKey: `sched-pay-1-${suffix}`,
        amount: '500.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailSched.id, amount: '500.00' }],
      },
      userId
    );

    assert.equal(pay1Res.statusCode, 201);
    assert.equal(pay1Res.installmentAllocations.length, 1);
    assert.equal(pay1Res.installmentAllocations[0].installmentId, inst1.id);
    assert.equal(pay1Res.installmentAllocations[0].allocatedAmount, '500');

    // Verify PostgreSQL state: Zero row splitting, row amount intact, status PENDING, paidAt null
    const inst1AfterPay1 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst1.id } });
    assert.equal(inst1AfterPay1.amount.toString(), '800', 'Original installment row amount unchanged');
    assert.equal(inst1AfterPay1.status, InstallmentRowStatus.PENDING, 'Status remains PENDING on partial payment');
    assert.equal(inst1AfterPay1.paidAt, null, 'paidAt remains null on partial payment');
    assert.equal(inst1AfterPay1.supersededAt, null, 'supersededAt remains null');

    const allInstsAfterPay1 = await db.admissionInstallment.findMany({ where: { scheduleId: schedule.id } });
    assert.equal(allInstsAfterPay1.length, 3, 'Zero child rows or row splitting created in PostgreSQL');

    // Conservation check
    const pay1Attrs = await db.feePaymentDetailAttribution.findMany({ where: { feePaymentId: pay1Res.id } });
    const pay1Allocs = await db.feePaymentInstallmentAllocation.findMany({ where: { feePaymentId: pay1Res.id } });
    const sumAttrs1 = pay1Attrs.reduce((sum, a) => sum.plus(new Prisma.Decimal(a.amount.toString())), new Prisma.Decimal(0));
    const sumAllocs1 = pay1Allocs.reduce((sum, a) => sum.plus(new Prisma.Decimal(a.allocatedAmount.toString())), new Prisma.Decimal(0));
    assert.equal(sumAttrs1.toString(), '500', 'Detail attributions sum matches payment');
    assert.equal(sumAllocs1.toString(), '500', 'Installment allocations sum matches payment');
    console.log('   ✓ Partial payment: original installment row stable, PENDING, zero row-splitting');

    // --- Sub-Scenario 3B: Multi-installment FIFO payment completing Inst 1 and partially paying Inst 2 ---
    // Inst 1 remaining: 300.00. Payment amount: 600.00 (300 to Inst 1, 300 to Inst 2)
    // Payment date: 2026-11-12T10:00:00.000Z (before due date 2026-11-15 -> PAID_EARLY)
    console.log('4B. Sub-Scenario 3B: FIFO multi-installment payment settling Inst 1 & crossing into Inst 2...');
    const pay2Res = await paymentService.createAdmissionPayment(
      admScheduledId,
      {
        idempotencyKey: `sched-pay-2-${suffix}`,
        amount: '600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-12T10:00:00.000Z',
        allocations: [
          { feePaymentDetailsId: tuitionDetailSched.id, amount: '400.00' },
          { feePaymentDetailsId: examDetailSched.id, amount: '200.00' },
        ],
      },
      userId
    );

    assert.equal(pay2Res.statusCode, 201);
    assert.equal(pay2Res.installmentAllocations.length, 2);
    assert.equal(pay2Res.installmentAllocations[0].installmentId, inst1.id);
    assert.equal(pay2Res.installmentAllocations[0].allocatedAmount, '300');
    assert.equal(pay2Res.installmentAllocations[1].installmentId, inst2.id);
    assert.equal(pay2Res.installmentAllocations[1].allocatedAmount, '300');

    // Verify Inst 1 is now PAID_EARLY with paidAt = Payment 2 date
    const inst1AfterPay2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst1.id } });
    assert.equal(inst1AfterPay2.status, InstallmentRowStatus.PAID_EARLY);
    assert.equal(inst1AfterPay2.paidAt?.toISOString(), new Date('2026-11-12T10:00:00.000Z').toISOString());

    // Verify Inst 2 remains PENDING with paidAt = null
    const inst2AfterPay2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst2.id } });
    assert.equal(inst2AfterPay2.status, InstallmentRowStatus.PENDING);
    assert.equal(inst2AfterPay2.paidAt, null);
    assert.equal(inst2AfterPay2.amount.toString(), '700');
    console.log('   ✓ FIFO multi-installment settlement verified: Inst 1 fully settled (PAID_EARLY), Inst 2 partially settled (PENDING)');

    // --- Sub-Scenario 3C: Completing Inst 2 on or after due date -> PAID ---
    // Inst 2 remaining: 400.00. Payment date: 2026-12-16 (after canonical due date 2026-12-15)
    console.log('4C. Sub-Scenario 3C: Completing Inst 2 on or after due date -> PAID...');
    const pay3Res = await paymentService.createAdmissionPayment(
      admScheduledId,
      {
        idempotencyKey: `sched-pay-3-${suffix}`,
        amount: '400.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-12-16T12:00:00.000Z',
        allocations: [
          { feePaymentDetailsId: tuitionDetailSched.id, amount: '300.00' },
          { feePaymentDetailsId: examDetailSched.id, amount: '100.00' },
        ],
      },
      userId
    );

    assert.equal(pay3Res.statusCode, 201);
    const inst2AfterPay3 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst2.id } });
    assert.equal(inst2AfterPay3.status, InstallmentRowStatus.PAID);
    assert.equal(inst2AfterPay3.paidAt?.toISOString(), new Date('2026-12-16T12:00:00.000Z').toISOString());
    console.log('   ✓ Settling on or after canonical due date correctly evaluated as PAID');

    // --- Sub-Scenario 3D: Payment exceeding remaining installment obligation rejected ---
    // Inst 3 remaining: 500.00. Attempting to pay 600.00
    console.log('4D. Sub-Scenario 3D: Rejection of payment exceeding remaining obligation...');
    await assert.rejects(
      paymentService.createAdmissionPayment(
        admScheduledId,
        {
          idempotencyKey: `sched-pay-exceed-${suffix}`,
          amount: '501.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2027-01-10T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: examDetailSched.id, amount: '501.00' }],
        },
        userId
      ),
      BadRequestException,
      'Payment exceeding pending installment balance must be rejected'
    );
    console.log('   ✓ Payment exceeding total pending installment obligation strictly rejected with BadRequestException');

    // --- Sub-Scenario 3E: Final payment completing schedule and verifying composite foreign keys ---
    console.log('4E. Sub-Scenario 3E: Final payment completing schedule & composite FK validation...');
    const payFinalRes = await paymentService.createAdmissionPayment(
      admScheduledId,
      {
        idempotencyKey: `sched-pay-final-${suffix}`,
        amount: '500.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2027-01-10T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: examDetailSched.id, amount: '500.00' }],
      },
      userId
    );

    assert.equal(payFinalRes.statusCode, 201);
    const inst3Final = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst3.id } });
    assert.equal(inst3Final.status, InstallmentRowStatus.PAID_EARLY);

    // Verify header totals
    const finalHeader = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerSched.id } });
    assert.equal(finalHeader.totalPaidAmount.toString(), '2000');
    assert.equal(finalHeader.totalDueAmount.toString(), '0');

    // Verify all 3 composite foreign keys in PostgreSQL on the created allocations
    const allAllocations = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentHeaderId: headerSched.id },
      include: { feePayment: true, installment: true, header: true },
    });
    assert.equal(allAllocations.length, 5, 'Total 5 installment allocations recorded across 4 payments');
    for (const alloc of allAllocations) {
      assert.equal(alloc.feePaymentHeaderId, alloc.feePayment.feePaymentHeaderId, 'fk_alloc_payment_header valid');
      assert.equal(alloc.feePaymentHeaderId, alloc.installment.feePaymentHeaderId, 'fk_alloc_installment_header valid');
      assert.equal(alloc.feePaymentHeaderId, alloc.header.id, 'header relation valid');
    }
    console.log('   ✓ All 4 payments and allocations fully verified against composite foreign keys in PostgreSQL');

    // --- Scenario 4: Atomic rollback on failure during installment allocation persistence ---
    console.log('5. Scenario 4: Atomic rollback on failure during installment allocation persistence...');
    const admRollback = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Rollback Test Student',
      gender: 'FEMALE' as any,
      dateOfBirth: new Date('2015-04-04'),
      parentName: 'Parent Rollback',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543219',
      parentEmail: 'parent.rollback@example.com',
      addressLine1: 'Address Rollback',
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
    admRollbackId = admRollback.id;

    const headerRollback = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admRollbackId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailRollback = headerRollback.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;

    // Create schedule: 2 installments (1000.00 and 1000.00 = 2000.00)
    const scheduleRollback = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admRollbackId,
        feePaymentHeaderId: headerRollback.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerRollback.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Term 1 Installment',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
            {
              feePaymentHeaderId: headerRollback.id,
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
      include: { installments: { orderBy: { sequence: 'asc' } } },
    });
    const [rollbackInst1, rollbackInst2] = scheduleRollback.installments;

    // Baseline database state before failed payment attempt
    const preHeader = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerRollback.id } });
    const preTuition = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionDetailRollback.id } });
    const preInst1 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: rollbackInst1.id } });
    const preInst2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: rollbackInst2.id } });
    const prePaymentCount = await db.feePayment.count({ where: { admissionId: admRollbackId } });
    const preAttributionCount = await db.feePaymentDetailAttribution.count({ where: { feePaymentHeaderId: headerRollback.id } });
    const preAllocationCount = await db.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: headerRollback.id } });
    const preFinancialLogCount = await db.financialLog.count({ where: { schoolId } });

    assert.equal(prePaymentCount, 0);
    assert.equal(preAttributionCount, 0);
    assert.equal(preAllocationCount, 0);
    assert.equal(preHeader.totalPaidAmount.toString(), '0');
    assert.equal(preHeader.totalDueAmount.toString(), '2000');
    assert.equal(preTuition.amountPaid.toString(), '0');
    assert.equal(preInst1.status, InstallmentRowStatus.PENDING);
    assert.equal(preInst1.paidAt, null);
    assert.equal(preInst2.status, InstallmentRowStatus.PENDING);
    assert.equal(preInst2.paidAt, null);

    // Controlled failure injection:
    // Execute a real PostgreSQL transaction wrapping createAdmissionPayment.
    // Wrap tx with a transparent Proxy that allows:
    // 1. tx.$queryRaw (Level 1-5 locks execute in PostgreSQL)
    // 2. tx.feePayment.create (Level 6 persists real FeePayment row in PostgreSQL)
    // 3. tx.feePaymentDetailAttribution.createMany (Level 7 persists real FeePaymentDetailAttribution in PostgreSQL)
    // 4. tx.feePaymentInstallmentAllocation.createMany (Level 8 intercepts and throws an intentional error)
    // This forces PostgreSQL to abort and ROLLBACK the transaction after the earlier writes have executed.
    const rollbackKey = `pay-rollback-${suffix}`;
    let injectionTriggered = false;

    await assert.rejects(
      db.$transaction(async (realTx) => {
        const proxiedTx = new Proxy(realTx, {
          get(target: any, prop: string | symbol, receiver: any) {
            if (prop === 'feePaymentInstallmentAllocation') {
              const origAllocation = Reflect.get(target, prop, receiver);
              return new Proxy(origAllocation, {
                get(allocTarget: any, allocProp: string | symbol, allocReceiver: any) {
                  if (allocProp === 'createMany') {
                    return async () => {
                      injectionTriggered = true;
                      throw new Error('INJECTED_FAILURE_DURING_INSTALLMENT_ALLOCATION_PERSISTENCE');
                    };
                  }
                  return Reflect.get(allocTarget, allocProp, allocReceiver);
                },
              });
            }
            return Reflect.get(target, prop, receiver);
          },
        });

        return await paymentService.createAdmissionPayment(
          admRollbackId,
          {
            idempotencyKey: rollbackKey,
            amount: '600.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-10T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: tuitionDetailRollback.id, amount: '600.00' }],
          },
          userId,
          proxiedTx
        );
      }),
      (err: any) => {
        return err instanceof Error && err.message === 'INJECTED_FAILURE_DURING_INSTALLMENT_ALLOCATION_PERSISTENCE';
      },
      'Transaction must abort with the injected failure during installment allocation persistence'
    );

    assert.ok(injectionTriggered, 'Failure injection during installment allocation persistence was triggered');
    console.log('   ✓ Injected failure triggered after FeePayment and FeePaymentDetailAttribution database writes');

    // Post-rollback assertions directly against PostgreSQL
    const postPaymentCount = await db.feePayment.count({ where: { admissionId: admRollbackId } });
    assert.equal(postPaymentCount, 0, 'No FeePayment record remains');

    const postAttributionCount = await db.feePaymentDetailAttribution.count({ where: { feePaymentHeaderId: headerRollback.id } });
    assert.equal(postAttributionCount, 0, 'No FeePaymentDetailAttribution remains');

    const postAllocationCount = await db.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: headerRollback.id } });
    assert.equal(postAllocationCount, 0, 'No FeePaymentInstallmentAllocation remains');

    const postHeader = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerRollback.id } });
    assert.equal(postHeader.totalPaidAmount.toString(), '0', 'Header totalPaidAmount unchanged (0)');
    assert.equal(postHeader.totalDueAmount.toString(), '2000', 'Header totalDueAmount unchanged (2000)');

    const postTuition = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionDetailRollback.id } });
    assert.equal(postTuition.amountPaid.toString(), '0', 'FeePaymentDetails.amountPaid unchanged (0)');

    const postInst1 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: rollbackInst1.id } });
    assert.equal(postInst1.status, InstallmentRowStatus.PENDING, 'Installment 1 status unchanged (PENDING)');
    assert.equal(postInst1.paidAt, null, 'Installment 1 paidAt unchanged (null)');
    assert.equal(postInst1.amount.toString(), '1000', 'Installment 1 amount unchanged (1000)');

    const postInst2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: rollbackInst2.id } });
    assert.equal(postInst2.status, InstallmentRowStatus.PENDING, 'Installment 2 status unchanged (PENDING)');
    assert.equal(postInst2.paidAt, null, 'Installment 2 paidAt unchanged (null)');
    assert.equal(postInst2.amount.toString(), '1000', 'Installment 2 amount unchanged (1000)');

    const postFinancialLogCount = await db.financialLog.count({ where: { schoolId } });
    assert.equal(postFinancialLogCount, preFinancialLogCount, 'No FinancialLog entry remains');
    console.log('   ✓ Complete atomic rollback verified in PostgreSQL across all 7 financial and audit entities');

    // =========================================================================
    // --- Scenario 5: V0 Dual-Attribution Payment Reversal (BE-M5.3) ---
    // =========================================================================
    console.log('6. Scenario 5: Dual-Attribution Payment Reversal & Projection Re-evaluation (BE-M5.3)...');

    // --- Sub-Scenario 5A: Reversal of Payment 4 (payFinalRes) settling Inst 3 ---
    console.log('6A. Sub-Scenario 5A: Reversing single-installment settling payment...');
    const revFinalKey = `rev-sched-final-${suffix}`;
    const revFinalRes = await paymentService.reverseAdmissionPayment(
      admScheduledId,
      payFinalRes.id,
      {
        idempotencyKey: revFinalKey,
        reason: 'Correction of final installment payment',
      },
      userId
    );

    assert.equal(revFinalRes.statusCode, 200);
    assert.equal(revFinalRes.isReplay, false);
    assert.equal(revFinalRes.headerSnapshot.totalPaidAmount, '1500');
    assert.equal(revFinalRes.headerSnapshot.totalDueAmount, '500');

    // Verify in PostgreSQL:
    // 1. FeePaymentInstallmentAllocation for payFinalRes has reversedAmount = allocatedAmount (500)
    const payFinalAlloc = await db.feePaymentInstallmentAllocation.findFirstOrThrow({
      where: { feePaymentId: payFinalRes.id },
    });
    assert.equal(payFinalAlloc.allocatedAmount.toString(), '500');
    assert.equal(payFinalAlloc.reversedAmount.toString(), '500', 'reversedAmount equals allocatedAmount');

    // 2. Allocations for other payments retain reversedAmount = 0
    const otherAllocs = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentId: { not: payFinalRes.id }, feePaymentHeaderId: headerSched.id },
    });
    for (const alloc of otherAllocs) {
      assert.equal(alloc.reversedAmount.toString(), '0', 'Non-target payment allocations have reversedAmount = 0');
    }

    // 3. Inst 3 status reverts to PENDING, paidAt is null
    const inst3AfterRev = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst3.id } });
    assert.equal(inst3AfterRev.status, InstallmentRowStatus.PENDING, 'Inst 3 reverted to PENDING');
    assert.equal(inst3AfterRev.paidAt, null, 'Inst 3 paidAt reset to null');
    assert.equal(inst3AfterRev.amount.toString(), '500', 'Inst 3 amount intact (500)');
    assert.equal(inst3AfterRev.supersededAt, null, 'Inst 3 supersededAt null (zero row splitting)');

    // 4. Inst 1 and Inst 2 remain settled
    const inst1AfterRev = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst1.id } });
    assert.equal(inst1AfterRev.status, InstallmentRowStatus.PAID_EARLY);
    const inst2AfterRev = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst2.id } });
    assert.equal(inst2AfterRev.status, InstallmentRowStatus.PAID);

    // 5. Header and detail projections restored in PostgreSQL
    const headerAfterRev = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerSched.id } });
    assert.equal(headerAfterRev.totalPaidAmount.toString(), '1500');
    assert.equal(headerAfterRev.totalDueAmount.toString(), '500');

    const examDetailAfterRev = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: examDetailSched.id } });
    assert.equal(examDetailAfterRev.amountPaid.toString(), '300');

    // 6. PaymentReversalEvent recorded
    const revEvent = await db.paymentReversalEvent.findUniqueOrThrow({
      where: { feePaymentId: payFinalRes.id },
    });
    assert.equal(revEvent.idempotencyKey, revFinalKey);
    assert.equal(revEvent.reversalAmount.toString(), '500');

    // 7. Idempotent reversal replay
    const replayRevRes = await paymentService.reverseAdmissionPayment(
      admScheduledId,
      payFinalRes.id,
      {
        idempotencyKey: revFinalKey,
        reason: 'Correction of final installment payment',
      },
      userId
    );
    assert.equal(replayRevRes.statusCode, 200);
    assert.equal(replayRevRes.isReplay, true);
    console.log('   ✓ Reversal of payment settling single installment verified with projection restoration & idempotency');

    // --- Sub-Scenario 5B: Multi-installment reversal of Payment 2 (pay2Res) ---
    console.log('6B. Sub-Scenario 5B: Multi-installment reversal affecting both Inst 1 and Inst 2...');
    const rev2Key = `rev-sched-2-${suffix}`;
    const rev2Res = await paymentService.reverseAdmissionPayment(
      admScheduledId,
      pay2Res.id,
      {
        idempotencyKey: rev2Key,
        reason: 'Reversing multi-installment payment 2',
      },
      userId
    );

    assert.equal(rev2Res.statusCode, 200);

    // Verify in PostgreSQL:
    // Both allocations for pay2Res have reversedAmount = allocatedAmount
    const pay2Allocs = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentId: pay2Res.id },
    });
    assert.equal(pay2Allocs.length, 2, 'Payment 2 had 2 allocations');
    for (const alloc of pay2Allocs) {
      assert.equal(alloc.reversedAmount.toString(), alloc.allocatedAmount.toString(), 'reversedAmount matches allocatedAmount');
    }

    // Inst 1: originally 800. Had pay1 (500) + pay2 (300). With pay2 reversed, net is 500 < 800 -> PENDING, paidAt = null
    const inst1AfterRev2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst1.id } });
    assert.equal(inst1AfterRev2.status, InstallmentRowStatus.PENDING, 'Inst 1 reverts to PENDING');
    assert.equal(inst1AfterRev2.paidAt, null, 'Inst 1 paidAt reset to null');

    // Inst 2: originally 700. Had pay2 (300) + pay3 (400). With pay2 reversed, net is 400 < 700 -> PENDING, paidAt = null
    const inst2AfterRev2 = await db.admissionInstallment.findUniqueOrThrow({ where: { id: inst2.id } });
    assert.equal(inst2AfterRev2.status, InstallmentRowStatus.PENDING, 'Inst 2 reverts to PENDING');
    assert.equal(inst2AfterRev2.paidAt, null, 'Inst 2 paidAt reset to null');

    console.log('   ✓ Multi-installment reversal independently re-evaluates and reverts both installments to PENDING');

    // --- Sub-Scenario 5C: Grandfathered payment reversal ---
    console.log('6C. Sub-Scenario 5C: Grandfathered unscheduled V0 payment reversal...');
    const revGfKey = `rev-gf-${suffix}`;
    const revGfRes = await paymentService.reverseAdmissionPayment(
      admGrandfatheredId,
      grandPayRes.id,
      {
        idempotencyKey: revGfKey,
        reason: 'Reversing grandfathered payment',
      },
      userId
    );

    assert.equal(revGfRes.statusCode, 200);

    // Verify in PostgreSQL:
    // Header paid dropped back to initial grandfathered amount (200)
    const headerGfAfterRev = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerGrand.id } });
    assert.equal(headerGfAfterRev.totalPaidAmount.toString(), '200');
    assert.equal(headerGfAfterRev.totalDueAmount.toString(), '1800');

    // Tuition detail amountPaid dropped back to initial (200)
    const tuitionGfAfterRev = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionDetailGrand.id } });
    assert.equal(tuitionGfAfterRev.amountPaid.toString(), '200');

    // Zero installment allocations exist for grandfathered header
    const gfAllocCount = await db.feePaymentInstallmentAllocation.count({
      where: { feePaymentHeaderId: headerGrand.id },
    });
    assert.equal(gfAllocCount, 0, 'Zero installment allocations for grandfathered admission');
    console.log('   ✓ Grandfathered payment reversal verified: component-only with zero installment allocations');

    // --- Sub-Scenario 5D: Controlled failure-injection atomic rollback during reversal ---
    console.log('6D. Sub-Scenario 5D: Controlled failure injection during reversal persistence...');
    const admRevRollback = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Rev Rollback Student',
      gender: 'FEMALE' as any,
      dateOfBirth: new Date('2015-04-04'),
      parentName: 'Parent Rev Rollback',
      parentRelation: 'MOTHER' as any,
      parentPhone: '9876543218',
      parentEmail: 'parent.revrollback@example.com',
      addressLine1: 'Address Rev Rollback',
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
    admRollbackRevId = admRevRollback.id;

    const headerRevRollback = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admRollbackRevId },
    });
    const tuitionRevRollback = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeaderId: headerRevRollback.id, feeComponentId: compTuitionId },
    });

    const schedRevRollback = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId,
        admissionId: admRollbackRevId,
        feePaymentHeaderId: headerRevRollback.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('2000.00'),
        installmentCount: 1,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerRevRollback.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal(0),
              label: 'Single Term',
              amount: new Prisma.Decimal('2000.00'),
              dueDate: new Date('2026-11-20T00:00:00.000Z'),
              status: InstallmentRowStatus.PENDING,
            },
          ],
        },
      },
      include: { installments: true },
    });
    const instRevRollback = schedRevRollback.installments[0];

    // Create payment settling the installment partially
    const payToReverse = await paymentService.createAdmissionPayment(
      admRollbackRevId,
      {
        idempotencyKey: `pay-for-rev-rb-${suffix}`,
        amount: '1000.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionRevRollback.id, amount: '1000.00' }],
      },
      userId
    );

    // Pre-reversal baseline in PostgreSQL
    const preRevHeader = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerRevRollback.id } });
    const preRevTuition = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionRevRollback.id } });
    const preRevInst = await db.admissionInstallment.findUniqueOrThrow({ where: { id: instRevRollback.id } });
    const preRevAlloc = await db.feePaymentInstallmentAllocation.findFirstOrThrow({
      where: { feePaymentId: payToReverse.id },
    });
    const preRevLogsCount = await db.financialLog.count({ where: { schoolId } });

    assert.equal(preRevHeader.totalPaidAmount.toString(), '1000');
    assert.equal(preRevTuition.amountPaid.toString(), '1000');
    assert.equal(preRevAlloc.reversedAmount.toString(), '0');

    // Inject failure at financialLog.create during reverseAdmissionPayment
    let revInjectionTriggered = false;
    const revRollbackKey = `rev-rollback-key-${suffix}`;

    await assert.rejects(
      db.$transaction(async (realTx) => {
        const proxiedTx = new Proxy(realTx, {
          get(target: any, prop: string | symbol, receiver: any) {
            if (prop === 'financialLog') {
              const origLog = Reflect.get(target, prop, receiver);
              return new Proxy(origLog, {
                get(logTarget: any, logProp: string | symbol, logReceiver: any) {
                  if (logProp === 'create') {
                    return async () => {
                      revInjectionTriggered = true;
                      throw new Error('INJECTED_FAILURE_DURING_REVERSAL_FINANCIAL_LOG');
                    };
                  }
                  return Reflect.get(logTarget, logProp, logReceiver);
                },
              });
            }
            return Reflect.get(target, prop, receiver);
          },
        });

        return await paymentService.reverseAdmissionPayment(
          admRollbackRevId,
          payToReverse.id,
          {
            idempotencyKey: revRollbackKey,
            reason: 'Rollback test',
          },
          userId,
          undefined,
          proxiedTx
        );
      }),
      (err: any) => {
        return err instanceof Error && err.message === 'INJECTED_FAILURE_DURING_REVERSAL_FINANCIAL_LOG';
      },
      'Transaction must abort with the injected failure during reversal financialLog creation'
    );

    assert.ok(revInjectionTriggered, 'Failure injection during reversal was triggered');

    // Verify complete post-rollback integrity in PostgreSQL:
    const postRevHeader = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerRevRollback.id } });
    assert.equal(postRevHeader.totalPaidAmount.toString(), preRevHeader.totalPaidAmount.toString(), 'Header totalPaidAmount unchanged');
    assert.equal(postRevHeader.totalDueAmount.toString(), preRevHeader.totalDueAmount.toString(), 'Header totalDueAmount unchanged');

    const postRevTuition = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionRevRollback.id } });
    assert.equal(postRevTuition.amountPaid.toString(), preRevTuition.amountPaid.toString(), 'Tuition amountPaid unchanged');

    const postRevAlloc = await db.feePaymentInstallmentAllocation.findFirstOrThrow({
      where: { feePaymentId: payToReverse.id },
    });
    assert.equal(postRevAlloc.reversedAmount.toString(), '0', 'reversedAmount unchanged (0)');

    const postRevInst = await db.admissionInstallment.findUniqueOrThrow({ where: { id: instRevRollback.id } });
    assert.equal(postRevInst.status, preRevInst.status, 'Installment status unchanged');
    assert.equal(postRevInst.paidAt?.toISOString(), preRevInst.paidAt?.toISOString(), 'Installment paidAt unchanged');

    const postRevEventCount = await db.paymentReversalEvent.count({ where: { feePaymentId: payToReverse.id } });
    assert.equal(postRevEventCount, 0, 'No payment reversal event persisted');

    const postRevLogsCount = await db.financialLog.count({ where: { schoolId } });
    assert.equal(postRevLogsCount, preRevLogsCount, 'FinancialLog count unchanged');
    console.log('   ✓ Atomic reversal rollback fully verified across all entities in PostgreSQL');

    console.log('\nALL BE-M5.2 AND BE-M5.3 INTEGRATION TEST SCENARIOS PASSED WITH ZERO ERRORS.');
  } finally {
    console.log('7. Cleaning up disposable test fixtures...');
    const admIds = [admNewId, admGrandfatheredId, admScheduledId, admRollbackId, admRollbackRevId].filter(Boolean) as string[];

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
  console.error('Integration test failed:', err);
  process.exit(1);
});
