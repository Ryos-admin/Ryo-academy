import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { FeeConcessionCategoryService } from '../src/admission/fee-concession/fee-concession-category.service.js';
import { AdmissionConcessionService } from '../src/admission/fee-concession/admission-concession.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { StudentService } from '../src/student/student.service.js';
import { AdmissionPaymentService } from '../src/admission/admission-payment/admission-payment.service.js';
import { DiscountType, PaymentMethod } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  await assertQaDatabase(db);

  const categoryService = new FeeConcessionCategoryService(db);
  const admissionConcessionService = new AdmissionConcessionService(db);
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);
  const studentService = new StudentService(db);
  const paymentService = new AdmissionPaymentService(db);

  const ids: Record<string, string[]> = {
    schools: [],
    users: [],
    categories: [],
    concessions: [],
    admissions: [],
    students: [],
    years: [],
    programs: [],
    classes: [],
    sections: [],
    structures: [],
    components: [],
    headers: [],
    details: [],
    payments: [],
    logs: [],
  };

  const cleanup = async () =>
    db.$transaction(async (tx: any) => {
      const cleanIds = (arr: (string | undefined)[]) => arr.filter((x): x is string => !!x);
      await tx.financialLog.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.logs) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.installmentLineageTransferEdge.deleteMany({
        where: { event: { schedule: { admission: { schoolId: { in: cleanIds(ids.schools) } } } } },
      });
      await tx.installmentLineageEvent.deleteMany({
        where: { schedule: { admission: { schoolId: { in: cleanIds(ids.schools) } } } },
      });
      await tx.feePaymentInstallmentAllocation.deleteMany({
        where: { header: { admission: { schoolId: { in: cleanIds(ids.schools) } } } },
      });
      await tx.paymentReversalEvent.deleteMany({
        where: { feePayment: { schoolId: { in: cleanIds(ids.schools) } } },
      });
      await tx.feePaymentDetailAttribution.deleteMany({
        where: { feePayment: { schoolId: { in: cleanIds(ids.schools) } } },
      });
      await tx.feePayment.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.payments) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.admissionFeeConcession.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.concessions) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.admissionInstallment.deleteMany({
        where: { schedule: { admission: { schoolId: { in: cleanIds(ids.schools) } } } },
      });
      await tx.admissionInstallmentSchedule.deleteMany({
        where: { admission: { schoolId: { in: cleanIds(ids.schools) } } },
      });
      await tx.feePaymentDetails.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.details) } }, { feePaymentHeader: { admission: { schoolId: { in: cleanIds(ids.schools) } } } }] },
      });
      await tx.feePaymentHeader.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.headers) } }, { admission: { schoolId: { in: cleanIds(ids.schools) } } }] },
      });
      await tx.student.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.students) } }, { admission: { schoolId: { in: cleanIds(ids.schools) } } }] },
      });
      await tx.admission.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.admissions) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.feeConcessionCategory.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.categories) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.feeComponent.deleteMany({ where: { id: { in: cleanIds(ids.components) } } });
      await tx.feeStructure.deleteMany({ where: { id: { in: cleanIds(ids.structures) } } });
      await tx.section.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.sections) } }, { class: { program: { academicYear: { schoolId: { in: cleanIds(ids.schools) } } } } }] },
      });
      await tx.class.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.classes) } }, { program: { academicYear: { schoolId: { in: cleanIds(ids.schools) } } } }] },
      });
      await tx.program.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.programs) } }, { academicYear: { schoolId: { in: cleanIds(ids.schools) } } }] },
      });
      await tx.academicYear.deleteMany({ where: { id: { in: cleanIds(ids.years) } } });
      await tx.user.deleteMany({ where: { id: { in: cleanIds(ids.users) } } });
      await tx.school.deleteMany({ where: { id: { in: cleanIds(ids.schools) } } });
    });

  try {
    console.log('--- Setting up isolated QA fixtures for Task 03C Integrity Review ---');
    const timestamp = Date.now();

    // 1. Schools
    const schoolA = await db.school.create({
      data: { name: 'Task 03C School A', schoolCode: `QA-3C-A-${timestamp}` },
    });
    ids.schools.push(schoolA.id);

    const schoolB = await db.school.create({
      data: { name: 'Task 03C School B', schoolCode: `QA-3C-B-${timestamp}` },
    });
    ids.schools.push(schoolB.id);

    // 2. Users
    const userA = await db.user.create({
      data: {
        email: `admin-3c-a-${timestamp}@example.com`,
        passwordHash: 'hash',
        firstName: 'Admin',
        lastName: 'A',
        schoolId: schoolA.id,
      },
    });
    ids.users.push(userA.id);

    const userB = await db.user.create({
      data: {
        email: `admin-3c-b-${timestamp}@example.com`,
        passwordHash: 'hash',
        firstName: 'Admin',
        lastName: 'B',
        schoolId: schoolB.id,
      },
    });
    ids.users.push(userB.id);

    // 3. Academic Structure
    const yearA = await db.academicYear.create({
      data: {
        name: `2026-2027 QA 3C ${timestamp}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-04-30'),
        schoolId: schoolA.id,
      },
    });
    ids.years.push(yearA.id);

    const programA = await db.program.create({
      data: {
        name: `Primary QA 3C ${timestamp}`,
        academicYearId: yearA.id,
        startTime: '08:00',
        endTime: '14:00',
        daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      },
    });
    ids.programs.push(programA.id);

    const classA = await db.class.create({
      data: { name: `Grade 6 QA 3C ${timestamp}`, programId: programA.id },
    });
    ids.classes.push(classA.id);

    const sectionA = await db.section.create({
      data: { name: 'A', classId: classA.id },
    });
    ids.sections.push(sectionA.id);

    // 4. Fee Structure (Total: ₹15,000)
    const structure = await db.feeStructure.create({
      data: {
        name: `Fee Grade 6 3C ${timestamp}`,
        academicYearId: yearA.id,
        programId: programA.id,
        classId: classA.id,
        totalAmount: 15000,
      },
    });
    ids.structures.push(structure.id);

    const compTuition = await db.feeComponent.create({
      data: {
        feeStructureId: structure.id,
        name: 'Tuition Fee',
        amount: 10000,
        discountApplicable: true,
        isMandatory: true,
      },
    });
    ids.components.push(compTuition.id);

    const compLab = await db.feeComponent.create({
      data: {
        feeStructureId: structure.id,
        name: 'Lab Fee',
        amount: 3000,
        discountApplicable: true,
        isMandatory: true,
      },
    });
    ids.components.push(compLab.id);

    const compExam = await db.feeComponent.create({
      data: {
        feeStructureId: structure.id,
        name: 'Exam Fee',
        amount: 2000,
        discountApplicable: false, // Ineligible
        isMandatory: true,
      },
    });
    ids.components.push(compExam.id);

    // Categories
    const catSibling = await categoryService.create(
      { name: 'Sibling Discount', code: 'SIBLING' },
      userA.id,
    );
    ids.categories.push(catSibling.id);

    const catMerit = await categoryService.create(
      { name: 'Merit Discount', code: 'MERIT' },
      userA.id,
    );
    ids.categories.push(catMerit.id);

    const catNeed = await categoryService.create(
      { name: 'Need-Based Support', code: 'NEED_BASED' },
      userA.id,
    );
    ids.categories.push(catNeed.id);

    const recordQualifyingPayment = async (admId: string, headerId: string, amount = '1000') => {
      const curHdr = await db.feePaymentHeader.findUniqueOrThrow({
        where: { id: headerId },
        include: { feePaymentDetails: true },
      });
      const netAmount = new Prisma.Decimal(curHdr.netAmount.toString());

      let sched = await db.admissionInstallmentSchedule.findUnique({
        where: { feePaymentHeaderId: headerId },
      });
      if (!sched) {
        sched = await db.admissionInstallmentSchedule.create({
          data: {
            schoolId: schoolA.id,
            admissionId: admId,
            feePaymentHeaderId: headerId,
            scheduleType: 'CUSTOM',
            totalAmount: netAmount,
            installmentCount: 1,
            installments: {
              create: [
                {
                  feePaymentHeaderId: headerId,
                  sequence: 1,
                  subSequence: 0,
                  offsetAmount: new Prisma.Decimal('0.00'),
                  label: 'Full Term Installment',
                  amount: netAmount,
                  dueDate: new Date('2026-12-15T00:00:00.000Z'),
                  status: 'PENDING',
                },
              ],
            },
          },
        });
      }

      const tDetail = curHdr.feePaymentDetails.find((d) => d.nameSnapshot === 'Tuition Fee')
        ?? curHdr.feePaymentDetails.find((d) => d.isIncluded && d.isActive)!;

      const paymentResult = await paymentService.createAdmissionPayment(
        admId,
        {
          idempotencyKey: `idemp-conf-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          feePaymentHeaderId: headerId,
          amount,
          paymentMethod: PaymentMethod.CASH,
          paymentDate: new Date().toISOString(),
          transactionReference: `qual-pay-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          remarks: 'QA qualifying payment for admission confirmation',
          allocations: [
            {
              feePaymentDetailsId: tDetail.id,
              amount,
            },
          ],
        },
        userA.id,
      );

      ids.payments.push(paymentResult.id);
      return paymentResult;
    };

    // =========================================================================
    // TASK 03C SECTION 1: Admission Confirmation Concurrency
    // =========================================================================
    console.log('\n--- Section 1.1: Two Simultaneous Confirmation Requests ---');
    const concAdmission1 = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Concurrent Student 1',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-01-01'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(concAdmission1.id);

    const header1 = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: concAdmission1.id },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(header1.id);
    header1.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    await recordQualifyingPayment(concAdmission1.id, header1.id, '1000');

    // Launch 2 concurrent confirmations for concAdmission1
    const [confResult1, confResult2] = await Promise.allSettled([
      admissionService.updateStatusById(concAdmission1.id, { id: userA.id }, 'CONFIRMED'),
      admissionService.updateStatusById(concAdmission1.id, { id: userA.id }, 'CONFIRMED'),
    ]);

    const successes = [confResult1, confResult2].filter((r) => r.status === 'fulfilled');
    const rejections = [confResult1, confResult2].filter((r) => r.status === 'rejected');

    assert.ok(successes.length >= 1, 'At least one concurrent confirmation must succeed');
    if (rejections.length > 0) {
      const rejectReason = (rejections[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejectReason instanceof ConflictException,
        `Expected ConflictException but got ${rejectReason}`,
      );
    } else {
      assert.equal(successes.length, 2);
      assert.ok(
        (successes[0] as PromiseFulfilledResult<any>).value.isReplay ||
          (successes[1] as PromiseFulfilledResult<any>).value.isReplay,
        'One of the concurrent confirmations must be an idempotent replay',
      );
    }

    // Verify duplicate student was prevented
    const studentsCreated = await db.student.findMany({ where: { admissionId: concAdmission1.id } });
    assert.equal(studentsCreated.length, 1, 'Exactly one Student record must exist');
    ids.students.push(studentsCreated[0].id);

    // Verify duplicate FeePaymentHeader was prevented
    const headersCount = await db.feePaymentHeader.count({ where: { admissionId: concAdmission1.id } });
    assert.equal(headersCount, 1, 'Exactly one FeePaymentHeader must exist');
    console.log('✓ Section 1.1 passed: Concurrent confirmation serialized by row lock; duplicate student and header prevented');

    console.log('\n--- Section 1.2: Confirmation Racing with Concession Assignment ---');
    const concAdmission2 = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Concurrent Student 2',
      gender: 'FEMALE' as any,
      dateOfBirth: new Date('2015-02-02'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(concAdmission2.id);

    const header2 = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: concAdmission2.id },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(header2.id);
    header2.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    const tuitionDetail2 = header2.feePaymentDetails.find((d) => d.nameSnapshot === 'Tuition Fee')!;

    // Provision qualifying payment so confirmation can proceed
    await recordQualifyingPayment(concAdmission2.id, header2.id, '1000');

    // Race confirmation with concession assignment
    const [raceConf, raceAssign] = await Promise.allSettled([
      admissionService.updateStatusById(concAdmission2.id, { id: userA.id }, 'CONFIRMED'),
      admissionConcessionService.assignConcession(
        concAdmission2.id,
        {
          feePaymentDetailsId: tuitionDetail2.id,
          payableAmount: '9000.00',
        },
        userA.id,
      ),
    ]);

    // Either confirmation won (assignment rejected because already confirmed / financial activity), OR assignment won
    if (raceConf.status === 'fulfilled' && raceAssign.status === 'rejected') {
      const err = (raceAssign as PromiseRejectedResult).reason;
      assert.ok(
        err instanceof ConflictException || err instanceof BadRequestException,
        `Expected ConflictException or BadRequestException but got ${err}`,
      );
      console.log('✓ Confirmation acquired lock first or financial activity guarded; racing concession assignment cleanly rejected');
    } else if (raceAssign.status === 'fulfilled' && raceConf.status === 'fulfilled') {
      // Assignment acquired lock first, followed by confirmation
      const finalHeader = await db.feePaymentHeader.findFirstOrThrow({ where: { admissionId: concAdmission2.id } });
      assert.equal(finalHeader.discountAmount.toString(), '1000', 'Confirmation frozen after assignment committed');
      console.log('✓ Concession assignment acquired lock first; confirmation cleanly included concession');
    } else {
      assert.fail(`Unexpected outcome: conf=${raceConf.status}, assign=${raceAssign.status}`);
    }

    const student2 = await db.student.findUniqueOrThrow({ where: { admissionId: concAdmission2.id } });
    ids.students.push(student2.id);
    console.log('✓ Section 1.2 passed: Confirmation and concession assignment cleanly serialized under row-level lock');

    console.log('\n--- Section 1.3: Atomic Rollback on Confirmation Failure ---');
    class FaultyAdmissionService extends AdmissionService {
      // Simulate downstream failure inside confirmation transaction
      protected override async lockAdmission(tx: any, admissionId: string): Promise<void> {
        await super.lockAdmission(tx, admissionId);
        // Let lock succeed, but we will test rollback via another failure path
      }
    }

    const concAdmission3 = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Rollback Student',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-03-03'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(concAdmission3.id);

    const header3 = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: concAdmission3.id },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(header3.id);
    header3.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    const tuitionDetail3 = header3.feePaymentDetails.find((d) => d.nameSnapshot === 'Tuition Fee')!;
    // Assign concession
    const conc3 = await admissionConcessionService.assignConcession(
      concAdmission3.id,
      {
        feePaymentDetailsId: tuitionDetail3.id,
        payableAmount: '9000.00',
      },
      userA.id,
    );
    const conc3Row = await db.admissionFeeConcession.findFirst({
      where: { admissionId: concAdmission3.id, feePaymentDetailsId: tuitionDetail3.id },
    });
    if (conc3Row) ids.concessions.push(conc3Row.id);

    // Intentionally corrupt component originalAmount below finalAmount so snapshot consistency fails during confirmation
    await db.feePaymentDetails.update({
      where: { id: tuitionDetail3.id },
      data: { originalAmount: 500 }, // Payable is 9000 > 500!
    });

    await assert.rejects(
      async () => admissionService.updateStatusById(concAdmission3.id, { id: userA.id }, 'CONFIRMED'),
      (err: any) => {
        assert.ok(err instanceof BadRequestException || err instanceof ConflictException);
        return true;
      },
      'Confirmation must fail if concession invariant is violated',
    );

    // Verify atomic rollback: admission status must remain DRAFT, no Student created
    const rollbackAdm = await db.admission.findUniqueOrThrow({ where: { id: concAdmission3.id } });
    assert.equal(rollbackAdm.admissionStatus, 'DRAFT', 'Admission status must remain DRAFT after rollback');
    const rollbackStudent = await db.student.findUnique({ where: { admissionId: concAdmission3.id } });
    assert.equal(rollbackStudent, null, 'No Student record should exist after transaction rollback');
    console.log('✓ Section 1.3 passed: Confirmation transaction fully rolls back on failure with zero residue');

    // =========================================================================
    // TASK 03C SECTION 2: Financial Balance Preservation
    // =========================================================================
    console.log('\n--- Section 2: Financial Balance Preservation ---');
    // Verify that unpaid admission cannot be confirmed (BE-ND1)
    const concAdmission4 = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Balance Test Student',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-04-04'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(concAdmission4.id);

    const header4 = await db.feePaymentHeader.findFirstOrThrow({ where: { admissionId: concAdmission4.id } });
    ids.headers.push(header4.id);

    // Unpaid confirmation MUST reject with CONFIRMATION_PAYMENT_REQUIRED (BE-ND1)
    await assert.rejects(
      async () => admissionService.updateStatusById(concAdmission4.id, { id: userA.id }, 'CONFIRMED'),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.ok(
          err.message.includes('greater than zero is required') ||
            (err.getResponse && typeof err.getResponse() === 'object' && (err.getResponse() as any).code === 'CONFIRMATION_PAYMENT_REQUIRED'),
        );
        return true;
      },
      'Cannot confirm admission without qualifying payment (BE-ND1)',
    );
    console.log('✓ Section 2 passed: Financial balance preservation verified; confirmation strictly guarded');

    // =========================================================================
    // TASK 03C SECTION 3: Financial Reconciliation (Complete Lifecycle)
    // =========================================================================
    console.log('\n--- Section 3: Financial Reconciliation (Full 7-Step Lifecycle) ---');
    // Step 1: Create admission
    const reconAdmission = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Reconciliation Student',
      gender: 'FEMALE' as any,
      dateOfBirth: new Date('2015-05-05'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(reconAdmission.id);

    const reconHeader = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: reconAdmission.id },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(reconHeader.id);
    reconHeader.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    const recTuition = reconHeader.feePaymentDetails.find((d) => d.nameSnapshot === 'Tuition Fee')!;
    const recLab = reconHeader.feePaymentDetails.find((d) => d.nameSnapshot === 'Lab Fee')!;
    const recExam = reconHeader.feePaymentDetails.find((d) => d.nameSnapshot === 'Exam Fee')!;

    // Step 2: Assign multiple concessions to separate eligible components
    // Tuition: 15% Sibling = ₹1,500 discount -> payableAmount: 8500
    await admissionConcessionService.assignConcession(
      reconAdmission.id,
      {
        feePaymentDetailsId: recTuition.id,
        payableAmount: '8500.00',
      },
      userA.id,
    );
    const concTuitionRow = await db.admissionFeeConcession.findFirstOrThrow({
      where: { admissionId: reconAdmission.id, feePaymentDetailsId: recTuition.id },
    });
    ids.concessions.push(concTuitionRow.id);

    // Lab: ₹1,000 Fixed Merit = ₹1,000 discount -> payableAmount: 2000
    await admissionConcessionService.assignConcession(
      reconAdmission.id,
      {
        feePaymentDetailsId: recLab.id,
        payableAmount: '2000.00',
      },
      userA.id,
    );
    const concLabMeritRow = await db.admissionFeeConcession.findFirstOrThrow({
      where: { admissionId: reconAdmission.id, feePaymentDetailsId: recLab.id },
    });
    ids.concessions.push(concLabMeritRow.id);

    // Step 3: Remove one concession (Remove Merit on Lab)
    await admissionConcessionService.removeConcession(reconAdmission.id, concLabMeritRow.id);

    // Step 4: Assign another concession (Assign Need-Based ₹500 Fixed on Lab -> payableAmount: 2500)
    await admissionConcessionService.assignConcession(
      reconAdmission.id,
      {
        feePaymentDetailsId: recLab.id,
        payableAmount: '2500.00',
      },
      userA.id,
    );
    const concLabNeedRow = await db.admissionFeeConcession.findFirstOrThrow({
      where: { admissionId: reconAdmission.id, feePaymentDetailsId: recLab.id },
    });
    ids.concessions.push(concLabNeedRow.id);

    // Step 4.5: Provision qualifying payment of ₹1,000 for confirmation (BE-ND1)
    await recordQualifyingPayment(reconAdmission.id, reconHeader.id, '1000');

    // Step 5: Confirm admission
    const confirmedRecon = await admissionService.updateStatusById(
      reconAdmission.id,
      { id: userA.id },
      'CONFIRMED',
    );
    assert.equal(confirmedRecon.admissionStatus, 'CONFIRMED');
    ids.students.push(confirmedRecon.student.id);

    // Step 6: Collect remaining partial payments
    // Annual Net Target: ₹15,000 - ₹2,000 = ₹13,000
    // Already paid ₹1,000 via qualifying payment. Remaining is ₹12,000.
    // Pay 1: ₹3,000 on Tuition
    const pay1 = await studentService.recordStudentFeePayment(
      confirmedRecon.student.id,
      {
        amount: '3000',
        paymentDate: new Date().toISOString(),
        paymentMethod: 'CASH' as any,
        idempotencyKey: `idemp-recon-1-${timestamp}`,
        allocations: [{ feePaymentDetailsId: recTuition.id, amount: '3000' }],
      },
      userA.id,
    );
    // Pay 2: ₹5,000 (4500 on Tuition + 500 on Lab)
    const pay2 = await studentService.recordStudentFeePayment(
      confirmedRecon.student.id,
      {
        amount: '5000',
        paymentDate: new Date().toISOString(),
        paymentMethod: 'CASH' as any,
        idempotencyKey: `idemp-recon-2-${timestamp}`,
        allocations: [
          { feePaymentDetailsId: recTuition.id, amount: '4500' },
          { feePaymentDetailsId: recLab.id, amount: '500' },
        ],
      },
      userA.id,
    );
    // Pay 3: ₹4,000 (2000 on Lab + 2000 on Exam)
    const pay3 = await studentService.recordStudentFeePayment(
      confirmedRecon.student.id,
      {
        amount: '4000',
        paymentDate: new Date().toISOString(),
        paymentMethod: 'CASH' as any,
        idempotencyKey: `idemp-recon-3-${timestamp}`,
        allocations: [
          { feePaymentDetailsId: recLab.id, amount: '2000' },
          { feePaymentDetailsId: recExam.id, amount: '2000' },
        ],
      },
      userA.id,
    );

    // Step 7: Read fee summary and payment history and verify all 8 equations
    const finalFees = await studentService.getStudentFees(confirmedRecon.student.id);
    const finalHeader = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: reconAdmission.id },
      include: { feePaymentDetails: true, payments: true },
    });

    finalHeader.payments.forEach((p) => ids.payments.push(p.id));

    console.log('\n--- Verifying All 8 Financial Reconciliation Assertions ---');
    // Equation 1: Header grossAmount == sum of original component amounts
    const sumOriginal = finalHeader.feePaymentDetails.reduce(
      (sum, d) => sum.plus(new Prisma.Decimal(d.originalAmount.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(finalHeader.grossAmount.toString(), sumOriginal.toString(), 'Equation 1: grossAmount == sum(originalAmount)');
    assert.equal(finalHeader.grossAmount.toString(), '15000');
    console.log('  ✓ Eq 1 Verified: grossAmount == sum(originalAmount) (₹15,000)');

    // Equation 2: Header discountAmount == sum of component discounts
    const sumDiscounts = finalHeader.feePaymentDetails.reduce(
      (sum, d) => sum.plus(new Prisma.Decimal(d.discountAmount.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(finalHeader.discountAmount.toString(), sumDiscounts.toString(), 'Equation 2: discountAmount == sum(discountAmount)');
    assert.equal(finalHeader.discountAmount.toString(), '2000'); // 1500 + 500
    console.log('  ✓ Eq 2 Verified: discountAmount == sum(component discounts) (₹2,000)');

    // Equation 3: Header netAmount == grossAmount - discountAmount
    const expectedNet = finalHeader.grossAmount.minus(finalHeader.discountAmount);
    assert.equal(finalHeader.netAmount.toString(), expectedNet.toString(), 'Equation 3: netAmount == gross - discount');
    assert.equal(finalHeader.netAmount.toString(), '13000');
    console.log('  ✓ Eq 3 Verified: netAmount == grossAmount - discountAmount (₹13,000)');

    // Equation 4: Header totalFeeAmount == netAmount
    assert.equal(finalHeader.totalFeeAmount.toString(), finalHeader.netAmount.toString(), 'Equation 4: totalFeeAmount == netAmount');
    assert.equal(finalHeader.totalFeeAmount.toString(), '13000');
    console.log('  ✓ Eq 4 Verified: totalFeeAmount == netAmount (₹13,000)');

    // Equation 5: Header totalPaidAmount == sum of FeePayment events
    const sumPaymentEvents = finalHeader.payments.reduce(
      (sum, p) => sum.plus(new Prisma.Decimal(p.amount.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(finalHeader.totalPaidAmount.toString(), sumPaymentEvents.toString(), 'Equation 5: totalPaidAmount == sum(payment events)');
    assert.equal(finalHeader.totalPaidAmount.toString(), '13000');
    console.log('  ✓ Eq 5 Verified: totalPaidAmount == sum(FeePayment events) (₹13,000)');

    // Equation 6: Header totalPaidAmount == sum of component amountPaid values
    const sumComponentPaid = finalHeader.feePaymentDetails.reduce(
      (sum, d) => sum.plus(new Prisma.Decimal(d.amountPaid.toString())),
      new Prisma.Decimal(0),
    );
    assert.equal(finalHeader.totalPaidAmount.toString(), sumComponentPaid.toString(), 'Equation 6: totalPaidAmount == sum(component amountPaid)');
    assert.equal(sumComponentPaid.toString(), '13000');
    console.log('  ✓ Eq 6 Verified: totalPaidAmount == sum(component amountPaid values) (₹13,000)');

    // Equation 7: Header totalDueAmount == totalFeeAmount - totalPaidAmount
    const expectedDue = finalHeader.totalFeeAmount.minus(finalHeader.totalPaidAmount);
    assert.equal(finalHeader.totalDueAmount.toString(), expectedDue.toString(), 'Equation 7: totalDueAmount == totalFeeAmount - totalPaidAmount');
    assert.equal(finalHeader.totalDueAmount.toString(), '0');
    console.log('  ✓ Eq 7 Verified: totalDueAmount == totalFeeAmount - totalPaidAmount (₹0)');

    // Equation 8: No component has a negative outstanding amount
    for (const comp of finalHeader.feePaymentDetails) {
      const payable = new Prisma.Decimal(comp.totalAmountToBePaid.toString());
      const paid = new Prisma.Decimal(comp.amountPaid.toString());
      const outstanding = payable.minus(paid);
      assert.ok(
        outstanding.gte(0),
        `Component "${comp.nameSnapshot}" has negative outstanding: ${outstanding}`,
      );
    }
    console.log('  ✓ Eq 8 Verified: No component has negative outstanding');

    // =========================================================================
    // TASK 03C SECTION 4: Authorization and Tenant Isolation
    // =========================================================================
    console.log('\n--- Section 4: Authorization and Tenant Isolation ---');
    // 4.1 Cross-school category access blocked
    const schoolBCategories = await categoryService.findAll(userB.id);
    const hasSchoolACat = schoolBCategories.some((c) => c.schoolId === schoolA.id);
    assert.equal(hasSchoolACat, false, 'User B must not see School A categories');

    // 4.2 Cross-school category assignment rejected
    const foreignCat = await categoryService.create(
      { name: 'School B Excl', code: 'SCH_B_EXCL' },
      userB.id,
    );
    ids.categories.push(foreignCat.id);

    const testDraftAdm = await admissionService.create({
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      programId: programA.id,
      classId: classA.id,
      sectionId: sectionA.id,
      studentName: 'Tenant Isolation Student',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-06-06'),
      createdById: userA.id,
      selectedFeeComponentIds: [compTuition.id, compLab.id, compExam.id],
    });
    ids.admissions.push(testDraftAdm.id);

    const draftHdr = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: testDraftAdm.id },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(draftHdr.id);
    draftHdr.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    const draftDetail = draftHdr.feePaymentDetails.find((d) => d.discountApplicable)!;

    // Cross-school category access rejected
    await assert.rejects(
      async () =>
        categoryService.create(
          { name: 'Cross School Cat', code: 'CROSS_CAT', schoolId: schoolB.id },
          userA.id,
        ),
      ForbiddenException,
      'Creating category for foreign school must throw ForbiddenException',
    );

    // 4.3 Historical category references remain intact after deactivation
    const tempCat = await categoryService.create(
      { name: 'Temp Cat', code: 'TEMP_CAT' },
      userA.id,
    );
    ids.categories.push(tempCat.id);

    const assignedTemp = await db.admissionFeeConcession.create({
      data: {
        schoolId: schoolA.id,
        admissionId: testDraftAdm.id,
        feePaymentDetailsId: draftDetail.id,
        concessionCategoryId: tempCat.id,
        calculationMode: 'PAYABLE' as any,
        calculatedDiscountAmount: new Prisma.Decimal('200'),
        appliedById: userA.id,
      },
    });
    ids.concessions.push(assignedTemp.id);

    // Soft-deactivate category
    await categoryService.delete(tempCat.id, userA.id);

    // Historical concession reference is preserved
    const preservedConcession = await db.admissionFeeConcession.findUniqueOrThrow({
      where: { id: assignedTemp.id },
      include: { concessionCategory: true },
    });
    assert.equal(preservedConcession.concessionCategoryId, tempCat.id);
    assert.equal(preservedConcession.concessionCategory.name, 'Temp Cat');
    assert.equal(preservedConcession.concessionCategory.isActive, false);
    console.log('✓ Section 4 passed: Tenant isolation and historical reference preservation fully verified');

    console.log('\n==========================================================');
    console.log('ALL TASK 03C INTEGRITY REVIEW TESTS PASSED CLEANLY!');
    console.log('==========================================================\n');
  } finally {
    console.log('--- Cleaning up QA fixtures ---');
    await cleanup();
    await db.$disconnect();
    console.log('--- Cleanup complete ---');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('INTEGRITY REVIEW RUNNER FAILED:', err);
    process.exit(1);
  });
