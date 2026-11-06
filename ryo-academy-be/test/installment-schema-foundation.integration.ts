import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  console.log('--- Setting up isolated QA fixtures for Task 04B.1 Schema Foundation ---');

  const schoolId = 'sch-test-' + Date.now();
  const schoolCode = 'SCH-' + Math.floor(Math.random() * 1000000);
  const userId = 'usr-test-' + Date.now();
  const academicYearId = 'ay-test-' + Date.now();
  const programId = 'prg-test-' + Date.now();
  const classId = 'cls-test-' + Date.now();
  const sectionId = 'sec-test-' + Date.now();
  const feeStructureId = 'fs-test-' + Date.now();
  const admissionId1 = 'adm-test-1-' + Date.now();
  const admissionId2 = 'adm-test-2-' + Date.now();
  const studentId1 = 'stu-test-1-' + Date.now();
  const headerId1 = 'hdr-test-1-' + Date.now();
  const headerId2 = 'hdr-test-2-' + Date.now();
  const paymentId1 = 'pay-test-1-' + Date.now();
  const paymentId2 = 'pay-test-2-' + Date.now();

  try {
    // 1. Create base tenant hierarchy
    await db.school.create({
      data: {
        id: schoolId,
        name: 'QA Test School',
        schoolCode,
      },
    });

    await db.user.create({
      data: {
        id: userId,
        email: `qa-actor-${Date.now()}@example.com`,
        passwordHash: 'dummy',
        firstName: 'QA',
        lastName: 'Actor',
        schoolId,
      },
    });

    await db.academicYear.create({
      data: {
        id: academicYearId,
        name: '2026-2027',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-04-30'),
        schoolId,
      },
    });

    await db.program.create({
      data: {
        id: programId,
        name: 'ICSE High',
        academicYearId,
        startTime: '08:00',
        endTime: '15:00',
        daysOfWeek: ['MONDAY'],
      },
    });

    await db.class.create({
      data: {
        id: classId,
        name: 'Grade 10',
        programId,
      },
    });

    await db.section.create({
      data: {
        id: sectionId,
        name: 'Section A',
        classId,
      },
    });

    await db.feeStructure.create({
      data: {
        id: feeStructureId,
        name: 'Annual Tuition 2026',
        academicYearId,
        programId,
        classId,
        totalAmount: 100000,
      },
    });

    // 2. Create two admissions and headers
    await db.admission.create({
      data: {
        id: admissionId1,
        admissionNumber: 'ADM-04B-01-' + Date.now(),
        admissionSequence: 1,
        schoolId,
        academicYearId,
        programId,
        classId,
        sectionId,
        studentName: 'Student One',
        gender: 'MALE',
        dateOfBirth: new Date('2010-01-01'),
        createdById: userId,
      },
    });

    await db.admission.create({
      data: {
        id: admissionId2,
        admissionNumber: 'ADM-04B-02-' + Date.now(),
        admissionSequence: 2,
        schoolId,
        academicYearId,
        programId,
        classId,
        sectionId,
        studentName: 'Student Two',
        gender: 'FEMALE',
        dateOfBirth: new Date('2010-02-02'),
        createdById: userId,
      },
    });

    await db.student.create({
      data: {
        id: studentId1,
        studentName: 'Student One',
        studentNumber: 'STU-04B-01-' + Date.now(),
        admissionId: admissionId1,
        gender: 'MALE',
        dateOfBirth: new Date('2010-01-01'),
      },
    });

    await db.feePaymentHeader.create({
      data: {
        id: headerId1,
        admissionId: admissionId1,
        academicYearId,
        feeStructureId,
        grossAmount: 100000,
        discountAmount: 0,
        netAmount: 100000,
        totalFeeAmount: 100000,
        totalPaidAmount: 0,
        totalDueAmount: 100000,
      },
    });

    await db.feePaymentHeader.create({
      data: {
        id: headerId2,
        admissionId: admissionId2,
        academicYearId,
        feeStructureId,
        grossAmount: 100000,
        discountAmount: 0,
        netAmount: 100000,
        totalFeeAmount: 100000,
        totalPaidAmount: 0,
        totalDueAmount: 100000,
      },
    });

    await db.feePayment.create({
      data: {
        id: paymentId1,
        idempotencyKey: 'pay-key-1-' + Date.now(),
        schoolId,
        userId,
        studentId: studentId1,
        admissionId: admissionId1,
        feePaymentHeaderId: headerId1,
        amount: 50000,
        paymentDate: new Date(),
      },
    });

    await db.feePayment.create({
      data: {
        id: paymentId2,
        idempotencyKey: 'pay-key-2-' + Date.now(),
        schoolId,
        userId,
        studentId: studentId1,
        admissionId: admissionId1,
        feePaymentHeaderId: headerId1,
        amount: 25000,
        paymentDate: new Date(),
      },
    });

    console.log('✓ Base QA fixtures provisioned successfully.');

    // ------------------------------------------------------------------------
    // TEST 1: Schedule Admission & Header Ownership (fk_schedule_header_admission)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: Schedule Admission/Header Composite Ownership ---');
    // Positive test: schedule matching header admission
    const schedule1Id = 'schd-1-' + Date.now();
    await db.admissionInstallmentSchedule.create({
      data: {
        id: schedule1Id,
        schoolId,
        admissionId: admissionId1,
        feePaymentHeaderId: headerId1,
        scheduleType: 'CUSTOM',
        totalAmount: 100000,
        installmentCount: 2,
      },
    });
    console.log('✓ Positive: Schedule created with matching header and admission');

    // Negative test: attempt to create schedule pairing headerId1 with admissionId2
    let crossScheduleError: any = null;
    try {
      await db.admissionInstallmentSchedule.create({
        data: {
          id: 'schd-mismatch-' + Date.now(),
          schoolId,
          admissionId: admissionId2, // Mismatched! Header 1 belongs to Admission 1
          feePaymentHeaderId: headerId2, // Wait, Header 2 belongs to Admission 2, so let's cross-pair
        },
      });
    } catch (e: any) {
      crossScheduleError = e;
    }
    // Now cross-pair: headerId2 (belongs to admission 2) with admissionId1
    let crossPairError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "AdmissionInstallmentSchedule" 
          ("id", "schoolId", "admissionId", "feePaymentHeaderId", "scheduleType", "totalAmount", "installmentCount", "updatedAt")
        VALUES 
          ('schd-mismatch-${Date.now()}', '${schoolId}', '${admissionId1}', '${headerId2}', 'CUSTOM', 100000, 2, NOW());
      `);
    } catch (e: any) {
      crossPairError = e;
    }
    assert.ok(crossPairError, 'Cross-admission schedule creation must fail');
    assert.match(crossPairError.message, /fk_schedule_header_admission|23503/);
    console.log('✓ Negative: Rejected cross-admission schedule with fk_schedule_header_admission (23503)');

    // ------------------------------------------------------------------------
    // TEST 2: Installments and Lineage Edges (Composite FKs & MATCH SIMPLE)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Installments & Lineage Edge Schedule Ownership ---');
    const inst1Id = 'inst-1-' + Date.now();
    const inst2Id = 'inst-2-' + Date.now();

    await db.admissionInstallment.createMany({
      data: [
        {
          id: inst1Id,
          scheduleId: schedule1Id,
          feePaymentHeaderId: headerId1,
          sequence: 1,
          subSequence: 0,
          offsetAmount: 0,
          label: 'Installment 1',
          amount: 50000,
          dueDate: new Date('2026-07-01'),
          status: 'PENDING',
        },
        {
          id: inst2Id,
          scheduleId: schedule1Id,
          feePaymentHeaderId: headerId1,
          sequence: 2,
          subSequence: 0,
          offsetAmount: 0,
          label: 'Installment 2',
          amount: 50000,
          dueDate: new Date('2026-09-01'),
          status: 'PENDING',
        },
      ],
    });

    // Also provision Schedule 2 and Installment 3 for cross-schedule negative tests
    const schedule2Id = 'schd-2-' + Date.now();
    await db.admissionInstallmentSchedule.create({
      data: {
        id: schedule2Id,
        schoolId,
        admissionId: admissionId2,
        feePaymentHeaderId: headerId2,
        scheduleType: 'CUSTOM',
        totalAmount: 100000,
        installmentCount: 1,
      },
    });

    const inst3Id = 'inst-3-' + Date.now();
    await db.admissionInstallment.create({
      data: {
        id: inst3Id,
        scheduleId: schedule2Id,
        feePaymentHeaderId: headerId2,
        sequence: 1,
        subSequence: 0,
        offsetAmount: 0,
        label: 'Schedule 2 Installment 1',
        amount: 100000,
        dueDate: new Date('2026-08-01'),
        status: 'PENDING',
      },
    });

    // ------------------------------------------------------------------------
    // TEST 2A: Installment Amount CHECK (chk_installment_positive_amount)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2A: Installment Amount Positive CHECK ---');
    // Negative: Installment with zero amount
    let zeroInstAmountError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "AdmissionInstallment"
          ("id", "scheduleId", "feePaymentHeaderId", "sequence", "subSequence", "offsetAmount", "label", "amount", "dueDate", "status", "updatedAt")
        VALUES
          ('inst-zero-${Date.now()}', '${schedule1Id}', '${headerId1}', 99, 0, 0, 'Zero Installment', 0, NOW(), 'PENDING', NOW());
      `);
    } catch (e: any) {
      zeroInstAmountError = e;
    }
    assert.ok(zeroInstAmountError, 'Installment with zero amount must fail');
    assert.match(zeroInstAmountError.message, /chk_installment_positive_amount|23514/);
    console.log('✓ Negative: Rejected zero installment amount with chk_installment_positive_amount (23514)');

    // Negative: Installment with negative amount
    let negInstAmountError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "AdmissionInstallment"
          ("id", "scheduleId", "feePaymentHeaderId", "sequence", "subSequence", "offsetAmount", "label", "amount", "dueDate", "status", "updatedAt")
        VALUES
          ('inst-neg-${Date.now()}', '${schedule1Id}', '${headerId1}', 98, 0, 0, 'Negative Installment', -1000, NOW(), 'PENDING', NOW());
      `);
    } catch (e: any) {
      negInstAmountError = e;
    }
    assert.ok(negInstAmountError, 'Installment with negative amount must fail');
    assert.match(negInstAmountError.message, /chk_installment_positive_amount|23514/);
    console.log('✓ Negative: Rejected negative installment amount with chk_installment_positive_amount (23514)');

    const lineageEventId = 'lin-evt-1-' + Date.now();
    await db.installmentLineageEvent.create({
      data: {
        id: lineageEventId,
        scheduleId: schedule1Id,
        eventType: 'INITIAL_SCHEDULE',
        description: 'Initial schedule creation',
      },
    });

    // Positive: Initial transfer edge with sourceInstallmentId = null (MATCH SIMPLE)
    const edge1Id = 'edge-1-' + Date.now();
    await db.installmentLineageTransferEdge.create({
      data: {
        id: edge1Id,
        eventId: lineageEventId,
        scheduleId: schedule1Id,
        sourceInstallmentId: null, // External obligation
        resultInstallmentId: inst1Id,
        amount: 50000,
      },
    });
    console.log('✓ Positive: MATCH SIMPLE accepts initial edge with null source installment');

    // Negative: Transfer edge with negative amount
    let negAmountError: any = null;
    try {
      await db.installmentLineageTransferEdge.create({
        data: {
          id: 'edge-neg-' + Date.now(),
          eventId: lineageEventId,
          scheduleId: schedule1Id,
          sourceInstallmentId: null,
          resultInstallmentId: inst2Id,
          amount: -500,
        },
      });
    } catch (e: any) {
      negAmountError = e;
    }
    assert.ok(negAmountError, 'Negative transfer edge amount must fail');
    assert.match(negAmountError.message, /chk_transfer_edge_positive_amount|23514/);
    console.log('✓ Negative: Rejected negative transfer amount with chk_transfer_edge_positive_amount (23514)');

    // ------------------------------------------------------------------------
    // TEST 2B: Lineage Source Ownership (fk_edge_source_installment_schedule)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2B: Lineage Source Schedule Ownership ---');
    const rescheduleEventId = 'lin-evt-2-' + Date.now();
    await db.installmentLineageEvent.create({
      data: {
        id: rescheduleEventId,
        scheduleId: schedule1Id,
        eventType: 'MANUAL_RESCHEDULE',
        description: 'Reschedule split',
      },
    });

    // Positive: Valid source installment from same schedule (inst1Id from schedule1Id)
    const edgeValidSourceId = 'edge-src-valid-' + Date.now();
    await db.installmentLineageTransferEdge.create({
      data: {
        id: edgeValidSourceId,
        eventId: rescheduleEventId,
        scheduleId: schedule1Id,
        sourceInstallmentId: inst1Id,
        resultInstallmentId: inst2Id,
        amount: 25000,
      },
    });
    console.log('✓ Positive: Transfer edge with valid source installment from same schedule accepted');

    // Negative: Source installment from a different schedule (inst3Id from schedule2Id into schedule1Id edge)
    let crossScheduleSourceError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "InstallmentLineageTransferEdge"
          ("id", "eventId", "scheduleId", "sourceInstallmentId", "resultInstallmentId", "amount")
        VALUES
          ('edge-cross-src-${Date.now()}', '${rescheduleEventId}', '${schedule1Id}', '${inst3Id}', '${inst2Id}', 10000);
      `);
    } catch (e: any) {
      crossScheduleSourceError = e;
    }
    assert.ok(crossScheduleSourceError, 'Transfer edge with source installment from different schedule must fail');
    assert.match(crossScheduleSourceError.message, /fk_edge_source_installment_schedule|23503/);
    console.log('✓ Negative: Rejected source installment from different schedule with fk_edge_source_installment_schedule (23503)');

    // ------------------------------------------------------------------------
    // TEST 2C: Lineage Result Ownership (fk_edge_result_installment_schedule)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2C: Lineage Result Schedule Ownership ---');
    // Negative: Result installment from a different schedule (inst3Id from schedule2Id into schedule1Id edge)
    let crossScheduleResultError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "InstallmentLineageTransferEdge"
          ("id", "eventId", "scheduleId", "sourceInstallmentId", "resultInstallmentId", "amount")
        VALUES
          ('edge-cross-res-${Date.now()}', '${rescheduleEventId}', '${schedule1Id}', '${inst1Id}', '${inst3Id}', 10000);
      `);
    } catch (e: any) {
      crossScheduleResultError = e;
    }
    assert.ok(crossScheduleResultError, 'Transfer edge with result installment from different schedule must fail');
    assert.match(crossScheduleResultError.message, /fk_edge_result_installment_schedule|23503/);
    console.log('✓ Negative: Rejected result installment from different schedule with fk_edge_result_installment_schedule (23503)');

    // ------------------------------------------------------------------------
    // TEST 3: Allocation Header Ownership (fk_alloc_payment_header & fk_alloc_installment_header)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Allocation Header Ownership ---');
    const alloc1Id = 'alloc-1-' + Date.now();
    await db.feePaymentInstallmentAllocation.create({
      data: {
        id: alloc1Id,
        feePaymentId: paymentId1,
        installmentId: inst1Id,
        feePaymentHeaderId: headerId1,
        allocatedAmount: 50000,
        reversedAmount: 0,
      },
    });
    console.log('✓ Positive: Allocation created with matching payment, installment, and header');

    // Negative: Allocation pairing payment from header 1 with installment from header 2 (violating fk_alloc_payment_header)
    let crossHeaderAllocError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "FeePaymentInstallmentAllocation"
          ("id", "feePaymentId", "installmentId", "feePaymentHeaderId", "allocatedAmount", "reversedAmount", "updatedAt")
        VALUES
          ('alloc-cross-${Date.now()}', '${paymentId1}', '${inst1Id}', '${headerId2}', 1000, 0, NOW());
      `);
    } catch (e: any) {
      crossHeaderAllocError = e;
    }
    assert.ok(crossHeaderAllocError, 'Allocation with mismatched header must fail');
    assert.match(crossHeaderAllocError.message, /fk_alloc_payment_header|23503/);
    console.log('✓ Negative: Rejected cross-header allocation with fk_alloc_payment_header (23503)');

    // ------------------------------------------------------------------------
    // TEST 3B: Isolated Allocation Installment Header Ownership (fk_alloc_installment_header)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3B: Isolated Allocation Installment Header Ownership ---');
    // Here: feePaymentId = paymentId1, feePaymentHeaderId = headerId1 -> fk_alloc_payment_header PASSES!
    // installmentId = inst3Id (which belongs to headerId2) -> fk_alloc_installment_header FAILS specifically!
    let crossHeaderInstallmentError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "FeePaymentInstallmentAllocation"
          ("id", "feePaymentId", "installmentId", "feePaymentHeaderId", "allocatedAmount", "reversedAmount", "updatedAt")
        VALUES
          ('alloc-cross-inst-${Date.now()}', '${paymentId1}', '${inst3Id}', '${headerId1}', 1000, 0, NOW());
      `);
    } catch (e: any) {
      crossHeaderInstallmentError = e;
    }
    assert.ok(crossHeaderInstallmentError, 'Allocation pairing installment from different header must fail');
    assert.match(crossHeaderInstallmentError.message, /fk_alloc_installment_header|23503/);
    console.log('✓ Negative: Specifically isolated and rejected cross-header installment with fk_alloc_installment_header (23503)');

    // ------------------------------------------------------------------------
    // TEST 3C: Allocation Reversed Amount Counter CHECK (chk_alloc_non_negative_reversed_amount)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3C: Allocation Reversed Amount Non-Negative CHECK ---');
    // Positive: Non-zero positive reversed amount accepted
    await db.feePaymentInstallmentAllocation.update({
      where: { id: alloc1Id },
      data: { reversedAmount: 5000 },
    });
    console.log('✓ Positive: Positive reversedAmount accepted');

    // Negative: Negative reversed amount rejected
    let negReversedAmountError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "FeePaymentInstallmentAllocation"
          ("id", "feePaymentId", "installmentId", "feePaymentHeaderId", "allocatedAmount", "reversedAmount", "updatedAt")
        VALUES
          ('alloc-neg-rev-${Date.now()}', '${paymentId1}', '${inst1Id}', '${headerId1}', 5000, -100, NOW());
      `);
    } catch (e: any) {
      negReversedAmountError = e;
    }
    assert.ok(negReversedAmountError, 'Negative reversedAmount must fail');
    assert.match(negReversedAmountError.message, /chk_alloc_non_negative_reversed_amount|23514/);
    console.log('✓ Negative: Rejected negative reversedAmount with chk_alloc_non_negative_reversed_amount (23514)');

    // ------------------------------------------------------------------------
    // TEST 4: Reversal-to-Allocation Payment Ownership (Dual Composite Keys)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Reversal-to-Allocation Payment Ownership ---');
    const revEvent1Id = 'rev-evt-1-' + Date.now();
    await db.paymentReversalEvent.create({
      data: {
        id: revEvent1Id,
        feePaymentId: paymentId1,
        schoolId,
        reversalAmount: 50000,
        reason: 'Duplicate payment made in error',
        idempotencyKey: 'idem-rev-1-' + Date.now(),
        reversedByUserId: userId,
      },
    });

    // Positive: Reversal adjustment matching paymentId1
    const iarId = 'iar-1-' + Date.now();
    await db.installmentAllocationReversalEvent.create({
      data: {
        id: iarId,
        paymentReversalEventId: revEvent1Id,
        allocationId: alloc1Id,
        feePaymentId: paymentId1,
        amount: 50000,
      },
    });
    console.log('✓ Positive: Reversal adjustment created with matching payment, event, and allocation');

    // Create a second allocation for paymentId1 on inst2Id so (revEvent1Id, alloc2Id) does not violate uniqueness
    const alloc2Id = 'alloc-2-' + Date.now();
    await db.feePaymentInstallmentAllocation.create({
      data: {
        id: alloc2Id,
        feePaymentId: paymentId1,
        installmentId: inst2Id,
        feePaymentHeaderId: headerId1,
        allocatedAmount: 25000,
        reversedAmount: 0,
      },
    });

    // Independent Negative Test 1: Reversal Event from Payment 1 paired with Payment 2's ID
    let crossPaymentRevError1: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "InstallmentAllocationReversalEvent"
          ("id", "paymentReversalEventId", "allocationId", "feePaymentId", "amount", "createdAt")
        VALUES
          ('iar-cross-1-${Date.now()}', '${revEvent1Id}', '${alloc2Id}', '${paymentId2}', 10000, NOW());
      `);
    } catch (e: any) {
      crossPaymentRevError1 = e;
    }
    assert.ok(crossPaymentRevError1, 'Mismatched reversal event feePaymentId must fail');
    assert.match(crossPaymentRevError1.message, /fk_reversal_alloc_reversal_event|23503/);
    console.log('✓ Negative 1: Rejected mismatched reversal event with fk_reversal_alloc_reversal_event (23503)');

    // Independent Negative Test 2: Allocation from Payment 1 paired with Reversal Event for Payment 2
    // First create a reversal event for paymentId2
    const revEvent2Id = 'rev-evt-2-' + Date.now();
    await db.paymentReversalEvent.create({
      data: {
        id: revEvent2Id,
        feePaymentId: paymentId2,
        schoolId,
        reversalAmount: 25000,
        reason: 'Payment 2 reversal',
        idempotencyKey: 'idem-rev-2-' + Date.now(),
        reversedByUserId: userId,
      },
    });

    let crossPaymentRevError2: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "InstallmentAllocationReversalEvent"
          ("id", "paymentReversalEventId", "allocationId", "feePaymentId", "amount", "createdAt")
        VALUES
          ('iar-cross-2-${Date.now()}', '${revEvent2Id}', '${alloc1Id}', '${paymentId2}', 10000, NOW());
      `);
    } catch (e: any) {
      crossPaymentRevError2 = e;
    }
    assert.ok(crossPaymentRevError2, 'Mismatched allocation feePaymentId must fail');
    assert.match(crossPaymentRevError2.message, /fk_reversal_alloc_allocation|23503/);
    console.log('✓ Negative 2: Rejected mismatched allocation with fk_reversal_alloc_allocation (23503)');

    // ------------------------------------------------------------------------
    // TEST 5: CHECK Constraints on Reversal Amounts
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: CHECK Constraints on Reversals ---');
    let negRevAmountError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "PaymentReversalEvent"
          ("id", "feePaymentId", "schoolId", "reversalAmount", "reason", "idempotencyKey", "reversedByUserId", "createdAt")
        VALUES
          ('rev-neg-${Date.now()}', 'dummy-pay', '${schoolId}', -500, 'Negative', 'idem-neg-${Date.now()}', '${userId}', NOW());
      `);
    } catch (e: any) {
      negRevAmountError = e;
    }
    assert.ok(negRevAmountError, 'Negative reversalAmount must fail');
    assert.match(negRevAmountError.message, /chk_payment_reversal_positive_amount|23514/);
    console.log('✓ Negative: Rejected negative reversalAmount with chk_payment_reversal_positive_amount (23514)');

    let negAllocRevAmountError: any = null;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "InstallmentAllocationReversalEvent"
          ("id", "paymentReversalEventId", "allocationId", "feePaymentId", "amount", "createdAt")
        VALUES
          ('iar-neg-${Date.now()}', '${revEvent1Id}', '${alloc1Id}', '${paymentId1}', -100, NOW());
      `);
    } catch (e: any) {
      negAllocRevAmountError = e;
    }
    assert.ok(negAllocRevAmountError, 'Negative adjustment amount must fail');
    assert.match(negAllocRevAmountError.message, /chk_alloc_reversal_positive_amount|23514/);
    console.log('✓ Negative: Rejected negative allocation reversal amount with chk_alloc_reversal_positive_amount (23514)');

    // ------------------------------------------------------------------------
    // TEST 6: Idempotency & Unique Reversal per Payment
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: One Reversal per Payment & Idempotency ---');
    let dupPaymentRevError: any = null;
    try {
      await db.paymentReversalEvent.create({
        data: {
          id: 'rev-dup-pay-' + Date.now(),
          feePaymentId: paymentId1, // Already reversed!
          schoolId,
          reversalAmount: 50000,
          reason: 'Second reversal attempt',
          idempotencyKey: 'idem-second-' + Date.now(),
          reversedByUserId: userId,
        },
      });
    } catch (e: any) {
      dupPaymentRevError = e;
    }
    assert.ok(dupPaymentRevError, 'Second reversal for same feePaymentId must fail');
    assert.match(dupPaymentRevError.message, /PaymentReversalEvent_feePaymentId_key|23505/);
    console.log('✓ Negative: Second reversal for same feePaymentId rejected (23505 unique violation)');

    console.log('\n==========================================================');
    console.log('ALL TASK 04B.1 SCHEMA & CONSTRAINT TESTS PASSED CLEANLY!');
    console.log('==========================================================\n');
  } finally {
    // Teardown test fixtures
    console.log('--- Cleaning up QA fixtures ---');
    await db.$executeRawUnsafe(`
      DELETE FROM "InstallmentAllocationReversalEvent" WHERE "feePaymentId" IN ('${paymentId1}', '${paymentId2}');
      DELETE FROM "PaymentReversalEvent" WHERE "feePaymentId" IN ('${paymentId1}', '${paymentId2}');
      DELETE FROM "FeePaymentInstallmentAllocation" WHERE "feePaymentId" IN ('${paymentId1}', '${paymentId2}');
      DELETE FROM "InstallmentLineageTransferEdge" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" = '${schoolId}');
      DELETE FROM "InstallmentLineageEvent" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" = '${schoolId}');
      DELETE FROM "AdmissionInstallment" WHERE "feePaymentHeaderId" IN ('${headerId1}', '${headerId2}');
      DELETE FROM "AdmissionInstallmentSchedule" WHERE "schoolId" = '${schoolId}';
      DELETE FROM "FeePayment" WHERE "schoolId" = '${schoolId}';
      DELETE FROM "Student" WHERE "id" = '${studentId1}';
      DELETE FROM "FeePaymentHeader" WHERE "id" IN ('${headerId1}', '${headerId2}');
      DELETE FROM "Admission" WHERE "id" IN ('${admissionId1}', '${admissionId2}');
      DELETE FROM "FeeStructure" WHERE "id" = '${feeStructureId}';
      DELETE FROM "Section" WHERE "id" = '${sectionId}';
      DELETE FROM "Class" WHERE "id" = '${classId}';
      DELETE FROM "Program" WHERE "id" = '${programId}';
      DELETE FROM "AcademicYear" WHERE "id" = '${academicYearId}';
      DELETE FROM "User" WHERE "id" = '${userId}';
      DELETE FROM "School" WHERE "id" = '${schoolId}';
    `);
    await db.$disconnect();
    console.log('--- Teardown complete ---');
  }
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
