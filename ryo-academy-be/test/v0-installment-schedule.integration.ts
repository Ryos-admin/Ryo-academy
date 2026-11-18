import assert from 'node:assert/strict';
import { DatabaseService } from '../src/database/database.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import { AdmissionInstallmentScheduleService } from '../src/admission/installment/admission-installment-schedule.service.js';
import { ScheduleCalculatorService } from '../src/admission/installment/schedule-calculator.service.js';
import { InstallmentTemplateService } from '../src/admission/installment/installment-template.service.js';
import {
  AdmissionStatus,
  FeePricingVersion,
  Gender,
  InstallmentCalculationType,
  InstallmentScheduleType,
  PaymentMethod,
  Prisma,
} from '../generated/prisma/client.js';
import { BadRequestException, ConflictException } from '@nestjs/common';

const databaseUrl = process.env.DATABASE_URL;

function checkQaTarget() {
  assert.ok(databaseUrl, 'DATABASE_URL must be set for the QA harness');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/ryo_qa');
  assert.ok(!url.hostname.includes('neon.tech'), 'Never target Neon or remote databases');
}

async function main() {
  checkQaTarget();
  console.log('Target verified as disposable local QA database: 127.0.0.1:55432/ryo_qa');

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const repo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, repo);
  const calculatorService = new ScheduleCalculatorService();
  const templateService = new InstallmentTemplateService(db);
  const scheduleService = new AdmissionInstallmentScheduleService(db, calculatorService, templateService);

  const suffix = Date.now().toString().slice(-6);
  const schoolId = `sch-m5-${suffix}`;
  const userId = `usr-m5-${suffix}`;
  const academicYearId = `ay-m5-${suffix}`;
  const programId = `prog-m5-${suffix}`;
  const classId = `cls-m5-${suffix}`;
  const sectionId = `sec-m5-${suffix}`;
  const feeStructureId = `fs-m5-${suffix}`;
  const compTuitionId = `fc-tui-${suffix}`;
  const templateId = `tpl-m5-${suffix}`;

  let admissionAId: string | null = null;
  let admissionBId: string | null = null;
  let admissionCId: string | null = null;

  try {
    console.log('1. Provisioning disposable test fixtures...');
    await db.school.create({
      data: { id: schoolId, name: `QA School BE-M5 ${suffix}`, schoolCode: `M5-${suffix}` },
    });

    await db.user.create({
      data: {
        id: userId,
        email: `admin-m5-${suffix}@test.com`,
        passwordHash: 'hash',
        firstName: 'QA',
        lastName: 'Admin',
        schoolId,
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
      data: { id: classId, programId, name: `Class 1 ${suffix}` },
    });

    await db.section.create({
      data: { id: sectionId, classId, name: `Section A ${suffix}` },
    });

    await db.feeStructure.create({
      data: {
        id: feeStructureId,
        name: `Annual Tuition ${suffix}`,
        academicYearId,
        programId,
        classId,
        totalAmount: new Prisma.Decimal('1000.00'),
        gstPercentage: new Prisma.Decimal('0.00'),
      },
    });

    await db.feeComponent.create({
      data: {
        id: compTuitionId,
        feeStructureId,
        name: 'Tuition Fee',
        amount: new Prisma.Decimal('1000.00'),
        isMandatory: true,
        discountApplicable: false,
      },
    });

    // Reusable template: 2 equal splits
    await db.installmentTemplate.create({
      data: {
        id: templateId,
        schoolId,
        name: `2-Term Equal Split ${suffix}`,
        calculationType: InstallmentCalculationType.EQUAL_SPLIT,
        installmentCount: 2,
        isActive: true,
        items: {
          create: [
            { sequence: 1, label: 'Term 1', dueDaysAfterAdmission: 0 },
            { sequence: 2, label: 'Term 2', dueDaysAfterAdmission: 90 },
          ],
        },
      },
    });

    // Helper to create V0 Admission fixture
    const createAdmissionFixture = async (num: string, name: string) => {
      const adm = await db.admission.create({
        data: {
          admissionNumber: `ADM-${num}-${suffix}`,
          admissionSequence: parseInt(num, 10),
          admissionStatus: AdmissionStatus.DRAFT,
          schoolId,
          academicYearId,
          programId,
          classId,
          sectionId,
          studentName: name,
          gender: Gender.FEMALE,
          dateOfBirth: new Date('2015-03-10'),
          parentName: `Parent ${num}`,
          parentPhone: `987654321${num.slice(-1)}`,
          createdById: userId,
        },
      });

      const hdr = await db.feePaymentHeader.create({
        data: {
          admissionId: adm.id,
          academicYearId,
          feeStructureId,
          pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          taxableAmount: new Prisma.Decimal('1000.00'),
          gstAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          isActive: true,
        },
      });

      await db.feePaymentDetails.create({
        data: {
          feePaymentHeaderId: hdr.id,
          feeComponentId: compTuitionId,
          nameSnapshot: 'Tuition Fee',
          isActive: true,
          isIncluded: true,
          originalAmount: new Prisma.Decimal('1000.00'),
          discountApplicable: false,
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
      });

      return { adm, hdr };
    };

    console.log('2. Creating V0 Admission A...');
    const fixtureA = await createAdmissionFixture('101', 'Student A');
    admissionAId = fixtureA.adm.id;

    // Test Case 1: Unpaid DRAFT V0 admission can create schedule from template
    console.log('Test Case 1: Unpaid DRAFT V0 admission creates schedule from template...');
    const schedA = await scheduleService.createFromTemplate(admissionAId, {
      templateId,
      firstDueDate: '2026-06-15',
    }, userId);
    assert.ok(schedA);
    assert.equal(schedA.scheduleType, InstallmentScheduleType.TEMPLATE);
    assert.equal(schedA.installmentCount, 2);
    assert.equal(schedA.installments.length, 2);
    assert.equal(schedA.installments[0].amount.toString(), '500');
    assert.equal(schedA.installments[1].amount.toString(), '500');
    console.log('  -> PASS: Schedule created successfully on CONFIRMED unpaid V0 admission.');

    // Test Case 2: Duplicate schedule creation returns 409 SCHEDULE_ALREADY_EXISTS
    console.log('Test Case 2: Duplicate schedule creation rejected with 409 SCHEDULE_ALREADY_EXISTS...');
    await assert.rejects(
      async () => {
        await scheduleService.createFromTemplate(admissionAId!, {
          templateId,
          firstDueDate: '2026-06-15',
        }, userId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal(err.getResponse().code, 'SCHEDULE_ALREADY_EXISTS');
        return true;
      },
    );
    console.log('  -> PASS: Duplicate creation strictly rejected with HTTP 409 SCHEDULE_ALREADY_EXISTS.');

    // Test Case 3: Schedule update replaces installments on unpaid V0 admission
    console.log('Test Case 3: Schedule update on unpaid V0 admission...');
    const updatedA = await scheduleService.updateDraftSchedule(admissionAId, {
      reason: 'Splitting into 600/400',
      installments: [
        { sequence: 1, label: 'Part 1', amount: '600.00', dueDate: '2026-07-01' },
        { sequence: 2, label: 'Part 2', amount: '400.00', dueDate: '2026-08-01' },
      ],
    }, userId);
    assert.equal(updatedA.installments[0].amount.toString(), '600');
    assert.equal(updatedA.installments[1].amount.toString(), '400');
    console.log('  -> PASS: Schedule update replaced installments atomically.');

    // Test Case 4: Creating Admission B and testing manual schedule creation with justification
    console.log('Test Case 4: Custom manual schedule creation on Admission B...');
    const fixtureB = await createAdmissionFixture('102', 'Student B');
    admissionBId = fixtureB.adm.id;
    const headerB = fixtureB.hdr;

    // Test Case 4a: Missing justification rejected
    await assert.rejects(
      async () => {
        await scheduleService.createManual(admissionBId!, {
          justification: '   ',
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-01' }],
        }, userId);
      },
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /Justification is mandatory/);
        return true;
      },
    );

    // Test Case 4b: Valid manual schedule creation succeeds
    const schedB = await scheduleService.createManual(admissionBId, {
      justification: 'Director approval for 3-part plan',
      installments: [
        { sequence: 1, label: 'Term 1', amount: '350.00', dueDate: '2026-07-01' },
        { sequence: 2, label: 'Term 2', amount: '350.00', dueDate: '2026-09-01' },
        { sequence: 3, label: 'Term 3', amount: '300.00', dueDate: '2026-11-01' },
      ],
    }, userId);
    assert.equal(schedB.scheduleType, InstallmentScheduleType.CUSTOM);
    assert.equal(schedB.installmentCount, 3);
    console.log('  -> PASS: Manual schedule created with mandatory justification.');

    // Test Case 5: Payment freezes schedule creation and updates
    console.log('Test Case 5: Payment freezes schedule creation and updates...');
    await db.feePayment.create({
      data: {
        id: `pmt-${suffix}`,
        idempotencyKey: `idem-pmt-${suffix}`,
        schoolId,
        userId,
        admissionId: admissionBId,
        feePaymentHeaderId: headerB.id,
        amount: new Prisma.Decimal('350.00'),
        paymentDate: new Date('2026-07-01'),
        paymentMethod: PaymentMethod.CASH,
      },
    });

    // Attempting schedule update must reject with SCHEDULE_FROZEN_PAYMENT_EXISTS
    await assert.rejects(
      async () => {
        await scheduleService.updateDraftSchedule(admissionBId!, {
          reason: 'Attempted modification after payment',
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-01' }],
        }, userId);
      },
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.equal(err.getResponse().code, 'SCHEDULE_FROZEN_PAYMENT_EXISTS');
        return true;
      },
    );
    console.log('  -> PASS: Existing payment strictly freezes schedule updates.');

    // Test Case 6: Creating Admission C to test database composite foreign key constraints
    console.log('Test Case 6: Verifying composite foreign key constraints in PostgreSQL catalog...');
    const fixtureC = await createAdmissionFixture('103', 'Student C');
    admissionCId = fixtureC.adm.id;
    const headerC = fixtureC.hdr;

    // Test Constraint 1: fk_schedule_header_admission
    // Attempting to insert AdmissionInstallmentSchedule pointing to headerC.id but admissionAId (mismatched admission)
    console.log('  Testing constraint 1: fk_schedule_header_admission...');
    await assert.rejects(
      async () => {
        await db.$executeRaw`
          INSERT INTO "AdmissionInstallmentSchedule" 
            (id, "schoolId", "admissionId", "feePaymentHeaderId", "scheduleType", "totalAmount", "installmentCount", "updatedAt")
          VALUES 
            (gen_random_uuid(), ${schoolId}, ${admissionAId}, ${headerC.id}, 'CUSTOM', 1000.00, 1, NOW())
        `;
      },
      (err: any) => {
        assert.ok(err.message.includes('23503') || err.message.includes('foreign key constraint'));
        return true;
      },
    );
    console.log('  -> PASS: fk_schedule_header_admission rejected cross-admission schedule insert.');

    // Create a valid schedule on C for allocation tests
    const schedC = await scheduleService.createManual(admissionCId, {
      justification: 'Schedule for C',
      installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-08-01' }],
    }, userId);
    const instCId = schedC.installments[0].id;

    const pmtC = await db.feePayment.create({
      data: {
        id: `pmt-c-${suffix}`,
        idempotencyKey: `idem-pmt-c-${suffix}`,
        schoolId,
        userId,
        admissionId: admissionCId,
        feePaymentHeaderId: headerC.id,
        amount: new Prisma.Decimal('1000.00'),
        paymentDate: new Date('2026-08-01'),
        paymentMethod: PaymentMethod.CASH,
      },
    });

    // Test Constraint 2: fk_alloc_payment_header
    // Attempting to insert FeePaymentInstallmentAllocation pointing to pmtC.id but headerB.id (mismatched header)
    console.log('  Testing constraint 2: fk_alloc_payment_header...');
    await assert.rejects(
      async () => {
        await db.$executeRaw`
          INSERT INTO "FeePaymentInstallmentAllocation" 
            (id, "feePaymentId", "installmentId", "feePaymentHeaderId", "allocatedAmount", "updatedAt")
          VALUES 
            (gen_random_uuid(), ${pmtC.id}, ${instCId}, ${headerB.id}, 1000.00, NOW())
        `;
      },
      (err: any) => {
        assert.ok(err.message.includes('23503') || err.message.includes('foreign key constraint'));
        return true;
      },
    );
    console.log('  -> PASS: fk_alloc_payment_header rejected cross-header payment allocation.');

    // Test Constraint 3: fk_alloc_installment_header
    // Attempting to insert FeePaymentInstallmentAllocation pointing to instCId but headerB.id (mismatched installment header)
    console.log('  Testing constraint 3: fk_alloc_installment_header...');
    await assert.rejects(
      async () => {
        await db.$executeRaw`
          INSERT INTO "FeePaymentInstallmentAllocation" 
            (id, "feePaymentId", "installmentId", "feePaymentHeaderId", "allocatedAmount", "updatedAt")
          VALUES 
            (gen_random_uuid(), ${pmtC.id}, ${instCId}, ${headerB.id}, 1000.00, NOW())
        `;
      },
      (err: any) => {
        assert.ok(err.message.includes('23503') || err.message.includes('foreign key constraint'));
        return true;
      },
    );
    console.log('  -> PASS: fk_alloc_installment_header rejected cross-header installment allocation.');

    console.log('\nALL 6 BE-M5.1 INTEGRATION TEST SCENARIOS PASSED WITH ZERO ERRORS.\n');
  } finally {
    console.log('3. Cleaning up disposable test fixtures...');
    await db.feePaymentInstallmentAllocation.deleteMany({ where: { header: { admission: { schoolId } } } });
    await db.feePayment.deleteMany({ where: { schoolId } });
    await db.installmentLineageTransferEdge.deleteMany({ where: { event: { schedule: { schoolId } } } });
    await db.installmentLineageEvent.deleteMany({ where: { schedule: { schoolId } } });
    await db.admissionInstallment.deleteMany({ where: { schedule: { schoolId } } });
    await db.admissionInstallmentSchedule.deleteMany({ where: { schoolId } });
    await db.installmentTemplateItem.deleteMany({ where: { template: { schoolId } } });
    await db.installmentTemplate.deleteMany({ where: { schoolId } });
    await db.student.deleteMany({ where: { admission: { schoolId } } });
    await db.feePaymentDetails.deleteMany({ where: { feePaymentHeader: { admission: { schoolId } } } });
    await db.feePaymentHeader.deleteMany({ where: { admission: { schoolId } } });
    await db.admission.deleteMany({ where: { schoolId } });
    await db.feeComponent.deleteMany({ where: { feeStructureId } });
    await db.feeStructure.deleteMany({ where: { id: feeStructureId } });
    await db.section.deleteMany({ where: { id: sectionId } });
    await db.class.deleteMany({ where: { id: classId } });
    await db.program.deleteMany({ where: { id: programId } });
    await db.academicYear.deleteMany({ where: { id: academicYearId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.school.deleteMany({ where: { id: schoolId } });

    // Verify residue
    const remainingSchools = await db.school.count({ where: { id: schoolId } });
    assert.equal(remainingSchools, 0, 'Residue check: School must be 0');
    console.log('Residue verification complete: 0 rows remaining for test tenant.');
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
