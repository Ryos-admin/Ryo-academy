import assert from 'node:assert/strict';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { StudentService } from '../src/student/student.service.js';

class FailingAllocationStudentService extends StudentService {
  protected override createFinancialLog(): Promise<never> {
    throw new Error('Forced failure during financial log insertion to test rollback');
  }
}

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const ids: Record<string, string[]> = {
    schools: [],
    users: [],
    years: [],
    programs: [],
    classes: [],
    sections: [],
    structures: [],
    components: [],
    admissions: [],
    students: [],
    headers: [],
    details: [],
    payments: [],
    logs: [],
  };

  const cleanup = async () =>
    db.$transaction(async (tx: any) => {
      await tx.financialLog.deleteMany({
        where: { OR: [{ id: { in: ids.logs } }, { schoolId: { in: ids.schools } }] },
      });
      await tx.installmentLineageTransferEdge.deleteMany({
        where: { event: { schedule: { admission: { schoolId: { in: ids.schools } } } } },
      });
      await tx.installmentLineageEvent.deleteMany({
        where: { schedule: { admission: { schoolId: { in: ids.schools } } } },
      });
      await tx.feePaymentInstallmentAllocation.deleteMany({
        where: { header: { admission: { schoolId: { in: ids.schools } } } },
      });
      await tx.feePayment.deleteMany({
        where: { OR: [{ id: { in: ids.payments } }, { schoolId: { in: ids.schools } }] },
      });
      await tx.admissionInstallment.deleteMany({
        where: { schedule: { admission: { schoolId: { in: ids.schools } } } },
      });
      await tx.admissionInstallmentSchedule.deleteMany({
        where: { admission: { schoolId: { in: ids.schools } } },
      });
      await tx.feePaymentDetails.deleteMany({ where: { id: { in: ids.details } } });
      await tx.feePaymentHeader.deleteMany({
        where: { OR: [{ id: { in: ids.headers } }, { admission: { schoolId: { in: ids.schools } } }] },
      });
      await tx.student.deleteMany({ where: { id: { in: ids.students } } });
      await tx.admission.deleteMany({ where: { id: { in: ids.admissions } } });
      await tx.feeComponent.deleteMany({ where: { id: { in: ids.components } } });
      await tx.feeStructure.deleteMany({ where: { id: { in: ids.structures } } });
      await tx.section.deleteMany({ where: { id: { in: ids.sections } } });
      await tx.class.deleteMany({ where: { id: { in: ids.classes } } });
      await tx.program.deleteMany({ where: { id: { in: ids.programs } } });
      await tx.academicYear.deleteMany({ where: { id: { in: ids.years } } });
      await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      await tx.school.deleteMany({ where: { id: { in: ids.schools } } });
    });

  try {
    console.log('--- Setting up isolated QA fixtures ---');
    const timestamp = Date.now();
    const school = await db.school.create({
      data: { name: 'QA Integrity School', schoolCode: `QA-INT-${timestamp}` },
    });
    const schoolOther = await db.school.create({
      data: { name: 'QA Other School', schoolCode: `QA-OTH-${timestamp}` },
    });
    ids.schools.push(school.id, schoolOther.id);

    const actor = await db.user.create({
      data: {
        email: `qa-actor-${timestamp}@example.test`,
        passwordHash: 'fixture-hash',
        firstName: 'Integrity',
        lastName: 'Tester',
        schoolId: school.id,
      },
    });
    ids.users.push(actor.id);

    const year = await db.academicYear.create({
      data: {
        name: 'QA 2026-27',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-03-31'),
        schoolId: school.id,
      },
    });
    ids.years.push(year.id);

    const program = await db.program.create({
      data: {
        name: 'QA Primary Program',
        academicYearId: year.id,
        startTime: '08:00',
        endTime: '15:00',
        daysOfWeek: ['MONDAY'],
      },
    });
    ids.programs.push(program.id);

    const cls = await db.class.create({
      data: { name: 'QA Class 1', programId: program.id },
    });
    ids.classes.push(cls.id);

    const section = await db.section.create({
      data: { name: 'QA Section A', classId: cls.id },
    });
    ids.sections.push(section.id);

    // Fee Structure with 2 components: Tuition (60000) + Library (40000) = Total 100000
    const structure = await db.feeStructure.create({
      data: {
        name: 'QA Integrity Fee Structure',
        academicYearId: year.id,
        programId: program.id,
        classId: cls.id,
        totalAmount: 100000,
      },
    });
    ids.structures.push(structure.id);

    const compTuition = await db.feeComponent.create({
      data: {
        name: 'Tuition Fee',
        amount: 60000,
        feeStructureId: structure.id,
        discountApplicable: false,
        isMandatory: true,
      },
    });
    const compLibrary = await db.feeComponent.create({
      data: {
        name: 'Library Fee',
        amount: 40000,
        feeStructureId: structure.id,
        discountApplicable: false,
        isMandatory: true,
      },
    });
    ids.components.push(compTuition.id, compLibrary.id);

    // Helper to create a student with snapshot
    async function createTestStudent(suffix: string) {
      const adm = await db.admission.create({
        data: {
          admissionNumber: `QA-INT-ADM-${suffix}-${Date.now()}`,
          admissionSequence: 1,
          schoolId: school.id,
          academicYearId: year.id,
          programId: program.id,
          classId: cls.id,
          sectionId: section.id,
          studentName: `Student ${suffix}`,
          gender: 'OTHER',
          dateOfBirth: new Date('2015-01-01'),
          createdById: actor.id,
          admissionStatus: 'CONFIRMED',
        },
      });
      ids.admissions.push(adm.id);

      const stu = await db.student.create({
        data: {
          studentName: `Student ${suffix}`,
          studentNumber: `QA-INT-STU-${suffix}-${Date.now()}`,
          admissionId: adm.id,
          gender: 'OTHER',
          dateOfBirth: new Date('2015-01-01'),
        },
      });
      ids.students.push(stu.id);

      const header = await db.feePaymentHeader.create({
        data: {
          admissionId: adm.id,
          academicYearId: year.id,
          feeStructureId: structure.id,
          grossAmount: 100000,
          discountAmount: 0,
          netAmount: 100000,
          totalPaidAmount: 0,
          totalDueAmount: 100000,
          totalFeeAmount: 100000,
        },
      });
      ids.headers.push(header.id);

      const det1 = await db.feePaymentDetails.create({
        data: {
          feePaymentHeaderId: header.id,
          feeComponentId: compTuition.id,
          nameSnapshot: compTuition.name,
          originalAmount: 60000,
          discountApplicable: false,
          isMandatory: true,
          discountAmount: 0,
          finalAmount: 60000,
          totalAmountToBePaid: 60000,
          amountPaid: 0,
          paymentDate: new Date(),
        },
      });
      const det2 = await db.feePaymentDetails.create({
        data: {
          feePaymentHeaderId: header.id,
          feeComponentId: compLibrary.id,
          nameSnapshot: compLibrary.name,
          originalAmount: 40000,
          discountApplicable: false,
          isMandatory: true,
          discountAmount: 0,
          finalAmount: 40000,
          totalAmountToBePaid: 40000,
          amountPaid: 0,
          paymentDate: new Date(),
        },
      });
      ids.details.push(det1.id, det2.id);

      const sched = await db.admissionInstallmentSchedule.create({
        data: {
          schoolId: school.id,
          admissionId: adm.id,
          feePaymentHeaderId: header.id,
          scheduleType: 'CUSTOM',
          totalAmount: 100000,
          installmentCount: 1,
        },
      });
      await db.admissionInstallment.create({
        data: {
          scheduleId: sched.id,
          feePaymentHeaderId: header.id,
          sequence: 1,
          subSequence: 0,
          offsetAmount: 0,
          label: 'Term 1',
          amount: 100000,
          dueDate: new Date('2026-08-15'),
          status: 'PENDING',
        },
      });

      return { student: stu, header, details: [det1, det2] };
    }

    const service = new StudentService(db);

    console.log('--- Test 1: Two simultaneous payments with different keys exceeding balance ---');
    // Student 1 owes 100,000.
    // Request A attempts 70,000. Request B attempts 60,000.
    // Combined = 130,000 > 100,000.
    // Exactly ONE must succeed; the second must be rejected with overpayment error.
    const s1 = await createTestStudent('S1');
    const key1A = '11111111-aaaa-4111-8111-111111111111';
    const key1B = '11111111-bbbb-4111-8111-111111111111';

    const results1 = await Promise.allSettled([
      service.recordStudentFeePayment(s1.student.id, { amount: '70000', idempotencyKey: key1A }, actor.id),
      service.recordStudentFeePayment(s1.student.id, { amount: '60000', idempotencyKey: key1B }, actor.id),
    ]);

    const s1Success = results1.filter((r) => r.status === 'fulfilled');
    const s1Rejected = results1.filter((r) => r.status === 'rejected');

    assert.equal(s1Success.length, 1, 'Exactly one concurrent payment must succeed');
    assert.equal(s1Rejected.length, 1, 'The competing overpayment must be rejected');
    assert.match(
      (s1Rejected[0] as PromiseRejectedResult).reason.message,
      /exceeds the outstanding balance/,
      'Rejection reason must be overpayment error',
    );

    // Verify database state: totalPaidAmount must be <= 100000, never 130000
    const headerS1 = await db.feePaymentHeader.findUnique({ where: { id: s1.header.id } });
    assert.ok(headerS1!.totalPaidAmount.toNumber() <= 100000, 'Total paid cannot exceed total fee');
    assert.equal(
      headerS1!.totalFeeAmount.toNumber() - headerS1!.totalPaidAmount.toNumber(),
      headerS1!.totalDueAmount.toNumber(),
      'Header totalFee - totalPaid == totalDue',
    );
    console.log('✓ Test 1 Passed: Overpayment prevented under concurrency. Paid:', headerS1!.totalPaidAmount.toNumber());

    console.log('--- Test 2: Two simultaneous payments using the SAME idempotency key ---');
    // Request A and Request B submit identical key concurrently.
    // Exactly ONE payment row must be inserted. Both calls should resolve safely.
    const s2 = await createTestStudent('S2');
    const sameKey = '22222222-2222-4222-8222-222222222222';

    const results2 = await Promise.allSettled([
      service.recordStudentFeePayment(s2.student.id, { amount: '35000', idempotencyKey: sameKey }, actor.id),
      service.recordStudentFeePayment(s2.student.id, { amount: '35000', idempotencyKey: sameKey }, actor.id),
    ]);

    assert.equal(results2[0].status, 'fulfilled', 'Call A must succeed');
    assert.equal(results2[1].status, 'fulfilled', 'Call B must succeed via idempotent replay');

    const paymentCountS2 = await db.feePayment.count({ where: { idempotencyKey: sameKey } });
    assert.equal(paymentCountS2, 1, 'Exactly one payment record created for identical key');

    const headerS2 = await db.feePaymentHeader.findUnique({ where: { id: s2.header.id } });
    assert.equal(headerS2!.totalPaidAmount.toNumber(), 35000, 'Header paid amount must be exactly 35,000, not double-counted (70,000)');
    console.log('✓ Test 2 Passed: Identical concurrent idempotency key deduplicated cleanly.');

    console.log('--- Test 3: Concurrent partial payments that collectively equal outstanding balance ---');
    // Student owes 100,000. Payment A = 60,000. Payment B = 40,000.
    // Both must succeed cleanly. Remaining outstanding must become 0.
    const s3 = await createTestStudent('S3');
    const key3A = '33333333-aaaa-4333-8333-333333333333';
    const key3B = '33333333-bbbb-4333-8333-333333333333';

    const results3 = await Promise.allSettled([
      service.recordStudentFeePayment(s3.student.id, { amount: '60000', idempotencyKey: key3A }, actor.id),
      service.recordStudentFeePayment(s3.student.id, { amount: '40000', idempotencyKey: key3B }, actor.id),
    ]);

    assert.equal(results3[0].status, 'fulfilled', 'Payment A (60,000) must succeed');
    assert.equal(results3[1].status, 'fulfilled', 'Payment B (40,000) must succeed');

    const headerS3 = await db.feePaymentHeader.findUnique({ where: { id: s3.header.id } });
    assert.equal(headerS3!.totalPaidAmount.toNumber(), 100000, 'Total paid must equal 100,000');
    assert.equal(headerS3!.totalDueAmount.toNumber(), 0, 'Total due must be 0');

    // Verify component allocation: Tuition (60000) and Library (40000) are fully paid
    const detailsS3 = await db.feePaymentDetails.findMany({ where: { feePaymentHeaderId: s3.header.id } });
    const tuitionDet = detailsS3.find((d) => d.nameSnapshot === 'Tuition Fee');
    const libraryDet = detailsS3.find((d) => d.nameSnapshot === 'Library Fee');
    assert.equal(tuitionDet!.amountPaid.toNumber(), 60000, 'Tuition fully paid');
    assert.equal(libraryDet!.amountPaid.toNumber(), 40000, 'Library fully paid');
    console.log('✓ Test 3 Passed: Concurrent partial payments reached exact 0 outstanding balance without conflict.');

    console.log('--- Test 4: Transaction rollback when downstream write fails ---');
    const s4 = await createTestStudent('S4');
    const failingService = new FailingAllocationStudentService(db);
    const key4 = '44444444-4444-4444-8444-444444444444';

    await assert.rejects(
      () => failingService.recordStudentFeePayment(s4.student.id, { amount: '20000', idempotencyKey: key4 }, actor.id),
      /Forced failure during financial log insertion/,
      'Must reject with the forced error',
    );

    // Verify absolute zero residue from failed transaction
    const paymentS4 = await db.feePayment.findUnique({ where: { idempotencyKey: key4 } });
    assert.equal(paymentS4, null, 'No FeePayment record should exist after rollback');

    const headerS4 = await db.feePaymentHeader.findUnique({ where: { id: s4.header.id } });
    assert.equal(headerS4!.totalPaidAmount.toNumber(), 0, 'Header totalPaidAmount must remain 0');
    assert.equal(headerS4!.totalDueAmount.toNumber(), 100000, 'Header totalDueAmount must remain 100,000');

    const detailsS4 = await db.feePaymentDetails.findMany({ where: { feePaymentHeaderId: s4.header.id } });
    for (const d of detailsS4) {
      assert.equal(d.amountPaid.toNumber(), 0, `Component ${d.nameSnapshot} amountPaid must remain 0`);
    }
    console.log('✓ Test 4 Passed: Transaction fully rolled back; zero residue, balances preserved.');

    console.log('--- Test 5: Idempotency conflict checks (different amount & different student) ---');
    const s5A = await createTestStudent('S5A');
    const s5B = await createTestStudent('S5B');
    const key5 = '55555555-5555-4555-8555-555555555555';

    // Initial valid payment
    await service.recordStudentFeePayment(s5A.student.id, { amount: '25000', idempotencyKey: key5 }, actor.id);

    // Retry with SAME amount -> succeeds idempotently
    const replay = await service.recordStudentFeePayment(s5A.student.id, { amount: '25000', idempotencyKey: key5 }, actor.id);
    assert.equal(replay.fee?.paidAmount, 25000);

    // Retry with DIFFERENT amount -> 409 Conflict
    await assert.rejects(
      () => service.recordStudentFeePayment(s5A.student.id, { amount: '30000', idempotencyKey: key5 }, actor.id),
      ConflictException,
      'Reusing key with different amount must throw ConflictException',
    );

    // Reuse key for DIFFERENT student -> 409 Conflict
    await assert.rejects(
      () => service.recordStudentFeePayment(s5B.student.id, { amount: '25000', idempotencyKey: key5 }, actor.id),
      ConflictException,
      'Reusing key for different student must throw ConflictException',
    );
    console.log('✓ Test 5 Passed: Idempotency prevents key reuse with conflicting intent.');

    console.log('--- Test 6: Financial Reconciliation (Payment events == Component allocations == Header paid) ---');
    const s6 = await createTestStudent('S6');
    // Make 3 sequential payments: 30,000 + 20,000 + 15,000 = 65,000
    const key6A = '66666666-aaaa-4666-8666-666666666666';
    const key6B = '66666666-bbbb-4666-8666-666666666666';
    const key6C = '66666666-cccc-4666-8666-666666666666';

    await service.recordStudentFeePayment(s6.student.id, { amount: '30000', idempotencyKey: key6A }, actor.id);
    await service.recordStudentFeePayment(s6.student.id, { amount: '20000', idempotencyKey: key6B }, actor.id);
    await service.recordStudentFeePayment(s6.student.id, { amount: '15000', idempotencyKey: key6C }, actor.id);

    const feeSnapshot = await service.getStudentFees(s6.student.id);

    // 1. Payment events count and sum
    assert.equal(feeSnapshot.payments.length, 3, 'Payments history must contain exactly 3 FeePayment events');
    const sumPayments = feeSnapshot.payments.reduce((acc, p) => acc + Number(p.amount), 0);
    assert.equal(sumPayments, 65000, 'Sum of FeePayment amounts must equal 65,000');

    // 2. Component allocation sum
    const sumComponentPaid = feeSnapshot.fee!.components.reduce((acc, c) => acc + Number(c.amountPaid), 0);
    assert.equal(sumComponentPaid, 65000, 'Sum of component amountPaid must equal 65,000');

    // 3. Header totalPaidAmount
    assert.equal(feeSnapshot.fee!.paidAmount, 65000, 'Header paidAmount must equal 65,000');
    assert.equal(feeSnapshot.fee!.outstandingAmount, 35000, 'Outstanding must be 35,000');

    // 4. FinancialLog ledger reconciliation
    const financialLogs = await db.financialLog.findMany({
      where: { schoolId: school.id, sourceType: 'FEE_PAYMENT' },
    });
    // Check that each payment has a corresponding FinancialLog entry
    for (const p of feeSnapshot.payments) {
      const matchLog = financialLogs.find((l) => l.sourceId === p.id);
      assert.ok(matchLog, `FinancialLog must exist for payment ${p.id}`);
      assert.equal(matchLog!.amount.toNumber(), Number(p.amount));
    }
    console.log('✓ Test 6 Passed: Full financial reconciliation verified across FeePayment, FeePaymentHeader, FeePaymentDetails, and FinancialLog.');

    console.log('\n========================================');
    console.log('ALL FINANCIAL INTEGRATION TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    console.log('--- Cleaning up QA fixtures ---');
    await cleanup();
    await db.$disconnect();
    console.log('--- Cleanup complete ---');
  }
}

main().catch((err) => {
  console.error('INTEGRATION TEST FAILURE:', err);
  process.exitCode = 1;
});
