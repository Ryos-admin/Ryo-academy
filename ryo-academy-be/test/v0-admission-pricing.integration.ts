import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionConcessionService } from '../src/admission/fee-concession/admission-concession.service.js';
import { FeePricingVersion, AdmissionStatus } from '../generated/prisma/enums.js';
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
  await assertQaDatabase(db);

  const repo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, repo);
  const concessionService = new AdmissionConcessionService(db);

  const suffix = Date.now().toString().slice(-6);
  const schoolId = `sch-v0-${suffix}`;
  const userId = `usr-v0-${suffix}`;
  const academicYearId = `ay-v0-${suffix}`;
  const programId = `prog-v0-${suffix}`;
  const classId = `cls-v0-${suffix}`;
  const sectionId = `sec-v0-${suffix}`;
  const feeStructureId = `fs-v0-${suffix}`;
  const componentTuitionId = `fc-tui-${suffix}`;
  const componentExamId = `fc-exm-${suffix}`;
  const componentInactiveId = `fc-ina-${suffix}`;

  let createdAdmissionId: string | null = null;

  try {
    console.log('1. Setting up isolated test fixtures...');
    await db.school.create({
      data: {
        id: schoolId,
        name: `V0 QA School ${suffix}`,
        schoolCode: `SCH-${suffix}`,
      },
    });

    await db.user.create({
      data: {
        id: userId,
        schoolId,
        firstName: 'Test',
        lastName: 'Admin',
        email: `v0-admin-${suffix}@example.com`,
        passwordHash: 'dummy-hash',
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
        name: `Primary ${suffix}`,
        startTime: '09:00',
        endTime: '15:00',
        daysOfWeek: ['MONDAY', 'TUESDAY'],
      },
    });

    await db.class.create({
      data: {
        id: classId,
        programId,
        name: `Grade 5 ${suffix}`,
      },
    });

    await db.section.create({
      data: {
        id: sectionId,
        classId,
        name: `Section A ${suffix}`,
      },
    });

    await db.feeStructure.create({
      data: {
        id: feeStructureId,
        academicYearId,
        programId,
        classId,
        name: `V0 Master ${suffix}`,
        description: 'V0 Fee Structure Master',
        totalAmount: new Prisma.Decimal('1250.00'),
        gstPercentage: new Prisma.Decimal('18.00'),
        isActive: true,
        feeComponents: {
          create: [
            {
              id: componentTuitionId,
              name: 'Tuition Fee',
              amount: new Prisma.Decimal('1000.00'),
              isMandatory: true,
              discountApplicable: true,
              isActive: true,
            },
            {
              id: componentExamId,
              name: 'Examination Fee',
              amount: new Prisma.Decimal('250.00'),
              isMandatory: false,
              discountApplicable: false,
              isActive: true,
            },
            {
              id: componentInactiveId,
              name: 'Old Archival Fee',
              amount: new Prisma.Decimal('100.00'),
              isMandatory: false,
              discountApplicable: false,
              isActive: false,
            },
          ],
        },
      },
    });

    console.log('2. Testing coordinated master locking (FOR SHARE vs FOR UPDATE)...');
    let lockAcquired = false;
    let lockReleased = false;
    let updateBlocked = true;

    // Start a transaction that acquires FOR SHARE on the fee structure
    const lockHolder = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FeeStructure" WHERE id = ${feeStructureId} FOR SHARE`;
      lockAcquired = true;
      // Sleep 600ms inside transaction
      await new Promise((resolve) => setTimeout(resolve, 600));
      lockReleased = true;
    });

    // Wait until tx has acquired FOR SHARE
    while (!lockAcquired) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Try to acquire FOR UPDATE concurrently - must block until lockReleased is true
    const concurrentAttempt = db.$transaction(async (tx) => {
      const startWait = Date.now();
      await tx.$queryRaw`SELECT id FROM "FeeStructure" WHERE id = ${feeStructureId} FOR UPDATE`;
      if (!lockReleased) {
        updateBlocked = false;
      }
      return Date.now() - startWait;
    });

    await Promise.all([lockHolder, concurrentAttempt]);
    assert.equal(updateBlocked, true, 'FOR UPDATE was properly blocked by FOR SHARE');
    console.log('   ✓ FOR SHARE lock blocks concurrent FOR UPDATE as required');

    console.log('3. Updating GST percentage on master before admission creation...');
    await db.feeStructure.update({
      where: { id: feeStructureId },
      data: { gstPercentage: new Prisma.Decimal('12.00') },
    });

    console.log('4. Creating admission with Tuition (10% discount) and Exam (initially excluded)...');
    const admission = await admissionService.create({
      schoolId,
      academicYearId,
      programId,
      classId,
      sectionId,
      studentName: 'Aarav Patel',
      gender: 'MALE' as any,
      dateOfBirth: new Date('2015-05-10'),
      parentName: 'Sanjay Patel',
      parentRelation: 'FATHER' as any,
      parentPhone: '9876543210',
      parentAlternatePhone: '9876543211',
      parentEmail: 'sanjay.patel@example.com',
      addressLine1: '45 Lake View Road',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      createdById: userId,
      components: [
        { feeComponentId: componentTuitionId, discountPercentage: '10.00' },
      ],
    } as any);

    createdAdmissionId = admission.id;
    assert.ok(createdAdmissionId, 'Admission created successfully');

    console.log('5. Verifying persisted header and detail snapshots in PostgreSQL...');
    const header = await db.feePaymentHeader.findFirst({
      where: { admissionId: createdAdmissionId, isActive: true },
      include: { feePaymentDetails: true },
    });

    assert.ok(header, 'Active fee payment header exists');
    assert.equal(header.pricingVersion, FeePricingVersion.V0_SNAPSHOTTED);
    // Gross: 1000 (tuition only, exam excluded contributes 0)
    assert.equal(header.grossAmount.toString(), '1000');
    // Discount: 100
    assert.equal(header.discountAmount.toString(), '100');
    // Taxable: 900
    assert.equal(header.taxableAmount?.toString(), '900');
    // GST (12% of 900): 108
    assert.equal(header.gstAmount?.toString(), '108');
    // Net / Total: 1008
    assert.equal(header.netAmount.toString(), '1008');
    assert.equal(header.totalFeeAmount.toString(), '1008');
    assert.equal(header.totalDueAmount.toString(), '1008');
    assert.equal(header.totalPaidAmount.toString(), '0');

    // Details: Tuition + Exam snapshotted, Inactive omitted
    assert.equal(header.feePaymentDetails.length, 2, 'Only active master components are snapshotted');

    const tuitionDetail = header.feePaymentDetails.find((d) => d.feeComponentId === componentTuitionId);
    assert.ok(tuitionDetail);
    assert.equal(tuitionDetail.isIncluded, true);
    assert.equal(tuitionDetail.originalAmount.toString(), '1000');
    assert.equal(tuitionDetail.discountPercentage?.toString(), '10');
    assert.equal(tuitionDetail.discountAmount.toString(), '100');
    assert.equal(tuitionDetail.taxableAmount?.toString(), '900');
    assert.equal(tuitionDetail.gstPercentage?.toString(), '12');
    assert.equal(tuitionDetail.gstAmount?.toString(), '108');
    assert.equal(tuitionDetail.totalAmountToBePaid.toString(), '1008');

    const examDetail = header.feePaymentDetails.find((d) => d.feeComponentId === componentExamId);
    assert.ok(examDetail);
    assert.equal(examDetail.isIncluded, false);
    assert.equal(examDetail.originalAmount.toString(), '250');
    assert.equal(examDetail.discountPercentage?.toString(), '0');
    assert.equal(examDetail.discountAmount.toString(), '0');
    assert.equal(examDetail.taxableAmount?.toString(), '250');
    assert.equal(examDetail.gstPercentage?.toString(), '12');
    assert.equal(examDetail.gstAmount?.toString(), '30');
    assert.equal(examDetail.totalAmountToBePaid.toString(), '280');

    console.log('   ✓ Header and details snapshots correctly persisted with V0 pricing rules');

    console.log('6. Testing DRAFT fee configuration re-inclusion...');
    await admissionService.updateFeeConfiguration(createdAdmissionId, {
      selectedFeeComponentIds: [tuitionDetail.id, examDetail.id],
    });

    const updatedHeader = await db.feePaymentHeader.findFirst({
      where: { admissionId: createdAdmissionId, isActive: true },
      include: { feePaymentDetails: true },
    });
    assert.ok(updatedHeader);
    const updatedExam = updatedHeader.feePaymentDetails.find((d) => d.id === examDetail.id);
    assert.equal(updatedExam?.isIncluded, true);
    // Preserves snapshot pricing
    assert.equal(updatedExam?.taxableAmount?.toString(), '250');
    assert.equal(updatedExam?.gstAmount?.toString(), '30');
    assert.equal(updatedExam?.totalAmountToBePaid.toString(), '280');

    // Header recomputed: Tuition 1008 + Exam 280 = 1288
    assert.equal(updatedHeader.grossAmount.toString(), '1250');
    assert.equal(updatedHeader.taxableAmount?.toString(), '1150');
    assert.equal(updatedHeader.gstAmount?.toString(), '138');
    assert.equal(updatedHeader.netAmount.toString(), '1288');
    console.log('   ✓ Re-inclusion reuses original snapshot and recomputes header correctly');

    console.log('7. Testing concession mutation behavior on V0 admission...');
    // 7a. Concession assignment on eligible DRAFT V0 admission succeeds and recalculates V0 GST
    await concessionService.assignConcession(
      createdAdmissionId,
      {
        feePaymentDetailsId: tuitionDetail.id,
        payableAmount: '500.00',
      } as any,
      userId
    );

    const concessionHeader = await db.feePaymentHeader.findFirst({
      where: { admissionId: createdAdmissionId, isActive: true },
      include: { feePaymentDetails: true },
    });
    assert.ok(concessionHeader);
    const concessionTuition = concessionHeader.feePaymentDetails.find((d) => d.id === tuitionDetail.id);
    assert.ok(concessionTuition);
    assert.equal(concessionTuition.discountAmount.toString(), '500');
    assert.equal(concessionTuition.taxableAmount?.toString(), '500');
    assert.equal(concessionTuition.gstAmount?.toString(), '60');
    assert.equal(concessionTuition.totalAmountToBePaid.toString(), '560');

    // Header recomputed with V0 GST: Tuition (560) + Exam (280) = 840
    assert.equal(concessionHeader.grossAmount.toString(), '1250');
    assert.equal(concessionHeader.discountAmount.toString(), '500');
    assert.equal(concessionHeader.taxableAmount?.toString(), '750');
    assert.equal(concessionHeader.gstAmount?.toString(), '90');
    assert.equal(concessionHeader.netAmount.toString(), '840');
    console.log('   ✓ Concession assignment recalculates V0 GST snapshot correctly');

    // 7b. Concession mutation rejected when component is not eligible for discounts (Exam Fee)
    await assert.rejects(
      concessionService.assignConcession(
        createdAdmissionId,
        {
          feePaymentDetailsId: examDetail.id,
          payableAmount: '200.00',
        } as any,
        userId
      ),
      BadRequestException,
      'Concession assignment must be rejected on non-discountable components'
    );
    console.log('   ✓ Concession mutation rejected on non-discountable component');

    console.log('All V0 Admission Pricing integration assertions passed cleanly!');
  } finally {
    console.log('8. Cleaning up test fixtures...');
    if (createdAdmissionId) {
      await db.admissionFeeConcession.deleteMany({
        where: { admissionId: createdAdmissionId },
      });
      await db.feePaymentDetails.deleteMany({
        where: { feePaymentHeader: { admissionId: createdAdmissionId } },
      });
      await db.feePaymentHeader.deleteMany({
        where: { admissionId: createdAdmissionId },
      });
      await db.student.deleteMany({
        where: { admissionId: createdAdmissionId },
      });
      await db.admission.deleteMany({
        where: { id: createdAdmissionId },
      });
    }
    await db.feeComponent.deleteMany({ where: { feeStructureId } });
    await db.feeStructure.deleteMany({ where: { id: feeStructureId } });
    await db.section.deleteMany({ where: { id: sectionId } });
    await db.class.deleteMany({ where: { id: classId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.academicYear.deleteMany({ where: { id: academicYearId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.school.deleteMany({ where: { id: schoolId } });

    // Verify residue
    const remainingAdmissions = await db.admission.count({ where: { id: createdAdmissionId ?? '' } });
    const remainingSchools = await db.school.count({ where: { id: schoolId } });
    assert.equal(remainingAdmissions, 0, 'Zero admission residue');
    assert.equal(remainingSchools, 0, 'Zero school residue');
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
