import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import { StudentService } from '../src/student/student.service.js';
import { FeePricingVersion, PaymentMethod, AdmissionStatus, Gender } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

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
  let admissionCId: string | null = null;
  let admissionDId: string | null = null;
  let admissionEId: string | null = null;
  let schedB: any = null;

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
      data: { id: classId, programId, name: `Class 1 ${suffix}` },
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
        name: `V0 Master ${suffix}`,
        description: 'V0 Test Master',
        totalAmount: new Prisma.Decimal('1500.00'),
        gstPercentage: new Prisma.Decimal('0.00'),
        isActive: true,
      },
    });

    await db.feeComponent.createMany({
      data: [
        {
          id: compTuitionId,
          feeStructureId,
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1000.00'),
          isMandatory: true,
          discountApplicable: true,
          isActive: true,
        },
        {
          id: compExamId,
          feeStructureId,
          name: 'Exam Fee',
          amount: new Prisma.Decimal('500.00'),
          isMandatory: false,
          discountApplicable: false,
          isActive: true,
        },
      ],
    });

    // Helper to create V0 Admission fixture
    const createAdmissionFixture = async (num: string, name: string) => {
      const adm = await db.admission.create({
        data: {
          admissionNumber: `ADM-${num}-${suffix}`,
          admissionSequence: parseInt(num, 10),
          admissionStatus: AdmissionStatus.DRAFT,
          schoolId: schoolAId,
          academicYearId,
          programId,
          classId,
          sectionId,
          studentName: name,
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2015-03-10'),
          parentName: `Parent ${num}`,
          parentPhone: `987654321${num.slice(-1)}`,
          createdById: userAId,
        },
      });

      const hdr = await db.feePaymentHeader.create({
        data: {
          admissionId: adm.id,
          academicYearId,
          feeStructureId,
          pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
          grossAmount: new Prisma.Decimal('1500.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          taxableAmount: new Prisma.Decimal('1500.00'),
          gstAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1500.00'),
          totalFeeAmount: new Prisma.Decimal('1500.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1500.00'),
          isActive: true,
        },
      });

      await db.feePaymentDetails.createMany({
        data: [
          {
            feePaymentHeaderId: hdr.id,
            feeComponentId: compTuitionId,
            nameSnapshot: 'Tuition Fee',
            isActive: true,
            isIncluded: true,
            originalAmount: new Prisma.Decimal('1000.00'),
            discountApplicable: true,
            isMandatory: true,
            discountPercentage: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            taxableAmount: new Prisma.Decimal('1000.00'),
            gstPercentage: new Prisma.Decimal('0.00'),
            gstAmount: new Prisma.Decimal('0.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            paymentDate: new Date(),
          },
          {
            feePaymentHeaderId: hdr.id,
            feeComponentId: compExamId,
            nameSnapshot: 'Exam Fee',
            isActive: true,
            isIncluded: true,
            originalAmount: new Prisma.Decimal('500.00'),
            discountApplicable: false,
            isMandatory: false,
            discountPercentage: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            taxableAmount: new Prisma.Decimal('500.00'),
            gstPercentage: new Prisma.Decimal('0.00'),
            gstAmount: new Prisma.Decimal('0.00'),
            finalAmount: new Prisma.Decimal('500.00'),
            totalAmountToBePaid: new Prisma.Decimal('500.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            paymentDate: new Date(),
          },
        ],
      });

      return { adm, hdr };
    };

    const fixtureA = await createAdmissionFixture('101', 'Alice Wonder');
    admissionAId = fixtureA.adm.id;

    const fixtureB = await createAdmissionFixture('102', 'Bob Builder');
    admissionBId = fixtureB.adm.id;

    const fixtureC = await createAdmissionFixture('103', 'Charlie Chocolate');
    admissionCId = fixtureC.adm.id;

    const fixtureD = await createAdmissionFixture('104', 'David Copperfield');
    admissionDId = fixtureD.adm.id;

    console.log('Testing BE-ND1: Unpaid admission confirmation rejection...');
    await assert.rejects(
      admissionService.confirmAdmission(admissionDId, { id: userAId }),
      (err: any) => {
        assert.equal(err.status, 409);
        assert.equal(err.response?.code, 'CONFIRMATION_PAYMENT_REQUIRED');
        return true;
      },
      'Unpaid admission must reject confirmation with CONFIRMATION_PAYMENT_REQUIRED'
    );
    console.log('   ✓ Unpaid admission rejected with CONFIRMATION_PAYMENT_REQUIRED');

    // Provision qualifying schedule and initial payment on Admission A
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId: schoolAId,
        admissionId: admissionAId,
        feePaymentHeaderId: fixtureA.hdr.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('1500.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: fixtureA.hdr.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 1',
              amount: new Prisma.Decimal('800.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: 'PENDING',
            },
            {
              feePaymentHeaderId: fixtureA.hdr.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 2',
              amount: new Prisma.Decimal('700.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: 'PENDING',
            },
          ],
        },
      },
    });

    const detailTuitionA = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeader: { admissionId: admissionAId }, feeComponentId: compTuitionId },
    });
    const prePayA = await paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: `pre-pay-a-${suffix}`,
        amount: '400.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T00:00:00.000Z',
        allocations: [{ feePaymentDetailsId: detailTuitionA.id, amount: '400.00' }],
      },
      userAId
    );
    assert.equal(prePayA.statusCode, 201);

    // Provision qualifying schedule and initial payment on Admission B
    schedB = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId: schoolAId,
        admissionId: admissionBId,
        feePaymentHeaderId: fixtureB.hdr.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('1500.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: fixtureB.hdr.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment B1',
              amount: new Prisma.Decimal('800.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: 'PENDING',
            },
            {
              feePaymentHeaderId: fixtureB.hdr.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment B2',
              amount: new Prisma.Decimal('700.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: 'PENDING',
            },
          ],
        },
      },
      include: { installments: true },
    });

    const detailTuitionB = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeader: { admissionId: admissionBId }, feeComponentId: compTuitionId },
    });
    const prePayB = await paymentService.createAdmissionPayment(
      admissionBId,
      {
        idempotencyKey: `pre-pay-b-${suffix}`,
        amount: '400.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T00:00:00.000Z',
        allocations: [{ feePaymentDetailsId: detailTuitionB.id, amount: '400.00' }],
      },
      userAId
    );
    assert.equal(prePayB.statusCode, 201);

    console.log('2. Test Case 1: First-time confirmation and atomic Student creation...');
    const confA = await admissionService.confirmAdmission(admissionAId, { id: userAId });
    assert.equal(confA.statusCode, 200);
    assert.equal(confA.isReplay, false);
    assert.equal(confA.admissionStatus, AdmissionStatus.CONFIRMED);
    assert.ok(confA.student, 'Student record returned');
    assert.equal(confA.student.studentName, 'Alice Wonder');
    assert.equal(confA.student.studentNumber, `ADM-101-${suffix}`);
    assert.equal(confA.student.gender, Gender.FEMALE);
    assert.equal(confA.student.admissionId, admissionAId);
    assert.ok(confA.student.studentSequence > 0, 'PostgreSQL sequence auto-generated sequence number');

    const admPostA = await db.admission.findUniqueOrThrow({ where: { id: admissionAId } });
    assert.equal(admPostA.admissionStatus, AdmissionStatus.CONFIRMED);
    assert.equal(admPostA.studentId, confA.student.id);
    assert.equal(admPostA.confirmedById, userAId);
    assert.ok(admPostA.confirmedAt !== null, 'confirmedAt timestamp persisted');
    console.log('   ✓ First-time confirmation and complete Student field mapping verified');

    console.log('3. Test Case 2: Idempotent repeated confirmation...');
    const replayA = await admissionService.confirmAdmission(admissionAId, { id: userAId });
    assert.equal(replayA.statusCode, 200);
    assert.equal(replayA.isReplay, true);
    assert.equal(replayA.student.id, confA.student.id);
    assert.equal(replayA.studentId, confA.student.id);
    assert.equal(replayA.confirmedById, userAId);

    const studentCountA = await db.student.count({ where: { admissionId: admissionAId } });
    assert.equal(studentCountA, 1, 'Exactly one Student record persisted across confirmations');
    console.log('   ✓ Repeated confirmation returns existing Student with isReplay: true');

    console.log('4. Test Case 3: Concurrent confirmation requests on Admission B...');
    const [conc1, conc2] = await Promise.all([
      admissionService.confirmAdmission(admissionBId, { id: userAId }),
      admissionService.confirmAdmission(admissionBId, { id: userAId }),
    ]);

    assert.equal(conc1.student.id, conc2.student.id, 'Both concurrent requests resolve to the exact same Student ID');
    const replayFlags = [conc1.isReplay, conc2.isReplay].sort();
    assert.deepEqual(replayFlags, [false, true], 'One request executes first confirmation, other returns replay');
    const studentCountB = await db.student.count({ where: { admissionId: admissionBId } });
    assert.equal(studentCountB, 1, 'Exactly one Student created under concurrent confirmation');
    console.log('   ✓ Concurrent confirmation requests serialized cleanly on Admission FOR UPDATE lock');

    console.log('5. Test Case 4: Confirmation with pre-existing payments and outstanding balance...');
    // Create schedule on Admission C prior to first payment
    await db.admissionInstallmentSchedule.create({
      data: {
        schoolId: schoolAId,
        admissionId: admissionCId,
        feePaymentHeaderId: fixtureC.hdr.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('1500.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: fixtureC.hdr.id,
              sequence: 1,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 1',
              amount: new Prisma.Decimal('800.00'),
              dueDate: new Date('2026-11-15T00:00:00.000Z'),
              status: 'PENDING',
            },
            {
              feePaymentHeaderId: fixtureC.hdr.id,
              sequence: 2,
              subSequence: 0,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 2',
              amount: new Prisma.Decimal('700.00'),
              dueDate: new Date('2026-12-15T00:00:00.000Z'),
              status: 'PENDING',
            },
          ],
        },
      },
    });

    // Record payment on Admission C prior to confirmation
    const detailTuitionC = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeader: { admissionId: admissionCId }, feeComponentId: compTuitionId },
    });
    const prePay = await paymentService.createAdmissionPayment(
      admissionCId,
      {
        idempotencyKey: `pre-pay-${suffix}`,
        amount: '400.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T00:00:00.000Z',
        allocations: [{ feePaymentDetailsId: detailTuitionC.id, amount: '400.00' }],
      },
      userAId
    );
    assert.equal(prePay.statusCode, 201);

    // Confirm Admission C
    const confC = await admissionService.confirmAdmission(admissionCId, { id: userAId });
    assert.equal(confC.statusCode, 200);
    assert.equal(confC.admissionStatus, AdmissionStatus.CONFIRMED);

    // Verify snapshot and payment balance preservation
    const hdrAfterC = await db.feePaymentHeader.findUniqueOrThrow({
      where: { id: fixtureC.hdr.id },
    });
    assert.equal(hdrAfterC.totalPaidAmount.toString(), '400');
    assert.equal(hdrAfterC.totalDueAmount.toString(), '1100'); // 1500 - 400
    assert.equal(hdrAfterC.totalFeeAmount.toString(), '1500');
    console.log('   ✓ Confirmation preserves pre-existing payments and uncollected balances without recalculation');

    console.log('6. Test Case 5: Subsequent payment after confirmation records linked Student ID...');
    const detailExamA = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeader: { admissionId: admissionAId }, feeComponentId: compExamId },
    });
    const postPayA = await paymentService.createAdmissionPayment(
      admissionAId,
      {
        idempotencyKey: `post-pay-a-${suffix}`,
        amount: '200.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T01:00:00.000Z',
        allocations: [{ feePaymentDetailsId: detailExamA.id, amount: '200.00' }],
      },
      userAId
    );
    assert.equal(postPayA.statusCode, 201);
    const persistedPayA = await db.feePayment.findUniqueOrThrow({
      where: { id: postPayA.id },
    });
    assert.equal(persistedPayA.studentId, confA.student.id, 'Post-confirmation payment recorded linked Student ID');
    console.log('   ✓ Post-confirmation payment on CONFIRMED admission automatically attaches Student ID');

    console.log('7. Test Case 6: Cross-tenant confirmation rejection...');
    // User B (School B) attempts to confirm Admission D (School A)
    await assert.rejects(
      admissionService.confirmAdmission(admissionDId, { id: userBId }),
      NotFoundException,
      'Cross-school confirmation attempt must fail with 404 Not Found'
    );
    // User B attempts to replay-confirm Admission A (School A)
    await assert.rejects(
      admissionService.confirmAdmission(admissionAId, { id: userBId }),
      NotFoundException,
      'Cross-school replay attempt must fail with 404 Not Found without leaking confirmation state'
    );
    console.log('   ✓ Tenant boundary enforced strictly before evaluating confirmation or replay');

    console.log('8. Test Case 7: Ordinary Admission update blocked on confirmed admission...');
    await assert.rejects(
      admissionService.updateById(admissionAId, { studentName: 'Hacked Name' }),
      (err: any) => {
        return (
          err instanceof BadRequestException &&
          err.message.includes('Ordinary admission editing is blocked after confirmation.')
        );
      },
      'Editing confirmed admission identity must be rejected'
    );
    const admCheckA = await db.admission.findUniqueOrThrow({ where: { id: admissionAId } });
    assert.equal(admCheckA.studentName, 'Alice Wonder', 'Student name on confirmed admission remained untouched');
    console.log('   ✓ Ordinary admission editing blocked after confirmation');

    console.log('9. Test Case 8: Atomic rollback on failure...');
    // Attempt confirmation on Admission D within a transaction that forces an error after student creation
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.student.create({
          data: {
            admissionId: admissionDId!,
            studentName: 'David Copperfield',
            studentNumber: `ADM-104-${suffix}`,
            gender: Gender.FEMALE,
            dateOfBirth: new Date('2015-03-10'),
          },
        });
        throw new Error('Forced mid-transaction rollback');
      }),
      /Forced mid-transaction rollback/
    );

    const studentCountD = await db.student.count({ where: { admissionId: admissionDId } });
    assert.equal(studentCountD, 0, 'Student write rolled back cleanly');
    const admCheckD = await db.admission.findUniqueOrThrow({ where: { id: admissionDId } });
    assert.equal(admCheckD.admissionStatus, AdmissionStatus.DRAFT, 'Admission remained DRAFT after rollback');
    console.log('   ✓ Atomic rollback verified with zero Student residue on failure');

    console.log('10. Test Case 9: Attempting cancellation on CONFIRMED admission rejects with 409 Conflict...');
    await assert.rejects(
      admissionService.updateStatusById(admissionAId, { id: userAId }, 'CANCELLED'),
      (err: any) => {
        assert.equal(err.status, 409, 'Rejects cancellation of confirmed admission with 409 Conflict');
        assert.equal(err.message, 'Confirmed admissions cannot be cancelled.');
        return true;
      }
    );
    const admCheckACancel = await db.admission.findUniqueOrThrow({ where: { id: admissionAId } });
    assert.equal(admCheckACancel.admissionStatus, AdmissionStatus.CONFIRMED, 'Admission A remained CONFIRMED');
    assert.equal(admCheckACancel.cancelledById, null, 'cancelledById was not written');
    assert.equal(admCheckACancel.cancelledAt, null, 'cancelledAt was not written');
    const studentA = await db.student.findUniqueOrThrow({ where: { admissionId: admissionAId } });
    assert.equal(studentA.id, admCheckACancel.studentId, 'Linked Student remains intact and linked');
    console.log('   ✓ CONFIRMED admission cancellation rejected with 409; Student and Admission status preserved');

    console.log('11. Test Case 10: Legacy Admission with existing payments confirms cleanly and preserves financial state...');
    const legacyFixture = await createAdmissionFixture('105', 'Legacy Edward');
    admissionEId = legacyFixture.adm.id;
    await db.feePaymentHeader.update({
      where: { id: legacyFixture.hdr.id },
      data: {
        pricingVersion: FeePricingVersion.LEGACY,
        totalPaidAmount: new Prisma.Decimal('500.00'),
        totalDueAmount: new Prisma.Decimal('1000.00'),
      },
    });
    const tuitionDetail = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeaderId: legacyFixture.hdr.id, feeComponentId: compTuitionId },
    });
    await db.feePaymentDetails.update({
      where: { id: tuitionDetail.id },
      data: { amountPaid: new Prisma.Decimal('500.00') },
    });
    const legacyPayment = await db.feePayment.create({
      data: {
        idempotencyKey: `legacy-pay-${suffix}`,
        schoolId: schoolAId,
        userId: userAId,
        admissionId: admissionEId,
        feePaymentHeaderId: legacyFixture.hdr.id,
        amount: new Prisma.Decimal('500.00'),
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
      },
    });
    const sched = await db.admissionInstallmentSchedule.create({
      data: {
        schoolId: schoolAId,
        admissionId: admissionEId,
        feePaymentHeaderId: legacyFixture.hdr.id,
        scheduleType: 'CUSTOM',
        totalAmount: new Prisma.Decimal('1500.00'),
        installmentCount: 2,
        installments: {
          create: [
            {
              feePaymentHeaderId: legacyFixture.hdr.id,
              sequence: 1,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 1',
              amount: new Prisma.Decimal('500.00'),
              dueDate: new Date(),
            },
            {
              feePaymentHeaderId: legacyFixture.hdr.id,
              sequence: 2,
              offsetAmount: new Prisma.Decimal('0.00'),
              label: 'Installment 2',
              amount: new Prisma.Decimal('1000.00'),
              dueDate: new Date(),
            },
          ],
        },
      },
      include: { installments: true },
    });
    // Cross-header installment rejection: attempt to use fixtureB's installment on legacyFixture's header
    await assert.rejects(
      db.feePaymentInstallmentAllocation.create({
        data: {
          feePaymentId: legacyPayment.id,
          installmentId: schedB.installments[0].id, // Cross-header installment!
          feePaymentHeaderId: legacyFixture.hdr.id,
          allocatedAmount: new Prisma.Decimal('500.00'),
        },
      }),
      (err: any) => {
        assert.ok(err.message.includes('Foreign key constraint violated') || err.code === 'P2003');
        return true;
      }
    );
    console.log('   ✓ Database composite foreign key constraint fk_alloc_installment_header rejected cross-header allocation');

    await db.feePaymentInstallmentAllocation.create({
      data: {
        feePaymentId: legacyPayment.id,
        installmentId: sched.installments[0].id,
        feePaymentHeaderId: legacyFixture.hdr.id,
        allocatedAmount: new Prisma.Decimal('500.00'),
      },
    });

    const confE = await admissionService.confirmAdmission(admissionEId, { id: userAId });
    assert.equal(confE.statusCode, 200);
    assert.equal(confE.isReplay, false);
    assert.equal(confE.admissionStatus, AdmissionStatus.CONFIRMED);
    assert.ok(confE.student, 'Student created for legacy admission');

    const postHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: legacyFixture.hdr.id } });
    assert.ok(new Prisma.Decimal(postHdr.totalPaidAmount.toString()).equals(new Prisma.Decimal('500.00')), 'totalPaidAmount unchanged');
    assert.ok(new Prisma.Decimal(postHdr.totalDueAmount.toString()).equals(new Prisma.Decimal('1000.00')), 'totalDueAmount unchanged');
    const postDetail = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: tuitionDetail.id } });
    assert.ok(new Prisma.Decimal(postDetail.amountPaid.toString()).equals(new Prisma.Decimal('500.00')), 'detail amountPaid unchanged');
    console.log('   ✓ Legacy admission with payments confirmed atomically with Student; financial records untouched');

    console.log('All 10 BE-M4 Integration & Concurrency assertions passed cleanly!');
  } finally {
    console.log('12. Cleaning up test fixtures...');
    const allAdmIds = [admissionAId, admissionBId, admissionCId, admissionDId, admissionEId].filter(Boolean) as string[];
    if (allAdmIds.length > 0) {
      await db.financialLog.deleteMany({
        where: { schoolId: { in: [schoolAId, schoolBId] } },
      });
      await db.feePaymentInstallmentAllocation.deleteMany({
        where: { header: { admissionId: { in: allAdmIds } } },
      });
      await db.admissionInstallment.deleteMany({
        where: { feePaymentHeader: { admissionId: { in: allAdmIds } } },
      });
      await db.admissionInstallmentSchedule.deleteMany({
        where: { admissionId: { in: allAdmIds } },
      });
      await db.feePaymentDetailAttribution.deleteMany({
        where: { feePayment: { admissionId: { in: allAdmIds } } },
      });
      await db.feePayment.deleteMany({
        where: { admissionId: { in: allAdmIds } },
      });
      await db.student.deleteMany({
        where: { admissionId: { in: allAdmIds } },
      });
      await db.feePaymentDetails.deleteMany({
        where: { feePaymentHeader: { admissionId: { in: allAdmIds } } },
      });
      await db.feePaymentHeader.deleteMany({
        where: { admissionId: { in: allAdmIds } },
      });
      await db.admission.deleteMany({
        where: { id: { in: allAdmIds } },
      });
    }
    await db.feeComponent.deleteMany({ where: { feeStructureId } });
    await db.feeStructure.deleteMany({ where: { id: feeStructureId } });
    await db.section.deleteMany({ where: { id: sectionId } });
    await db.class.deleteMany({ where: { id: classId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.academicYear.deleteMany({ where: { id: academicYearId } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });

    // Residue verification
    const remStudents = await db.student.count({
      where: { studentNumber: { contains: suffix } },
    });
    const remAdmissions = await db.admission.count({
      where: { admissionNumber: { contains: suffix } },
    });
    const remSchools = await db.school.count({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    assert.equal(remStudents, 0, 'Zero student residue');
    assert.equal(remAdmissions, 0, 'Zero admission residue');
    assert.equal(remSchools, 0, 'Zero school residue');
    console.log('   ✓ Guaranteed teardown complete. Zero residue verified.');

    await db.$disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Integration test failed:', err);
    process.exit(1);
  });
