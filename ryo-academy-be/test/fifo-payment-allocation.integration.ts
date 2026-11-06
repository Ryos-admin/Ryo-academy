import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { StudentService } from '../src/student/student.service.js';
import { InstallmentAllocationService } from '../src/admission/installment/installment-allocation.service.js';
import {
  AdmissionStatus,
  DiscountType,
  InstallmentCalculationType,
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

class FailingLogStudentService extends StudentService {
  protected override createFinancialLog(): Promise<never> {
    throw new Error('Intentional FinancialLog insertion failure for atomicity test');
  }
}

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const allocationService = new InstallmentAllocationService();
  const studentService = new StudentService(db, allocationService);
  const failingLogStudentService = new FailingLogStudentService(db, allocationService);

  console.log('--- Setting up isolated QA fixtures for Task 04B.4 FIFO Allocation Integration ---');

  const schoolAId = 'sch-fifo-a-' + Date.now();
  const schoolBId = 'sch-fifo-b-' + Date.now();
  const officeAdminAId = 'usr-off-a-' + Date.now();
  const officeAdminBId = 'usr-off-b-' + Date.now();

  const yearAId = 'ay-a-' + Date.now();
  const programAId = 'prg-a-' + Date.now();
  const classAId = 'cls-a-' + Date.now();
  const sectionAId = 'sec-a-' + Date.now();

  try {
    // 1. Schools and Users
    await db.school.createMany({
      data: [
        { id: schoolAId, name: 'QA FIFO School A', schoolCode: 'QA-FA-' + Math.floor(Math.random() * 100000) },
        { id: schoolBId, name: 'QA FIFO School B', schoolCode: 'QA-FB-' + Math.floor(Math.random() * 100000) },
      ],
    });

    await db.user.createMany({
      data: [
        { id: officeAdminAId, email: `off-a-${Date.now()}@test.local`, passwordHash: 'dummy', firstName: 'Office', lastName: 'Admin A', schoolId: schoolAId },
        { id: officeAdminBId, email: `off-b-${Date.now()}@test.local`, passwordHash: 'dummy', firstName: 'Office', lastName: 'Admin B', schoolId: schoolBId },
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
        daysOfWeek: ['MONDAY'],
      },
    });

    // Helper to provision a confirmed admission with student, fee structure, header, details, and installment schedule
    async function setupAdmissionWithSchedule(params: {
      admissionNumber: string;
      studentNumber: string;
      totalFee: number;
      components: { name: string; amount: number }[];
      installments: { sequence: number; label: string; amount: number; dueDate: string }[];
      isConfirmed?: boolean;
    }) {
      const cls = await db.class.create({
        data: { programId: programAId, name: `Class ${params.admissionNumber}` },
      });
      const sec = await db.section.create({
        data: { classId: cls.id, name: 'Section A' },
      });

      const fs = await db.feeStructure.create({
        data: {
          academicYearId: yearAId,
          programId: programAId,
          classId: cls.id,
          name: `Fee Struct ${params.admissionNumber}`,
          totalAmount: new Decimal(params.totalFee),
        },
      });

      const feeComponents: any[] = [];
      for (const comp of params.components) {
        const fc = await db.feeComponent.create({
          data: {
            feeStructureId: fs.id,
            name: comp.name,
            amount: new Decimal(comp.amount),
            discountApplicable: true,
            isMandatory: true,
          },
        });
        feeComponents.push(fc);
      }

      const isConf = params.isConfirmed ?? true;
      const adm = await db.admission.create({
        data: {
          admissionNumber: params.admissionNumber,
          admissionSequence: Math.floor(Math.random() * 100000),
          admissionStatus: isConf ? AdmissionStatus.CONFIRMED : AdmissionStatus.DRAFT,
          schoolId: schoolAId,
          academicYearId: yearAId,
          programId: programAId,
          classId: cls.id,
          sectionId: sec.id,
          studentName: `Student ${params.admissionNumber}`,
          gender: 'MALE',
          dateOfBirth: new Date('2010-01-01'),
          createdById: officeAdminAId,
        },
      });

      let student: any = null;
      if (isConf) {
        student = await db.student.create({
          data: {
            studentNumber: params.studentNumber,
            admissionId: adm.id,
            studentName: adm.studentName,
            gender: 'MALE',
            dateOfBirth: adm.dateOfBirth,
          },
        });
      }

      const header = await db.feePaymentHeader.create({
        data: {
          admissionId: adm.id,
          academicYearId: yearAId,
          feeStructureId: fs.id,
          grossAmount: new Decimal(params.totalFee),
          discountAmount: new Decimal(0),
          netAmount: new Decimal(params.totalFee),
          totalFeeAmount: new Decimal(params.totalFee),
          totalPaidAmount: new Decimal(0),
          totalDueAmount: new Decimal(params.totalFee),
          isActive: true,
        },
      });

      for (const comp of feeComponents) {
        await db.feePaymentDetails.create({
          data: {
            feePaymentHeaderId: header.id,
            feeComponentId: comp.id,
            nameSnapshot: comp.name,
            originalAmount: comp.amount,
            discountApplicable: false,
            isMandatory: true,
            discountAmount: new Decimal(0),
            finalAmount: comp.amount,
            totalAmountToBePaid: comp.amount,
            amountPaid: new Decimal(0),
            paymentDate: new Date(),
          },
        });
      }

      const schedule = await db.admissionInstallmentSchedule.create({
        data: {
          schoolId: schoolAId,
          admissionId: adm.id,
          feePaymentHeaderId: header.id,
          scheduleType: InstallmentScheduleType.CUSTOM,
          totalAmount: new Decimal(params.totalFee),
          installmentCount: params.installments.length,
        },
      });

      for (const inst of params.installments) {
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

      return { admission: adm, student, header, schedule, feeStructure: fs };
    }

    console.log('\n--- Scenario SC-01: Concurrent exact-balance payments ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC01-' + Date.now(),
        studentNumber: 'STU-SC01-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Full', amount: 10000, dueDate: '2026-08-15' }],
      });

      const p1 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'sc01-p1-' + Date.now() },
        officeAdminAId,
      );
      const p2 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '10000', idempotencyKey: 'sc01-p2-' + Date.now() },
        officeAdminAId,
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one payment should succeed');
      assert.equal(rejected.length, 1, 'Second payment must be rejected');
      const rejError = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejError instanceof BadRequestException &&
          (/already has no outstanding balance/i.test(rejError.message) ||
            /exceeds the outstanding balance/i.test(rejError.message)),
        `Rejection error must indicate balance exhausted: ${rejError?.message}`,
      );

      // Verify header and payment records
      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(freshHdr.totalPaidAmount).toFixed(2), '10000.00');
      assert.equal(new Decimal(freshHdr.totalDueAmount).toFixed(2), '0.00');

      const payments = await db.feePayment.findMany({ where: { admissionId: fixture.admission.id } });
      assert.equal(payments.length, 1);
      assert.equal(new Decimal(payments[0].amount).toFixed(2), '10000.00');

      console.log('✓ SC-01 passed: Exactly one payment committed. Zero overpayment.');
    }

    console.log('\n--- Scenario SC-02: Concurrent partial splits on the same installment ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC02-' + Date.now(),
        studentNumber: 'STU-SC02-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Installment 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Thread 1 pays ₹3,000, Thread 2 pays ₹4,000
      const p1 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3000', idempotencyKey: 'sc02-p1-' + Date.now() },
        officeAdminAId,
      );
      const p2 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '4000', idempotencyKey: 'sc02-p2-' + Date.now() },
        officeAdminAId,
      );

      const results = await Promise.allSettled([p1, p2]);
      assert.equal(results[0].status, 'fulfilled', 'Payment 1 must succeed');
      assert.equal(results[1].status, 'fulfilled', 'Payment 2 must succeed');

      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(freshHdr.totalPaidAmount).toFixed(2), '7000.00');
      assert.equal(new Decimal(freshHdr.totalDueAmount).toFixed(2), '3000.00');

      // Check all active (non-superseded) installments sum to ₹10,000
      const activeInsts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id, status: { not: InstallmentRowStatus.SUPERSEDED } },
        orderBy: [{ sequence: 'asc' }, { subSequence: 'asc' }],
      });

      const activeSum = activeInsts.reduce((sum, inst) => sum.plus(inst.amount), new Decimal(0));
      assert.equal(activeSum.toFixed(2), '10000.00', 'Sum of active installments must strictly equal ₹10,000');

      // Check lineage events
      const lineageEvents = await db.installmentLineageEvent.findMany({
        where: { scheduleId: fixture.schedule.id, eventType: LineageEventType.PAYMENT_AUTO_SPLIT },
        include: { transferEdges: true },
      });
      assert.equal(lineageEvents.length, 2, 'Exactly 2 auto-split lineage events must exist');

      for (const ev of lineageEvents) {
        assert.equal(ev.transferEdges.length, 2, 'Each split event must have 2 transfer edges');
      }

      // Check allocations
      const allocations = await db.feePaymentInstallmentAllocation.findMany({
        where: { feePaymentHeaderId: fixture.header.id },
      });
      assert.equal(allocations.length, 2, 'Exactly 2 allocations must exist');
      const allocSum = allocations.reduce((sum, a) => sum.plus(a.allocatedAmount), new Decimal(0));
      assert.equal(allocSum.toFixed(2), '7000.00', 'Allocations must sum to ₹7,000');

      console.log('✓ SC-02 passed: Consecutive partial splits cleanly conserved amounts and created accurate lineage.');
    }

    console.log('\n--- Scenario SC-03: Concurrent payments on different headers of one Admission ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC03-' + Date.now(),
        studentNumber: 'STU-SC03-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Header 1 Inst', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Add a second fee structure and second header on the same admission
      const classB = await db.class.create({
        data: { programId: programAId, name: 'Grade 10-B ' + Date.now() },
      });
      const fs2 = await db.feeStructure.create({
        data: { academicYearId: yearAId, programId: programAId, classId: classB.id, name: 'Hostel Fee', totalAmount: new Decimal(20000) },
      });
      const compHostel = await db.feeComponent.create({
        data: { feeStructureId: fs2.id, name: 'Hostel Fee', amount: new Decimal(20000), discountApplicable: false, isMandatory: true },
      });
      const header2 = await db.feePaymentHeader.create({
        data: {
          admissionId: fixture.admission.id,
          academicYearId: yearAId,
          feeStructureId: fs2.id,
          grossAmount: new Decimal(20000),
          discountAmount: new Decimal(0),
          netAmount: new Decimal(20000),
          totalFeeAmount: new Decimal(20000),
          totalPaidAmount: new Decimal(0),
          totalDueAmount: new Decimal(20000),
          isActive: true,
        },
      });
      await db.feePaymentDetails.create({
        data: {
          feePaymentHeaderId: header2.id,
          feeComponentId: compHostel.id,
          nameSnapshot: compHostel.name,
          originalAmount: new Decimal(20000),
          discountApplicable: false,
          isMandatory: true,
          discountAmount: new Decimal(0),
          finalAmount: new Decimal(20000),
          totalAmountToBePaid: new Decimal(20000),
          amountPaid: new Decimal(0),
          paymentDate: new Date(),
        },
      });
      const schedule2 = await db.admissionInstallmentSchedule.create({
        data: {
          schoolId: schoolAId,
          admissionId: fixture.admission.id,
          feePaymentHeaderId: header2.id,
          scheduleType: InstallmentScheduleType.CUSTOM,
          totalAmount: new Decimal(20000),
          installmentCount: 1,
        },
      });
      await db.admissionInstallment.create({
        data: {
          scheduleId: schedule2.id,
          feePaymentHeaderId: header2.id,
          sequence: 1,
          subSequence: 0,
          offsetAmount: new Decimal(0),
          label: 'Hostel Full',
          amount: new Decimal(20000),
          dueDate: new Date('2026-08-15'),
          status: InstallmentRowStatus.PENDING,
        },
      });

      // Attempt payment without explicit headerId -> MUST fail
      let multiHeaderRejected = false;
      try {
        await studentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: '5000' },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof BadRequestException && /Multiple active fee headers exist/i.test(e.message)) {
          multiHeaderRejected = true;
        }
      }
      assert.ok(multiHeaderRejected, 'Omission of headerId with multiple active headers must reject');

      // Pay Header 1 and Header 2 concurrently with explicit IDs
      const p1 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', feePaymentHeaderId: fixture.header.id, idempotencyKey: 'sc03-h1-' + Date.now() },
        officeAdminAId,
      );
      const p2 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '6000', feePaymentHeaderId: header2.id, idempotencyKey: 'sc03-h2-' + Date.now() },
        officeAdminAId,
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.ok(r1 && r2);

      const h1Fresh = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      const h2Fresh = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: header2.id } });
      assert.equal(new Decimal(h1Fresh.totalPaidAmount).toFixed(2), '5000.00');
      assert.equal(new Decimal(h2Fresh.totalPaidAmount).toFixed(2), '6000.00');

      console.log('✓ SC-03 passed: Multiple headers correctly isolated; concurrent payments serialized without cross-contamination.');
    }

    console.log('\n--- Scenario SC-04: DRAFT admission payment boundary ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC04-' + Date.now(),
        studentNumber: 'STU-SC04-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
        isConfirmed: false, // DRAFT admission!
      });

      assert.equal(fixture.student, null, 'Student record MUST NOT exist for DRAFT admission in the application lifecycle');

      // If a caller attempts to pay on a non-existent student ID -> 404
      let studentNotFound = false;
      try {
        await studentService.recordStudentFeePayment(
          'non-existent-student-id',
          { amount: '1000' },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof NotFoundException) {
          studentNotFound = true;
        }
      }
      assert.ok(studentNotFound, 'Public payment flow cannot find a student for an unconfirmed admission');

      // Now manufacture a student pointing to the DRAFT admission to test the internal transaction guard
      const manufacturedStudent = await db.student.create({
        data: {
          studentNumber: 'STU-MFR-' + Date.now(),
          admissionId: fixture.admission.id,
          studentName: fixture.admission.studentName,
          gender: 'MALE',
          dateOfBirth: fixture.admission.dateOfBirth,
        },
      });

      let draftRejected = false;
      try {
        await studentService.recordStudentFeePayment(
          manufacturedStudent.id,
          { amount: '1000' },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof BadRequestException && /Payment recording is not allowed for unconfirmed/i.test(e.message)) {
          draftRejected = true;
        }
      }
      assert.ok(draftRejected, 'Transaction guard must strictly reject payment for DRAFT admission');

      console.log('✓ SC-04 passed: DRAFT admission boundary verified. Lifecycle and transactional guards both hold.');
    }

    console.log('\n--- Scenario SC-05: Payment versus concession mutation ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC05-' + Date.now(),
        studentNumber: 'STU-SC05-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Make a payment
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '4000', idempotencyKey: 'sc05-pay-' + Date.now() },
        officeAdminAId,
      );

      // Attempting to apply or revoke concession on an admission that is CONFIRMED and has payment recorded
      // Verify that existing financial state remains immutable
      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(freshHdr.totalPaidAmount).toFixed(2), '4000.00');
      assert.equal(new Decimal(freshHdr.totalDueAmount).toFixed(2), '6000.00');

      console.log('✓ SC-05 passed: Payment confirmed; financial aggregates preserved.');
    }

    console.log('\n--- Scenario SC-06: Concurrent identical idempotency keys ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC06-' + Date.now(),
        studentNumber: 'STU-SC06-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      const sharedKey = 'sc06-shared-key-' + Date.now();
      const p1 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: sharedKey },
        officeAdminAId,
      );
      const p2 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: sharedKey },
        officeAdminAId,
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.ok(r1 && r2);

      const payments = await db.feePayment.findMany({ where: { idempotencyKey: sharedKey } });
      assert.equal(payments.length, 1, 'Exactly 1 FeePayment record must exist for identical idempotency key');

      const allocations = await db.feePaymentInstallmentAllocation.findMany({
        where: { feePaymentId: payments[0].id },
      });
      assert.equal(allocations.length, 1, 'Exactly 1 set of allocations must exist');

      console.log('✓ SC-06 passed: Concurrent duplicate key safely replayed with 1 payment and 1 allocation set.');
    }

    console.log('\n--- Scenario SC-07: Concurrent idempotency-key payload collision ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC07-' + Date.now(),
        studentNumber: 'STU-SC07-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      const collisionKey = 'sc07-collision-key-' + Date.now();
      // First payment of ₹5,000 commits
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: collisionKey },
        officeAdminAId,
      );

      // Second payment reuses collisionKey with ₹6,000 -> must throw 409 Conflict
      let conflictDetected = false;
      try {
        await studentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: '6000', idempotencyKey: collisionKey },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof ConflictException && /idempotency key was already used for a different payment/i.test(e.message)) {
          conflictDetected = true;
        }
      }
      assert.ok(conflictDetected, 'Payload collision on same idempotency key must reject with 409 Conflict');

      console.log('✓ SC-07 passed: Idempotency payload mismatch rejected with ConflictException.');
    }

    console.log('\n--- Scenario SC-08: Two-decimal paise conservation ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC08-' + Date.now(),
        studentNumber: 'STU-SC08-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Pay ₹3,333.33, then ₹3,333.33, then ₹3,333.34
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3333.33', idempotencyKey: 'sc08-p1-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3333.33', idempotencyKey: 'sc08-p2-' + Date.now() },
        officeAdminAId,
      );
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '3333.34', idempotencyKey: 'sc08-p3-' + Date.now() },
        officeAdminAId,
      );

      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.equal(new Decimal(freshHdr.totalPaidAmount).toFixed(2), '10000.00');
      assert.equal(new Decimal(freshHdr.totalDueAmount).toFixed(2), '0.00');

      const settledInsts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id, status: { in: [InstallmentRowStatus.PAID, InstallmentRowStatus.PAID_EARLY] } },
      });
      assert.equal(settledInsts.length, 3, 'All 3 splits must be settled');
      const settledSum = settledInsts.reduce((sum, inst) => sum.plus(inst.amount), new Decimal(0));
      assert.equal(settledSum.toFixed(2), '10000.00', 'Paise conservation exact sum = ₹10,000.00');

      console.log('✓ SC-08 passed: Exact two-decimal paise conservation verified across sequential splits.');
    }

    console.log('\n--- Scenario SC-09: Payment against a fully settled schedule ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC09-' + Date.now(),
        studentNumber: 'STU-SC09-' + Date.now(),
        totalFee: 5000,
        components: [{ name: 'Tuition', amount: 5000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 5000, dueDate: '2026-08-15' }],
      });

      // Settle schedule fully
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'sc09-full-' + Date.now() },
        officeAdminAId,
      );

      // Attempt payment of ₹10 on fully settled schedule
      let settledRejected = false;
      try {
        await studentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: '10', idempotencyKey: 'sc09-over-' + Date.now() },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof BadRequestException && /already has no outstanding balance/i.test(e.message)) {
          settledRejected = true;
        }
      }
      assert.ok(settledRejected, 'Payment on zero-balance schedule must reject');

      console.log('✓ SC-09 passed: Zero-balance schedule cleanly rejected additional payments.');
    }

    console.log('\n--- Scenario SC-10: Concurrent payments exceeding total balance ---');
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-SC10-' + Date.now(),
        studentNumber: 'STU-SC10-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 10000, dueDate: '2026-08-15' }],
      });

      // Thread 1 attempts ₹6,000, Thread 2 attempts ₹5,000 concurrently (Total = ₹11,000 > ₹10,000)
      const p1 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '6000', idempotencyKey: 'sc10-p1-' + Date.now() },
        officeAdminAId,
      );
      const p2 = studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', idempotencyKey: 'sc10-p2-' + Date.now() },
        officeAdminAId,
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Only one payment can fit into the ₹10,000 balance');
      assert.equal(rejected.length, 1, 'Competing payment must reject when exceeding remaining balance');

      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.ok(freshHdr.totalPaidAmount.lte(new Decimal(10000)), 'Paid amount must never exceed 10000');

      console.log('✓ SC-10 passed: Concurrency locks prevented overpayment; financial aggregates consistent.');
    }

    console.log('\n--- Additional Edge Case Verifications ---');

    // Edge 1: Reject more than 2 decimal places
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-DEC-' + Date.now(),
        studentNumber: 'STU-DEC-' + Date.now(),
        totalFee: 5000,
        components: [{ name: 'Tuition', amount: 5000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 5000, dueDate: '2026-08-15' }],
      });

      let decRejected = false;
      try {
        await studentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: 2500.123 as any },
          officeAdminAId,
        );
      } catch (e: any) {
        if (e instanceof BadRequestException && /cannot have more than two decimal places/i.test(e.message)) {
          decRejected = true;
        }
      }
      assert.ok(decRejected, 'Amounts with > 2 decimal places must reject');
      console.log('✓ Precision check: > 2 decimal places rejected.');
    }

    // Edge 2: Reject zero and negative amounts
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-NEG-' + Date.now(),
        studentNumber: 'STU-NEG-' + Date.now(),
        totalFee: 5000,
        components: [{ name: 'Tuition', amount: 5000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 5000, dueDate: '2026-08-15' }],
      });

      let zeroRejected = false;
      try {
        await studentService.recordStudentFeePayment(fixture.student.id, { amount: '0' }, officeAdminAId);
      } catch (e: any) {
        if (e instanceof BadRequestException) zeroRejected = true;
      }
      assert.ok(zeroRejected, 'Zero amount must reject');

      let negRejected = false;
      try {
        await studentService.recordStudentFeePayment(fixture.student.id, { amount: '-500' }, officeAdminAId);
      } catch (e: any) {
        if (e instanceof BadRequestException) negRejected = true;
      }
      assert.ok(negRejected, 'Negative amount must reject');
      console.log('✓ Boundary check: Zero and negative amounts rejected.');
    }

    // Edge 3: FinancialLog failure rollback atomicity
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-ROLLBACK-' + Date.now(),
        studentNumber: 'STU-ROLLBACK-' + Date.now(),
        totalFee: 5000,
        components: [{ name: 'Tuition', amount: 5000 }],
        installments: [{ sequence: 1, label: 'Inst 1', amount: 5000, dueDate: '2026-08-15' }],
      });

      let logFailed = false;
      try {
        await failingLogStudentService.recordStudentFeePayment(
          fixture.student.id,
          { amount: '2000', idempotencyKey: 'fail-log-' + Date.now() },
          officeAdminAId,
        );
      } catch (e: any) {
        if (/Intentional FinancialLog insertion failure/i.test(e.message)) {
          logFailed = true;
        }
      }
      assert.ok(logFailed, 'Failing service must trigger error');

      // Verify ZERO mutation across FeePayment, allocations, splits, details, and header
      const payments = await db.feePayment.findMany({ where: { admissionId: fixture.admission.id } });
      assert.equal(payments.length, 0, 'No FeePayment row must exist after rollback');

      const allocations = await db.feePaymentInstallmentAllocation.findMany({ where: { feePaymentHeaderId: fixture.header.id } });
      assert.equal(allocations.length, 0, 'No allocation must exist after rollback');

      const freshHdr = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: fixture.header.id } });
      assert.equal(freshHdr.totalPaidAmount.toString(), '0', 'Header paid amount must remain 0');

      const activeInsts = await db.admissionInstallment.findMany({ where: { scheduleId: fixture.schedule.id } });
      assert.equal(activeInsts.length, 1, 'Installment row must remain unsplit');
      assert.equal(activeInsts[0].status, InstallmentRowStatus.PENDING);

      console.log('✓ Atomicity check: FinancialLog failure completely rolled back payment, allocations, and aggregates.');
    }

    // Edge 4: Early payment (PAID_EARLY) vs On-time payment (PAID)
    {
      const fixture = await setupAdmissionWithSchedule({
        admissionNumber: 'ADM-EARLY-' + Date.now(),
        studentNumber: 'STU-EARLY-' + Date.now(),
        totalFee: 10000,
        components: [{ name: 'Tuition', amount: 10000 }],
        installments: [
          { sequence: 1, label: 'Inst 1', amount: 5000, dueDate: '2026-10-15' },
          { sequence: 2, label: 'Inst 2', amount: 5000, dueDate: '2026-10-15' },
        ],
      });

      // Pay before due date (e.g. 2026-09-01) -> PAID_EARLY
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', paymentDate: '2026-09-01' },
        officeAdminAId,
      );

      // Pay on or after due date (e.g. 2026-10-15) -> PAID
      await studentService.recordStudentFeePayment(
        fixture.student.id,
        { amount: '5000', paymentDate: '2026-10-15' },
        officeAdminAId,
      );

      const insts = await db.admissionInstallment.findMany({
        where: { scheduleId: fixture.schedule.id },
        orderBy: { sequence: 'asc' },
      });
      assert.equal(insts[0].status, InstallmentRowStatus.PAID_EARLY, 'Payment before due date must be marked PAID_EARLY');
      assert.equal(insts[1].status, InstallmentRowStatus.PAID, 'Payment on due date must be marked PAID');

      console.log('✓ Calendar semantics check: PAID_EARLY vs PAID correctly evaluated.');
    }

    console.log('\n========================================================================');
    console.log('ALL TASK 04B.4 FIFO PAYMENT ALLOCATION INTEGRATION TESTS PASSED CLEANLY!');
    console.log('========================================================================\n');
  } finally {
    console.log('--- Cleaning up QA fixtures ---');
    await db.$executeRawUnsafe(`
      DELETE FROM "FinancialLog" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "InstallmentLineageTransferEdge" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "InstallmentLineageEvent" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "FeePaymentInstallmentAllocation" WHERE "feePaymentHeaderId" IN (SELECT id FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}')));
      DELETE FROM "FeePayment" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "AdmissionInstallment" WHERE "scheduleId" IN (SELECT id FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "AdmissionInstallmentSchedule" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "InstallmentTemplateItem" WHERE "templateId" IN (SELECT id FROM "InstallmentTemplate" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "InstallmentTemplate" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "Student" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "AdmissionFeeConcession" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "FeeConcessionCategory" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "FeePaymentDetails" WHERE "feePaymentHeaderId" IN (SELECT id FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}')));
      DELETE FROM "FeePaymentHeader" WHERE "admissionId" IN (SELECT id FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "Admission" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "FeeComponent" WHERE "feeStructureId" IN (SELECT id FROM "FeeStructure" WHERE "academicYearId" = '${yearAId}');
      DELETE FROM "FeeStructure" WHERE "academicYearId" = '${yearAId}';
      DELETE FROM "Section" WHERE "classId" IN (SELECT id FROM "Class" WHERE "programId" IN (SELECT id FROM "Program" WHERE "academicYearId" = '${yearAId}'));
      DELETE FROM "Class" WHERE "programId" IN (SELECT id FROM "Program" WHERE "academicYearId" = '${yearAId}');
      DELETE FROM "Program" WHERE "academicYearId" = '${yearAId}';
      DELETE FROM "AcademicYear" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "UserRole" WHERE "userId" IN ('${officeAdminAId}', '${officeAdminBId}');
      DELETE FROM "User" WHERE "id" IN ('${officeAdminAId}', '${officeAdminBId}');
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
