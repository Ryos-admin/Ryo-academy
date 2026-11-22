import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import { StudentService } from '../src/student/student.service.js';
import { FeePricingVersion, PaymentMethod, AdmissionStatus } from '../generated/prisma/enums.js';
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
  const studentService = new StudentService(db, undefined, paymentService);

  const suffix = Date.now().toString().slice(-6);
  const schoolAId = `sch-a-${suffix}`;
  const schoolBId = `sch-b-${suffix}`;
  const userAId = `usr-a-${suffix}`;
  const userBId = `usr-b-${suffix}`;
  const academicYearId = `ay-${suffix}`;
  const programId = `prog-${suffix}`;
  const classId = `cls-${suffix}`;
  const sectionId = `sec-${suffix}`;
  const feeStructureId = `fs-${suffix}`;
  const compTuitionId = `fc-tui-${suffix}`;
  const compExamId = `fc-exm-${suffix}`;

  let admissionAId: string | null = null;
  let admissionBId: string | null = null;
  let studentId: string | null = null;
  let legacyHeaderId: string | null = null;

  try {
    console.log('1. Setting up isolated test fixtures across two schools...');
    await db.school.createMany({
      data: [
        { id: schoolAId, name: `QA School A ${suffix}`, schoolCode: `SCH-A-${suffix}` },
        { id: schoolBId, name: `QA School B ${suffix}`, schoolCode: `SCH-B-${suffix}` },
      ],
    });

    await db.user.createMany({
      data: [
        {
          id: userAId,
          schoolId: schoolAId,
          firstName: 'Admin',
          lastName: 'A',
          email: `admin-a-${suffix}@example.com`,
          passwordHash: 'dummy',
        },
        {
          id: userBId,
          schoolId: schoolBId,
          firstName: 'Admin',
          lastName: 'B',
          email: `admin-b-${suffix}@example.com`,
          passwordHash: 'dummy',
        },
      ],
    });

    await db.academicYear.create({
      data: {
        id: academicYearId,
        schoolId: schoolAId,
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
        name: `Master ${suffix}`,
        description: 'V0 Test Master',
        totalAmount: new Prisma.Decimal('1500.00'),
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: true,
        feeComponents: {
          create: [
            {
              id: compTuitionId,
              name: 'Tuition',
              amount: new Prisma.Decimal('1000.00'),
              isMandatory: true,
              discountApplicable: true,
              isActive: true,
            },
            {
              id: compExamId,
              name: 'Examination',
              amount: new Prisma.Decimal('500.00'),
              isMandatory: false,
              discountApplicable: false,
              isActive: true,
            },
          ],
        },
      },
    });

    // Create Admission A in School A
    const admA = await admissionService.create({
      schoolId: schoolAId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Student A',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-01-01'),
      parentName: 'Parent A',
      parentRelation: 'FATHER' as any,
      parentPhone: '9876543210',
      parentEmail: 'parent.a@example.com',
      addressLine1: 'Address A',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userAId,
      components: [
        { feeComponentId: compTuitionId, discountPercentage: '0.00' },
        { feeComponentId: compExamId, discountPercentage: '0.00' },
      ],
    } as any);
    admissionAId = admA.id;

    // Create Admission B in School B
    const admB = await db.admission.create({
      data: {
        admissionNumber: `ADM-B-${suffix}`,
        admissionSequence: 2,
        admissionStatus: AdmissionStatus.DRAFT,
        schoolId: schoolBId,
        academicYearId,
        programId,
        classId,
        sectionId,
        studentName: 'Student B',
        gender: 'FEMALE',
        dateOfBirth: new Date('2015-02-02'),
        parentName: 'Parent B',
        parentPhone: '9876543211',
        parentEmail: 'parent.b@example.com',
        createdById: userBId,
      },
    });
    admissionBId = admB.id;

    const headerA = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admissionAId, isActive: true },
      include: { feePaymentDetails: true },
    });
    const tuitionDetailA = headerA.feePaymentDetails.find((d) => d.feeComponentId === compTuitionId)!;
    const examDetailA = headerA.feePaymentDetails.find((d) => d.feeComponentId === compExamId)!;

    console.log('2. Test Case 0: Payment rejection on unscheduled V0 admission without payment history...');
    await assert.rejects(
      paymentService.createAdmissionPayment(
        admissionAId,
        {
          idempotencyKey: `pay-nosched-${suffix}`,
          amount: '600.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-09T18:00:00.000Z',
          allocations: [{ feePaymentDetailsId: tuitionDetailA.id, amount: '600.00' }],
        },
        userAId
      ),
      (err: any) => {
        return (
          err instanceof ConflictException &&
          err.getResponse()['code'] === 'SCHEDULE_REQUIRED'
        );
      },
      'Unscheduled V0 admission payment must be rejected with 409 SCHEDULE_REQUIRED'
    );
    console.log('   ✓ Unscheduled V0 header without payment history rejected with SCHEDULE_REQUIRED');

    // Create custom schedule on headerA: totalAmount 1500.00 (two installments: 1000.00 and 500.00)
    const scheduleA = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId: schoolAId,
        admissionId: admissionAId,
        feePaymentHeaderId: headerA.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('1500.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: headerA.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 1',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: 'PENDING',
            },
            {
              feePaymentHeaderId: headerA.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 2',
              amount: new Prisma.Decimal('500.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: 'PENDING',
            },
          ],
        },
      },
    });

    console.log('2.1 Test Case 1: Concurrent payments exhausting the same component balance...');
    // We attempt two concurrent payments of 600.00 each on tuitionDetailA (total balance 1000.00)
    // One must succeed (leaving 400 balance), and the other must fail with 400 Bad Request
    const p1 = paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: `pay-conc-1-${suffix}`,
        amount: '600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-09T18:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailA.id, amount: '600.00' }],
      },
      userAId
    );

    const p2 = paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: `pay-conc-2-${suffix}`,
        amount: '600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-09T18:00:00.000Z',
        allocations: [{ feePaymentDetailsId: tuitionDetailA.id, amount: '600.00' }],
      },
      userAId
    );

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent payment succeeds');
    assert.equal(rejected.length, 1, 'Exactly one concurrent payment is rejected');
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason instanceof BadRequestException,
      'Rejected payment failed with BadRequestException (balance exceeded)'
    );
    console.log('   ✓ Balance exhaustion serialized cleanly via Admission lock');

    const successfulPay = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    const detailAttributions = await db.feePaymentDetailAttribution.findMany({
      where: { feePaymentId: successfulPay.id },
    });
    const installmentAllocs = await db.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentId: successfulPay.id },
    });
    assert.equal(detailAttributions.length, 1, 'Exactly one detail attribution record');
    assert.equal(detailAttributions[0].amount.toString(), '600', 'Detail attribution amount is 600.00');
    assert.equal(installmentAllocs.length, 1, 'Exactly one installment allocation record');
    assert.equal(installmentAllocs[0].allocatedAmount.toString(), '600', 'Installment allocation amount is 600.00');
    assert.equal(installmentAllocs[0].reversedAmount.toString(), '0', 'Reversed amount is 0.00');

    // Verify installment 1 row remains untouched and PENDING (no row splitting)
    const inst1Row = await db.admissionInstallment.findFirstOrThrow({
      where: { scheduleId: scheduleA.id, sequence: 1 },
    });
    assert.equal(inst1Row.amount.toString(), '1000', 'Original installment row amount remains 1000.00');
    assert.equal(inst1Row.status, 'PENDING', 'Original installment remains PENDING on partial payment');
    assert.equal(inst1Row.paidAt, null, 'Original installment paidAt remains null on partial payment');
    assert.equal(inst1Row.supersededAt, null, 'Original installment supersededAt remains null');
    console.log('   ✓ Dual attribution persisted in PostgreSQL: detail attribution + installment allocation');
    console.log('   ✓ Partial installment payment leaves row stable: amount untouched, PENDING, no split');

    console.log('3. Test Case 2: Concurrent identical payment requests with same idempotency key...');
    const identicalKey = `pay-identical-${suffix}`;
    const [idRes1, idRes2] = await Promise.all([
      paymentService.createAdmissionPayment(
        admissionAId,
        {
          idempotencyKey: identicalKey,
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-09T18:00:00.000Z',
          allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '200.00' }],
        },
        userAId
      ),
      paymentService.createAdmissionPayment(
        admissionAId,
        {
          idempotencyKey: identicalKey,
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-09T18:00:00.000Z',
          allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '200.00' }],
        },
        userAId
      ),
    ]);

    assert.equal(idRes1.id, idRes2.id, 'Both concurrent identical requests return the same payment record');
    const paymentCount = await db.feePayment.count({ where: { idempotencyKey: identicalKey } });
    assert.equal(paymentCount, 1, 'Exactly one FeePayment record was persisted');
    console.log('   ✓ Concurrent identical idempotency requests resolved without duplicates');

    console.log('4. Test Case 3: Same idempotency key across different admissions (P2002 recovery)...');
    const crossKey = `pay-cross-${suffix}`;
    // First, commit a payment on Admission A with crossKey
    await paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: crossKey,
        amount: '100.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-09T18:00:00.000Z',
        allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '100.00' }],
      },
      userAId
    );

    // Now attempt to use the same crossKey for Admission B
    await assert.rejects(
      paymentService.createAdmissionPayment(
        admissionBId,
        {
          idempotencyKey: crossKey,
          amount: '100.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-09T18:00:00.000Z',
          allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '100.00' }],
        },
        userBId
      ),
      ConflictException,
      'Reusing idempotency key on different admission must be rejected with 409 Conflict'
    );
    console.log('   ✓ P2002 cross-admission key collision recovered with 409 Conflict');

    console.log('5. Test Case 4 & 5: Reversal idempotency, collision, and double reversal...');
    // Create a payment specifically to test reversal
    const targetPayment = await paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: `pay-for-rev-${suffix}`,
        amount: '100.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-09T18:00:00.000Z',
        allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '100.00' }],
      },
      userAId
    );

    const revKey1 = `rev-key-1-${suffix}`;
    const revKey2 = `rev-key-2-${suffix}`;

    // Reversal 1 succeeds
    const revRes1 = await paymentService.reverseAdmissionPayment(
      admissionAId,
      targetPayment.id,
      { idempotencyKey: revKey1, reason: 'Test reversal 1' },
      userAId
    );
    assert.equal(revRes1.statusCode, 200);
    assert.equal(revRes1.isReplay, false);

    // Reversal replay with same key returns 200 isReplay: true
    const revReplay = await paymentService.reverseAdmissionPayment(
      admissionAId,
      targetPayment.id,
      { idempotencyKey: revKey1, reason: 'Test reversal 1' },
      userAId
    );
    assert.equal(revReplay.isReplay, true);

    // Reversal attempt with different key against already reversed payment throws 409 Conflict
    await assert.rejects(
      paymentService.reverseAdmissionPayment(
        admissionAId,
        targetPayment.id,
        { idempotencyKey: revKey2, reason: 'Test reversal 2' },
        userAId
      ),
      ConflictException,
      'Double reversal under different key must throw 409 Conflict'
    );
    console.log('   ✓ Reversal idempotency, replay, and double reversal protection verified');

    console.log('6. Test Case 6: Exact attribution reversal and projection restoration...');
    // Verify detail and header balances after reversal of 100.00
    const detailAfterRev = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: examDetailA.id } });
    const headerAfterRev = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: headerA.id } });

    // Total paid on exam: 200 (from test 3) + 100 (from test 4) = 300 (since the 100 from test 5 was reversed)
    assert.equal(detailAfterRev.amountPaid.toString(), '300');
    // Header total paid: 600 (test 2) + 200 (test 3) + 100 (test 4) = 900
    assert.equal(headerAfterRev.totalPaidAmount.toString(), '900');
    assert.equal(headerAfterRev.totalDueAmount.toString(), '600'); // 1500 - 900

    const revLog = await db.financialLog.findFirst({
      where: { sourceId: targetPayment.id, type: 'FEE_PAYMENT_REVERSAL' },
    });
    assert.ok(revLog, 'FinancialLog for reversal exists');
    assert.equal(revLog.flowType, 'REVERSAL');
    console.log('   ✓ Detail and header projections restored exactly with audit log');

    console.log('7. Test Case 7: Legacy payment without attribution cannot be reversed...');
    // Create a distinct class, legacy fee structure, header and payment without attribution rows
    const legClass = await db.class.create({
      data: { id: `cls-leg-${suffix}`, programId, name: `Legacy Class ${suffix}` },
    });

    const legStructure = await db.feeStructure.create({
      data: {
        id: `fs-leg-${suffix}`,
        academicYearId,
        programId,
        classId: legClass.id,
        name: `Legacy Master ${suffix}`,
        description: 'Legacy Test Master',
        totalAmount: new Prisma.Decimal('500.00'),
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: false,
      },
    });

    const legHdr = await db.feePaymentHeader.create({
      data: {
        admissionId: admissionAId,
        academicYearId,
        feeStructureId: legStructure.id,
        pricingVersion: FeePricingVersion.LEGACY,
        grossAmount: new Prisma.Decimal('500.00'),
        totalFeeAmount: new Prisma.Decimal('500.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        netAmount: new Prisma.Decimal('500.00'),
        totalPaidAmount: new Prisma.Decimal('500.00'),
        totalDueAmount: new Prisma.Decimal('0.00'),
        isActive: false, // Inactive so it doesn't conflict with active header
      },
    });
    legacyHeaderId = legHdr.id;

    const legacyPayment = await db.feePayment.create({
      data: {
        idempotencyKey: `legacy-pay-${suffix}`,
        schoolId: schoolAId,
        userId: userAId,
        admissionId: admissionAId,
        feePaymentHeaderId: legacyHeaderId,
        amount: new Prisma.Decimal('500.00'),
        paymentMethod: PaymentMethod.LEGACY_UNSPECIFIED,
        paymentDate: new Date('2026-09-01'),
      },
    });

    await assert.rejects(
      paymentService.reverseAdmissionPayment(
        admissionAId,
        legacyPayment.id,
        { idempotencyKey: `rev-legacy-${suffix}`, reason: 'Attempt reverse legacy' },
        userAId
      ),
      (err: any) => {
        return (
          err instanceof ConflictException &&
          err.getResponse()['code'] === 'PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE'
        );
      },
      'Legacy payment without attribution records must be rejected with PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE'
    );
    console.log('   ✓ Legacy payment lacking attribution rejected safely from reversal');

    console.log('8. Test Case 8: Student compatibility route branching (V0 vs LEGACY)...');
    // Create student linked to admissionA
    const student = await db.student.create({
      data: {
        studentNumber: `STU-${suffix}`,
        studentName: 'Student A',
        admissionId: admissionAId,
        gender: 'MALE',
        dateOfBirth: new Date('2015-01-01'),
      },
    });
    studentId = student.id;

    // Student payment on V0 header without allocations must throw BadRequestException
    await assert.rejects(
      studentService.recordStudentFeePayment(
        studentId,
        {
          idempotencyKey: `stu-pay-fail-${suffix}`,
          amount: '100.00',
          feePaymentHeaderId: headerA.id,
        } as any,
        userAId
      ),
      BadRequestException,
      'Student route must reject V0 payments missing component allocations'
    );

    // Student payment on V0 header with allocations and CASH delegates and succeeds
    await studentService.recordStudentFeePayment(
      studentId,
      {
        idempotencyKey: `stu-pay-v0-ok-${suffix}`,
        amount: '100.00',
        feePaymentHeaderId: headerA.id,
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-09T18:00:00.000Z',
        allocations: [{ feePaymentDetailsId: examDetailA.id, amount: '100.00' }],
      } as any,
      userAId
    );
    console.log('   ✓ Student compatibility route enforces V0 explicit allocations on V0 headers');

    console.log('All 10 BE-M3 Integration & Concurrency assertions passed cleanly!');
  } finally {
    console.log('9. Cleaning up test fixtures...');
    if (studentId) {
      await db.student.deleteMany({ where: { id: studentId } });
    }
    if (admissionAId || admissionBId) {
      const admIds = [admissionAId, admissionBId].filter(Boolean) as string[];
      await db.financialLog.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId] } },
      });
      await db.paymentReversalEvent.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId] } },
      });
      await db.feePaymentInstallmentAllocation.deleteMany({
        where: { header: { admissionId: { in: admIds } } },
      });
      await db.feePaymentDetailAttribution.deleteMany({
        where: { feePayment: { admissionId: { in: admIds } } },
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
      await db.feePaymentDetails.deleteMany({
        where: { feePaymentHeader: { admissionId: { in: admIds } } },
      });
      await db.feePaymentHeader.deleteMany({
        where: { admissionId: { in: admIds } },
      });
      await db.admission.deleteMany({
        where: { id: { in: admIds } },
      });
    }
    await db.feeComponent.deleteMany({ where: { feeStructureId } });
    await db.feeStructure.deleteMany({ where: { id: { in: [feeStructureId, `fs-leg-${suffix}`] } } });
    await db.section.deleteMany({ where: { id: sectionId } });
    await db.class.deleteMany({ where: { id: { in: [classId, `cls-leg-${suffix}`] } } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.academicYear.deleteMany({ where: { id: academicYearId } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });

    // Verify residue
    const remPayments = await db.feePayment.count({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    const remSchools = await db.school.count({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    assert.equal(remPayments, 0, 'Zero payment residue');
    assert.equal(remSchools, 0, 'Zero school residue');
    console.log('   ✓ Guaranteed teardown complete. Zero residue verified.');

    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
