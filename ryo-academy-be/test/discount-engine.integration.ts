import assert from 'node:assert/strict';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.js';
import { FeeConcessionCategoryService } from '../src/admission/fee-concession/fee-concession-category.service.js';
import { AdmissionConcessionService } from '../src/admission/fee-concession/admission-concession.service.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { StudentService } from '../src/student/student.service.js';
import { DiscountType } from '../generated/prisma/enums.js';
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

  const categoryService = new FeeConcessionCategoryService(db);
  const admissionConcessionService = new AdmissionConcessionService(db);
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);
  const studentService = new StudentService(db);

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
      await tx.feePayment.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.payments) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.admissionFeeConcession.deleteMany({
        where: { OR: [{ id: { in: cleanIds(ids.concessions) } }, { schoolId: { in: cleanIds(ids.schools) } }] },
      });
      await tx.installmentLineageTransferEdge.deleteMany({
        where: { event: { schedule: { admission: { schoolId: { in: cleanIds(ids.schools) } } } } },
      });
      await tx.installmentLineageEvent.deleteMany({
        where: { schedule: { admission: { schoolId: { in: cleanIds(ids.schools) } } } },
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
    console.log('--- Setting up isolated QA fixtures for Discount Engine V1 ---');
    const timestamp = Date.now();

    // 1. Schools
    const schoolA = await db.school.create({
      data: { name: 'Discount QA School A', schoolCode: `QA-DISC-A-${timestamp}` },
    });
    ids.schools.push(schoolA.id);

    const schoolB = await db.school.create({
      data: { name: 'Discount QA School B', schoolCode: `QA-DISC-B-${timestamp}` },
    });
    ids.schools.push(schoolB.id);

    // 2. Users
    const userA = await db.user.create({
      data: {
        email: `admin-a-${timestamp}@example.com`,
        passwordHash: 'hash',
        firstName: 'Admin',
        lastName: 'A',
        schoolId: schoolA.id,
      },
    });
    ids.users.push(userA.id);

    const userB = await db.user.create({
      data: {
        email: `admin-b-${timestamp}@example.com`,
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
        name: `2026-2027 QA A ${timestamp}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-04-30'),
        schoolId: schoolA.id,
      },
    });
    ids.years.push(yearA.id);

    const programA = await db.program.create({
      data: {
        name: `Primary QA ${timestamp}`,
        academicYearId: yearA.id,
        startTime: '08:00',
        endTime: '14:00',
        daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      },
    });
    ids.programs.push(programA.id);

    const classA = await db.class.create({
      data: { name: `Grade 5 QA ${timestamp}`, programId: programA.id },
    });
    ids.classes.push(classA.id);

    const sectionA = await db.section.create({
      data: { name: 'A', classId: classA.id },
    });
    ids.sections.push(sectionA.id);

    // 4. Fee Structure with multiple components
    const structure = await db.feeStructure.create({
      data: {
        name: `Standard Fee Grade 5 ${timestamp}`,
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

    const compExam = await db.feeComponent.create({
      data: {
        feeStructureId: structure.id,
        name: 'Exam Fee',
        amount: 2000,
        discountApplicable: false, // Ineligible for discount
        isMandatory: true,
      },
    });
    ids.components.push(compExam.id);

    const compLab = await db.feeComponent.create({
      data: {
        feeStructureId: structure.id,
        name: 'Lab & Activity Fee',
        amount: 3000,
        discountApplicable: true,
        isMandatory: true,
      },
    });
    ids.components.push(compLab.id);

    // =========================================================================
    // TEST 1: Concession Category Management & Cross-School Scoping (Decision 2 & 3)
    // =========================================================================
    console.log('\n--- Test 1: Concession Category Scoping & Tenant Isolation ---');
    const catSibling = await categoryService.create(
      { name: 'Sibling Concession', code: 'sibling', description: 'Sibling discount' },
      userA.id,
    );
    ids.categories.push(catSibling.id);
    assert.equal(catSibling.code, 'SIBLING', 'Category code must be normalized to uppercase');
    assert.equal(catSibling.schoolId, schoolA.id);
    assert.equal(catSibling.isActive, true);

    const catMerit = await categoryService.create(
      { name: 'Merit Scholarship', code: 'MERIT' },
      userA.id,
    );
    ids.categories.push(catMerit.id);

    // Duplicate code within schoolA must be rejected
    await assert.rejects(
      async () => categoryService.create({ name: 'Dup Sibling', code: 'SIBLING' }, userA.id),
      ConflictException,
      'Duplicate code within same school must throw ConflictException',
    );

    // Same code in schoolB must SUCCEED (school-scoped independence)
    const catSiblingB = await categoryService.create(
      { name: 'Sibling School B', code: 'SIBLING' },
      userB.id,
    );
    ids.categories.push(catSiblingB.id);
    assert.equal(catSiblingB.schoolId, schoolB.id);

    // Soft-deactivate a category
    const catOld = await categoryService.create(
      { name: 'Old Concession', code: 'OLD_POLICY' },
      userA.id,
    );
    ids.categories.push(catOld.id);
    await categoryService.delete(catOld.id, userA.id);
    const deactivatedCat = await db.feeConcessionCategory.findUnique({ where: { id: catOld.id } });
    assert.equal(deactivatedCat?.isActive, false, 'Deleted category must be soft-deactivated');
    assert.ok(deactivatedCat?.deletedAt, 'deletedAt must be set');
    assert.equal(deactivatedCat?.deletedById, userA.id, 'deletedById must be recorded');
    console.log('✓ Test 1 passed: Category scoping, uniqueness, and soft-deactivation verified');

    // =========================================================================
    // TEST 2: Draft Admission Concession Assignment & Percentage Calculation
    // =========================================================================
    console.log('\n--- Test 2: Draft Admission Creation & Percentage Concession ---');
    let admission;
    try {
      admission = await admissionService.create({
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        programId: programA.id,
        classId: classA.id,
        sectionId: sectionA.id,
        studentName: 'Aarav Patel',
        gender: 'MALE' as any,
        dateOfBirth: new Date('2015-08-10'),
        addressLine1: '123 Test Road',
        postalCode: '411001',
        createdById: userA.id,
      });
    } catch (e) {
      console.error('admissionService.create threw:', e);
      throw e;
    }
    ids.admissions.push(admission.id);

    const header = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admission.id, isActive: true },
      include: { feePaymentDetails: true },
    });
    ids.headers.push(header.id);
    header.feePaymentDetails.forEach((d) => ids.details.push(d.id));

    console.log('Created header:', {
      gross: header.grossAmount.toString(),
      discount: header.discountAmount.toString(),
      net: header.netAmount.toString(),
      totalFee: header.totalFeeAmount.toString(),
      detailsCount: header.feePaymentDetails.length,
    });

    assert.equal(header.grossAmount.toString(), '15000', 'Initial gross amount must match fee structure total');
    assert.equal(header.discountAmount.toString(), '0', 'Initial discount amount must be zero');
    assert.equal(header.netAmount.toString(), '15000', 'Initial net amount must match fee structure total');

    const detailTuition = header.feePaymentDetails.find((d) => d.nameSnapshot === 'Tuition Fee')!;
    const detailExam = header.feePaymentDetails.find((d) => d.nameSnapshot === 'Exam Fee')!;
    const detailLab = header.feePaymentDetails.find((d) => d.nameSnapshot === 'Lab & Activity Fee')!;

    // Assign 15% Sibling concession on Tuition Fee (₹10,000 * 15% = ₹1,500)
    const assignResult = await admissionConcessionService.assignConcession(
      admission.id,
      {
        feePaymentDetailsId: detailTuition.id,
        concessionCategoryId: catSibling.id,
        discountType: DiscountType.PERCENTAGE,
        discountValue: '15',
        justification: 'Second sibling enrolled in academy',
      },
      userA.id,
    );
    ids.concessions.push(assignResult.concession.id);

    assert.equal(assignResult.concession.calculatedDiscountAmount.toString(), '1500');
    assert.equal(assignResult.summary.grossAmount.toString(), '15000');
    assert.equal(assignResult.summary.discountAmount.toString(), '1500');
    assert.equal(assignResult.summary.netAmount.toString(), '13500');

    // Verify DB detail row updated
    const updatedTuition = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: detailTuition.id } });
    assert.equal(updatedTuition.discountAmount.toString(), '1500');
    assert.equal(updatedTuition.finalAmount.toString(), '8500');
    assert.equal(updatedTuition.totalAmountToBePaid.toString(), '8500');
    console.log('✓ Test 2 passed: Percentage concession calculated and persisted with correct breakdown');

    // =========================================================================
    // TEST 3: Fixed Concession & Decision 1 Validation (Strict Rejection)
    // =========================================================================
    console.log('\n--- Test 3: Fixed Concession & Decision 1 Rejection ---');
    // Try fixed discount exceeding Lab Fee (₹3,001 on ₹3,000) -> MUST BE REJECTED (no auto-capping)
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailLab.id,
            concessionCategoryId: catMerit.id,
            discountType: DiscountType.FIXED,
            discountValue: '3001',
          },
          userA.id,
        ),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('cannot exceed fee component amount'), `Unexpected message: ${err.message}`);
        return true;
      },
      'Fixed discount exceeding component amount must be rejected without auto-capping (Decision 1)',
    );

    // Assign valid fixed concession: ₹1,000 on Lab Fee
    const fixedResult = await admissionConcessionService.assignConcession(
      admission.id,
      {
        feePaymentDetailsId: detailLab.id,
        concessionCategoryId: catMerit.id,
        discountType: DiscountType.FIXED,
        discountValue: '1000',
        justification: 'Merit in science competition',
      },
      userA.id,
    );
    ids.concessions.push(fixedResult.concession.id);

    assert.equal(fixedResult.concession.calculatedDiscountAmount.toString(), '1000');
    assert.equal(fixedResult.summary.grossAmount.toString(), '15000');
    assert.equal(fixedResult.summary.discountAmount.toString(), '2500'); // 1500 + 1000
    assert.equal(fixedResult.summary.netAmount.toString(), '12500');
    console.log('✓ Test 3 passed: Fixed concession validated and calculated according to Decision 1');

    // =========================================================================
    // TEST 4: Domain Invariants & Edge Cases
    // =========================================================================
    console.log('\n--- Test 4: Ineligible Component, Duplicate Concession, Inactive Category ---');
    // 4.1 Ineligible component (Exam Fee has discountApplicable = false)
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailExam.id,
            concessionCategoryId: catMerit.id,
            discountType: DiscountType.PERCENTAGE,
            discountValue: '10',
          },
          userA.id,
        ),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('not eligible for discounts'));
        return true;
      },
      'Ineligible components must reject concession assignment',
    );

    // 4.2 Duplicate concession on same component (Tuition already has Sibling concession)
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailTuition.id,
            concessionCategoryId: catMerit.id,
            discountType: DiscountType.PERCENTAGE,
            discountValue: '5',
          },
          userA.id,
        ),
      ConflictException,
      'Assigning a second concession to the same component must throw ConflictException',
    );

    // 4.3 Remove concession on Lab fee first to test category guards on an available component
    console.log('\n--- Removing concession on Lab fee to test category validation guards ---');
    const removeResult = await admissionConcessionService.removeConcession(
      admission.id,
      fixedResult.concession.id,
    );
    assert.equal(removeResult.success, true);
    assert.equal(removeResult.summary.discountAmount.toString(), '1500'); // only tuition concession remains
    assert.equal(removeResult.summary.netAmount.toString(), '13500');

    // 4.4 Inactive category rejection
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailLab.id,
            concessionCategoryId: catOld.id,
            discountType: DiscountType.PERCENTAGE,
            discountValue: '5',
          },
          userA.id,
        ),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('inactive'));
        return true;
      },
      'Deactivated category must be rejected for new assignments',
    );

    // 4.5 Cross-school category rejection
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailLab.id,
            concessionCategoryId: catSiblingB.id,
            discountType: DiscountType.PERCENTAGE,
            discountValue: '5',
          },
          userA.id,
        ),
      ForbiddenException,
      'Concession category from another school must be rejected',
    );
    console.log('✓ Test 4 passed: All domain invariants and negative edge cases correctly enforced');

    // =========================================================================
    // TEST 5: Concession Removal Verification in Draft
    // =========================================================================
    console.log('\n--- Test 5: Concession Removal Verification in Draft Status ---');
    const resetLab = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: detailLab.id } });
    assert.equal(resetLab.discountAmount.toString(), '0');
    assert.equal(resetLab.finalAmount.toString(), '3000');
    assert.equal(resetLab.totalAmountToBePaid.toString(), '3000');

    const draftHeader = await db.feePaymentHeader.findFirstOrThrow({ where: { admissionId: admission.id } });
    assert.equal(draftHeader.grossAmount.toString(), '15000');
    assert.equal(draftHeader.discountAmount.toString(), '1500');
    assert.equal(draftHeader.netAmount.toString(), '13500');
    console.log('✓ Test 5 passed: Concession removal resets component amounts and updates header totals');

    // =========================================================================
    // TEST 6: Atomic Admission Confirmation & Obligation Freezing
    // =========================================================================
    console.log('\n--- Test 6: Atomic Admission Confirmation & Obligation Freezing ---');
    const confirmedAdmission = await admissionService.updateStatusById(
      admission.id,
      { id: userA.id, userId: userA.id },
      'CONFIRMED',
    );
    assert.equal(confirmedAdmission.admissionStatus, 'CONFIRMED');
    assert.ok(confirmedAdmission.student, 'Student record must be created upon confirmation');
    ids.students.push(confirmedAdmission.student.id);

    const confirmedHeader = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admission.id },
    });
    assert.equal(confirmedHeader.grossAmount.toString(), '15000', 'Gross amount must remain ₹15,000');
    assert.equal(confirmedHeader.discountAmount.toString(), '1500', 'Discount amount must be ₹1,500');
    assert.equal(confirmedHeader.netAmount.toString(), '13500', 'Net amount must be ₹13,500');
    assert.equal(confirmedHeader.totalFeeAmount.toString(), '13500', 'Total fee amount must equal net payable');
    assert.equal(confirmedHeader.totalDueAmount.toString(), '13500', 'Total due amount must equal net payable');
    assert.equal(confirmedHeader.totalPaidAmount.toString(), '0', 'Total paid amount must be 0');
    console.log('✓ Test 6 passed: Admission confirmed and financial obligations permanently frozen');

    // =========================================================================
    // TEST 7: Post-Confirmation Immutability Enforcement
    // =========================================================================
    console.log('\n--- Test 7: Post-Confirmation Immutability Enforcement ---');
    // 7.1 Reject new concession assignment
    await assert.rejects(
      async () =>
        admissionConcessionService.assignConcession(
          admission.id,
          {
            feePaymentDetailsId: detailLab.id,
            concessionCategoryId: catMerit.id,
            discountType: DiscountType.FIXED,
            discountValue: '500',
          },
          userA.id,
        ),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('cannot be modified on confirmed'));
        return true;
      },
      'Assigning concession on confirmed admission must be strictly rejected',
    );

    // 7.2 Reject concession removal
    await assert.rejects(
      async () =>
        admissionConcessionService.removeConcession(admission.id, assignResult.concession.id),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('cannot be modified on confirmed'));
        return true;
      },
      'Removing concession on confirmed admission must be strictly rejected',
    );

    // 7.3 Reject updating fee obligations via updateById
    await assert.rejects(
      async () =>
        admissionService.updateById(admission.id, {
          feePaymentHeaders: {
            feePaymentHeaderId: confirmedHeader.id,
            totalFeeAmount: 20000,
            grossAmount: 20000,
            discountAmount: 0,
            netAmount: 20000,
            feePaymentDetails: [],
          } as any,
        }),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('cannot be modified after admission confirmation'));
        return true;
      },
      'Fee structures and obligations cannot be modified after admission confirmation',
    );
    console.log('✓ Test 7 passed: Strict post-confirmation immutability verified across all entry points');

    // =========================================================================
    // TEST 8: Post-Confirmation Payment Integration (Seamless Handshake)
    // =========================================================================
    console.log('\n--- Test 8: Post-Confirmation Payment Collection & Historical Integrity ---');
    const payment = await studentService.recordStudentFeePayment(
      confirmedAdmission.student.id,
      {
        amount: '5000',
        paymentDate: new Date().toISOString(),
        paymentMethod: 'CASH' as any,
        idempotencyKey: `idemp-disc-pay-${timestamp}`,
      },
      userA.id,
    );
    ids.payments.push(payment.paymentId);

    const postPayHeader = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admission.id },
    });
    assert.equal(postPayHeader.grossAmount.toString(), '15000', 'Gross amount unchanged');
    assert.equal(postPayHeader.discountAmount.toString(), '1500', 'Discount amount unchanged');
    assert.equal(postPayHeader.netAmount.toString(), '13500', 'Net amount unchanged');
    assert.equal(postPayHeader.totalFeeAmount.toString(), '13500', 'Total fee amount unchanged');
    assert.equal(postPayHeader.totalPaidAmount.toString(), '5000', 'Total paid amount incremented');
    assert.equal(postPayHeader.totalDueAmount.toString(), '8500', 'Total due amount decremented correctly');

    const paymentLog = await db.financialLog.findFirst({
      where: { feePaymentId: payment.paymentId },
    });
    if (paymentLog) ids.logs.push(paymentLog.id);

    console.log('✓ Test 8 passed: Payments allocate smoothly against net frozen obligation without altering discount history');

    console.log('\n==========================================================');
    console.log('ALL 8 DISCOUNT ENGINE V1 INTEGRATION TESTS PASSED CLEANLY!');
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
    console.error('INTEGRATION TEST RUNNER FAILED:', err);
    process.exit(1);
  });
