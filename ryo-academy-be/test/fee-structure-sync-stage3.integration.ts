import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import {
  FeeStructureSyncService,
  ComponentChangeType,
} from '../src/admission/fee-component/fee-structure-sync.service.js';
import { AdmissionRepository } from '../src/admission/admission-fee-log/admission.repository.js';
import { AdmissionService } from '../src/admission/admission-fee-log/admission.service.js';
import {
  AdmissionStatus,
  DayOfWeek,
  Gender,
  PaymentMethod,
  Prisma,
  Relation,
} from '../generated/prisma/client.js';
import { ConflictException } from '@nestjs/common';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required');

  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  await assertQaDatabase(db);

  console.log('\n================================================================');
  console.log('FEE STRUCTURE SYNC STAGE 3 INTEGRATION TEST (MUTATION & DELTA)');
  console.log('================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const schoolId = `sch-sync3-${runId}`;
  const adminUserId = `usr-sync3-${runId}`;

  const feeStructureSyncService = new FeeStructureSyncService(db);
  const admissionRepo = new AdmissionRepository(db);
  const admissionService = new AdmissionService(db, admissionRepo);

  try {
    // 1. Setup Base School, Role, User
    await db.school.create({
      data: { id: schoolId, name: `Sync Stage 3 School ${runId}`, schoolCode: `SYNC3-${runId}` },
    });

    const roleAdmin = await db.role.upsert({
      where: { name: 'COLLEGE_ADMIN' },
      update: {},
      create: { name: 'COLLEGE_ADMIN', description: 'College Admin' },
    });

    await db.user.create({
      data: {
        id: adminUserId,
        schoolId,
        firstName: 'Sync',
        lastName: 'Admin',
        email: `admin-sync3-${runId}@ryo.local`,
        passwordHash: 'dummyhash',
        roles: { create: { roleId: roleAdmin.id } },
      },
    });

    // 2. Setup Academic Year, Program, Class, Section
    const academicYear = await db.academicYear.create({
      data: {
        name: `AY 2026-27 ${runId}`,
        schoolId,
        startDate: new Date('2026-06-01T00:00:00Z'),
        endDate: new Date('2027-05-31T23:59:59Z'),
      },
    });

    const program = await db.program.create({
      data: {
        name: `Science ${runId}`,
        academicYearId: academicYear.id,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
        startTime: '08:00',
        endTime: '14:00',
      },
    });

    const klass = await db.class.create({
      data: { name: `Grade 11 ${runId}`, programId: program.id },
    });

    const section = await db.section.create({
      data: { name: `A ${runId}`, classId: klass.id },
    });

    // 3. Setup FeeStructure with initial active components
    const feeStructure = await db.feeStructure.create({
      data: {
        name: `Stage 3 Master Fee ${runId}`,
        academicYearId: academicYear.id,
        programId: program.id,
        classId: klass.id,
        totalAmount: new Prisma.Decimal('10000.00'),
        isActive: true,
      },
    });

    const initialTuitionComponent = await db.feeComponent.create({
      data: {
        name: `Tuition Fee ${runId}`,
        amount: new Prisma.Decimal('10000.00'),
        feeStructureId: feeStructure.id,
        isMandatory: true,
        discountApplicable: false,
        isActive: true,
      },
    });

    const adminActor = {
      userId: adminUserId,
      id: adminUserId,
      schoolId,
      roles: ['COLLEGE_ADMIN'],
    };

    // 4. Create an eligible admission with FeePaymentHeader & Details
    const admission = await admissionService.create(
      {
        schoolId,
        academicYearId: academicYear.id,
        programId: program.id,
        classId: klass.id,
        sectionId: section.id,
        studentName: `Student StageThree ${runId}`,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-05-15'),
        parentName: 'Parent StageThree',
        parentRelation: Relation.MOTHER,
        parentPhone: '9876543210',
        addressLine1: '123 QA Lane',
        city: 'Metropolis',
        state: 'State',
        postalCode: '500001',
        country: 'India',
        createdById: adminUserId,
        selectedFeeComponentIds: [initialTuitionComponent.id],
        components: [
          { feeComponentId: initialTuitionComponent.id, discountPercentage: '0.00' },
        ],
      },
      adminActor as any,
    );

    const admissionId = admission.id;
    console.log(`Created baseline admission: ${admissionId}`);

    // Snapshot admission tables before Stage 3 operations to verify zero modification
    const getFinancialSnapshot = async () => {
      const header = await db.feePaymentHeader.findFirstOrThrow({
        where: { admissionId, feeStructureId: feeStructure.id, isActive: true },
      });
      const details = await db.feePaymentDetails.findMany({
        where: { feePaymentHeaderId: header.id },
        orderBy: { id: 'asc' },
      });
      const schedule = await db.admissionInstallmentSchedule.findFirst({
        where: { feePaymentHeaderId: header.id },
      });
      const installments = schedule
        ? await db.admissionInstallment.findMany({
            where: { scheduleId: schedule.id },
            orderBy: { id: 'asc' },
          })
        : [];
      return { header, details, schedule, installments };
    };

    const initialSnapshot = await getFinancialSnapshot();
    console.log(`Initial header totalFeeAmount: ₹${initialSnapshot.header.totalFeeAmount}, netAmount: ₹${initialSnapshot.header.netAmount}`);

    // -------------------------------------------------------------------------
    // TEST 1: Add new mandatory FeeComponent with sync delta plan
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Create Mandatory FeeComponent ---');
    const createResult = await feeStructureSyncService.createComponentWithSyncPlan(
      {
        feeStructureId: feeStructure.id,
        name: `Lab Fee ${runId}`,
        amount: '2500.50',
        isMandatory: true,
        discountApplicable: false,
      },
      adminUserId,
    );

    assert.ok(createResult.component.id, 'Component ID generated');
    assert.equal(createResult.plan.changeType, ComponentChangeType.NEW_COMPONENT);
    assert.equal(createResult.plan.previousMasterTotal.toFixed(2), '10000.00');
    assert.equal(createResult.plan.newMasterTotal.toFixed(2), '12500.50');
    assert.equal(createResult.plan.masterTotalDelta.toFixed(2), '2500.50');
    assert.equal(createResult.plan.eligibleAdmissionCount, 1);

    const admPlan1 = createResult.plan.admissions[0];
    assert.equal(admPlan1.admissionId, admissionId);
    assert.equal(admPlan1.grossAdmissionDelta.toFixed(2), '2500.50');
    assert.equal(admPlan1.componentDeltas.length, 1);
    assert.equal(admPlan1.componentDeltas[0].changeType, ComponentChangeType.NEW_COMPONENT);
    assert.equal(admPlan1.componentDeltas[0].grossDeltaAmount.toFixed(2), '2500.50');
    assert.equal(admPlan1.componentDeltas[0].isNew, true);
    assert.equal(admPlan1.componentDeltas[0].isMandatory, true);

    // Verify master table in DB was updated
    const masterAfterT1 = await db.feeStructure.findUniqueOrThrow({ where: { id: feeStructure.id } });
    assert.equal(new Prisma.Decimal(masterAfterT1.totalAmount.toString()).toFixed(2), '12500.50');

    // CRITICAL: Verify ZERO mutation on admission financial records
    const snapshotAfterT1 = await getFinancialSnapshot();
    assert.equal(snapshotAfterT1.header.totalFeeAmount.toString(), initialSnapshot.header.totalFeeAmount.toString());
    assert.equal(snapshotAfterT1.header.netAmount.toString(), initialSnapshot.header.netAmount.toString());
    assert.equal(snapshotAfterT1.header.totalDueAmount.toString(), initialSnapshot.header.totalDueAmount.toString());
    assert.equal(snapshotAfterT1.details.length, initialSnapshot.details.length);
    console.log('✓ Test 1 passed: Mandatory component created, master total recomputed, delta plan returned, admission unmodified.');

    // -------------------------------------------------------------------------
    // TEST 2: Add new optional FeeComponent with sync delta plan
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Create Optional FeeComponent ---');
    const optionalResult = await feeStructureSyncService.createComponentWithSyncPlan(
      {
        feeStructureId: feeStructure.id,
        name: `Transport Optional ${runId}`,
        amount: '1500.00',
        isMandatory: false,
        discountApplicable: false,
      },
      adminUserId,
    );

    assert.equal(optionalResult.plan.newMasterTotal.toFixed(2), '14000.50');
    assert.equal(optionalResult.plan.masterTotalDelta.toFixed(2), '1500.00');

    const admPlan2 = optionalResult.plan.admissions[0];
    assert.equal(admPlan2.grossAdmissionDelta.toFixed(2), '0.00');
    assert.equal(admPlan2.componentDeltas[0].changeType, ComponentChangeType.UNCHANGED);
    assert.equal(admPlan2.componentDeltas[0].grossDeltaAmount.toFixed(2), '0.00');
    assert.equal(admPlan2.componentDeltas[0].isMandatory, false);
    console.log('✓ Test 2 passed: Optional component created, master total recomputed, admission delta is ₹0.00.');

    // -------------------------------------------------------------------------
    // TEST 3: Update FeeComponent Amount (Increase & Decrease)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Update Component Amount (Increase & Decrease) ---');
    // 3a. Increase Tuition from 10000 to 12000 (+2000)
    const updateIncResult = await feeStructureSyncService.updateComponentWithSyncPlan(
      initialTuitionComponent.id,
      { amount: '12000.00' },
      adminUserId,
    );

    assert.equal(updateIncResult.plan.changeType, ComponentChangeType.AMOUNT_INCREASED);
    assert.equal(updateIncResult.plan.previousMasterTotal.toFixed(2), '14000.50');
    assert.equal(updateIncResult.plan.newMasterTotal.toFixed(2), '16000.50');
    assert.equal(updateIncResult.plan.masterTotalDelta.toFixed(2), '2000.00');
    assert.equal(updateIncResult.plan.admissions[0].grossAdmissionDelta.toFixed(2), '2000.00');
    assert.equal(updateIncResult.plan.admissions[0].componentDeltas[0].changeType, ComponentChangeType.AMOUNT_INCREASED);

    // 3b. Decrease Tuition from 12000 to 9000 (-3000)
    const updateDecResult = await feeStructureSyncService.updateComponentWithSyncPlan(
      initialTuitionComponent.id,
      { amount: '9000.00' },
      adminUserId,
    );

    assert.equal(updateDecResult.plan.changeType, ComponentChangeType.AMOUNT_DECREASED);
    assert.equal(updateDecResult.plan.previousMasterTotal.toFixed(2), '16000.50');
    assert.equal(updateDecResult.plan.newMasterTotal.toFixed(2), '13000.50');
    assert.equal(updateDecResult.plan.masterTotalDelta.toFixed(2), '-3000.00');
    // Note: admission gross delta is relative to admission's current detail (10000.00), so 9000 - 10000 = -1000.00
    assert.equal(updateDecResult.plan.admissions[0].grossAdmissionDelta.toFixed(2), '-1000.00');
    assert.equal(updateDecResult.plan.admissions[0].componentDeltas[0].changeType, ComponentChangeType.AMOUNT_DECREASED);

    // CRITICAL: Admission tables still strictly unmodified
    const snapshotAfterT3 = await getFinancialSnapshot();
    assert.equal(snapshotAfterT3.header.totalFeeAmount.toString(), initialSnapshot.header.totalFeeAmount.toString());
    assert.equal(snapshotAfterT3.details.length, initialSnapshot.details.length);
    console.log('✓ Test 3 passed: Component update delta determination accurate for increase and decrease, admission untouched.');

    // -------------------------------------------------------------------------
    // TEST 4: Deactivation Rejection when amountPaid > 0
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Deactivation Guard Rejection (amountPaid > 0) ---');
    // Temporarily simulate a paid amount on initial tuition detail with consistent header balances
    await db.feePaymentDetails.updateMany({
      where: { feeComponentId: initialTuitionComponent.id, feePaymentHeaderId: initialSnapshot.header.id },
      data: { amountPaid: new Prisma.Decimal('500.00') },
    });
    await db.feePaymentHeader.update({
      where: { id: initialSnapshot.header.id },
      data: {
        totalPaidAmount: new Prisma.Decimal('500.00'),
        totalDueAmount: new Prisma.Decimal('9500.00'),
      },
    });

    let rejectionError: any;
    try {
      await feeStructureSyncService.deactivateComponentWithSyncPlan(initialTuitionComponent.id, adminUserId);
    } catch (err) {
      rejectionError = err;
    }

    assert.ok(rejectionError instanceof ConflictException, 'Throws ConflictException on deactivation with paid amount');
    assert.equal((rejectionError as any).getResponse().code, 'COMPONENT_DEACTIVATION_PAID_RESTRICTION');

    // Verify component row was NOT deactivated (transaction rolled back)
    const compAfterRejection = await db.feeComponent.findUniqueOrThrow({ where: { id: initialTuitionComponent.id } });
    assert.equal(compAfterRejection.isActive, true, 'Component remains active');
    assert.equal(compAfterRejection.deletedAt, null, 'deletedAt remains null');
    console.log('✓ Test 4 passed: Deactivation rejected with 409 COMPONENT_DEACTIVATION_PAID_RESTRICTION, complete rollback.');

    // -------------------------------------------------------------------------
    // TEST 5: Permitted Deactivation when amountPaid == 0 (with historical attribution)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Permitted Deactivation (amountPaid == 0 with historical attribution) ---');
    // Restore detail amountPaid and header balances to 0.00 / 10000.00, simulating full reversal
    await db.feePaymentDetails.updateMany({
      where: { feeComponentId: initialTuitionComponent.id, feePaymentHeaderId: initialSnapshot.header.id },
      data: { amountPaid: new Prisma.Decimal('0.00') },
    });
    await db.feePaymentHeader.update({
      where: { id: initialSnapshot.header.id },
      data: {
        totalPaidAmount: new Prisma.Decimal('0.00'),
        totalDueAmount: new Prisma.Decimal('10000.00'),
      },
    });

    // Create a dummy payment and attribution to simulate historical reversed payment
    const payment = await db.feePayment.create({
      data: {
        idempotencyKey: `idemp-sync3-${runId}`,
        admissionId,
        userId: adminUserId,
        paymentDate: new Date(),
        amount: new Prisma.Decimal('0.00'),
        paymentMethod: PaymentMethod.CASH,
        schoolId,
        feePaymentHeaderId: initialSnapshot.header.id,
      },
    });

    const tuitionDetail = await db.feePaymentDetails.findFirstOrThrow({
      where: { feeComponentId: initialTuitionComponent.id, feePaymentHeaderId: initialSnapshot.header.id },
    });

    await db.feePaymentDetailAttribution.create({
      data: {
        feePaymentId: payment.id,
        feePaymentDetailsId: tuitionDetail.id,
        feePaymentHeaderId: initialSnapshot.header.id,
        amount: new Prisma.Decimal('500.00'),
      },
    });

    // Now call deactivation
    const deactResult = await feeStructureSyncService.deactivateComponentWithSyncPlan(
      initialTuitionComponent.id,
      adminUserId,
    );

    assert.equal(deactResult.component.isActive, false, 'Component deactivated');
    assert.ok(deactResult.component.deletedAt, 'deletedAt populated');
    assert.equal(deactResult.plan.changeType, ComponentChangeType.COMPONENT_DEACTIVATED);
    assert.equal(deactResult.plan.masterTotalDelta.toFixed(2), '-9000.00');

    const admPlan5 = deactResult.plan.admissions[0];
    // Note: admission gross delta is relative to existing detail (10000.00), so 0 - 10000.00 = -10000.00
    assert.equal(admPlan5.grossAdmissionDelta.toFixed(2), '-10000.00');
    assert.equal(admPlan5.componentDeltas[0].changeType, ComponentChangeType.COMPONENT_DEACTIVATED);
    assert.equal(admPlan5.componentDeltas[0].isDeactivated, true);
    assert.equal(admPlan5.componentDeltas[0].hasHistoricalAttributions, true);
    assert.equal(admPlan5.componentDeltas[0].currentDetailAmountPaid.toFixed(2), '0.00');

    // Verify detail row in DB is NOT deleted
    const detailInDb = await db.feePaymentDetails.findUnique({ where: { id: tuitionDetail.id } });
    assert.ok(detailInDb, 'FeePaymentDetails row remains in DB');
    console.log('✓ Test 5 passed: Permitted deactivation succeeded with historical attribution, relational identity preserved.');

    // -------------------------------------------------------------------------
    // TEST 6: Strict Two-Decimal Arithmetic Precision
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Decimal Precision & Paise Conservation ---');
    const fracComp = await feeStructureSyncService.createComponentWithSyncPlan(
      {
        feeStructureId: feeStructure.id,
        name: `Decimal Paise Component ${runId}`,
        amount: '100.33',
        isMandatory: true,
      },
      adminUserId,
    );
    assert.equal(fracComp.plan.newMasterTotal.toFixed(2), (new Prisma.Decimal(deactResult.plan.newMasterTotal.toString()).plus('100.33')).toFixed(2));
    assert.equal(fracComp.plan.admissions[0].grossAdmissionDelta.toFixed(2), '100.33');
    console.log('✓ Test 6 passed: Two-decimal paise precision verified without floating point error.');

    // -------------------------------------------------------------------------
    // TEST 7: Stage 3.1 Historical Inclusion Preservation (Optional -> Mandatory)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Historical Inclusion Preservation (Optional -> Mandatory) ---');
    // Create admission2 with optional component UNSELECTED (isIncluded: false)
    const optionalCompId = optionalResult.component.id;
    const admission2 = await admissionService.create(
      {
        schoolId,
        academicYearId: academicYear.id,
        programId: program.id,
        classId: klass.id,
        sectionId: section.id,
        studentName: `Student Stage31 ${runId}`,
        gender: Gender.MALE,
        dateOfBirth: new Date('2018-08-20'),
        parentName: 'Parent Stage31',
        parentRelation: Relation.FATHER,
        parentPhone: '9876543211',
        addressLine1: '456 QA Lane',
        city: 'Metropolis',
        state: 'State',
        postalCode: '500001',
        country: 'India',
        createdById: adminUserId,
        selectedFeeComponentIds: [createResult.component.id, fracComp.component.id],
        components: [
          { feeComponentId: createResult.component.id, discountPercentage: '0.00' },
          { feeComponentId: fracComp.component.id, discountPercentage: '0.00' },
        ],
      },
      adminActor as any,
    );

    const adm2Header = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admission2.id, isActive: true },
    });
    const adm2DetailOptional = await db.feePaymentDetails.findFirstOrThrow({
      where: { feePaymentHeaderId: adm2Header.id, feeComponentId: optionalCompId },
    });
    assert.equal(adm2DetailOptional.isIncluded, false, 'Initial optional detail has isIncluded: false');
    assert.equal(adm2DetailOptional.isActive, true, 'Initial optional detail has isActive: true');

    // Update master component from optional to mandatory
    const optToMandResult = await feeStructureSyncService.updateComponentWithSyncPlan(
      optionalCompId,
      { isMandatory: true },
      adminUserId,
    );

    const adm2PlanT7 = optToMandResult.plan.admissions.find((a) => a.admissionId === admission2.id)!;
    assert.ok(adm2PlanT7, 'Admission 2 present in sync plan');
    assert.equal(adm2PlanT7.grossAdmissionDelta.toFixed(2), '0.00', 'Gross admission delta is 0.00');

    const adm2DeltaT7 = adm2PlanT7.componentDeltas.find((d) => d.feeComponentId === optionalCompId)!;
    assert.equal(adm2DeltaT7.isActive, true, 'Metadata isActive is true');
    assert.equal(adm2DeltaT7.isIncluded, false, 'Metadata isIncluded is false');
    assert.equal(adm2DeltaT7.previousIsMandatory, false, 'Metadata previousIsMandatory is false');
    assert.equal(adm2DeltaT7.proposedIsMandatory, true, 'Metadata proposedIsMandatory is true');
    assert.equal(adm2DeltaT7.grossDeltaAmount.toFixed(2), '0.00', 'Component gross delta is 0.00');

    // DB Verification: Admission detail and header strictly unmodified
    const adm2DetailAfterT7 = await db.feePaymentDetails.findUniqueOrThrow({ where: { id: adm2DetailOptional.id } });
    assert.equal(adm2DetailAfterT7.isIncluded, false, 'DB detail still has isIncluded: false');
    const adm2HeaderAfterT7 = await db.feePaymentHeader.findUniqueOrThrow({ where: { id: adm2Header.id } });
    assert.equal(adm2HeaderAfterT7.netAmount.toString(), adm2Header.netAmount.toString(), 'Header netAmount unmodified');
    console.log('✓ Test 7 passed: Optional->Mandatory preserves isIncluded: false with gross delta 0.00, zero mutation.');

    // -------------------------------------------------------------------------
    // TEST 8: Stage 3.1 Excluded Component Amount Increase (Zero Delta)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Active but Excluded Component Amount Increase ---');
    const updateExcludedResult = await feeStructureSyncService.updateComponentWithSyncPlan(
      optionalCompId,
      { amount: '2000.00' },
      adminUserId,
    );

    const adm2PlanT8 = updateExcludedResult.plan.admissions.find((a) => a.admissionId === admission2.id)!;
    assert.equal(adm2PlanT8.grossAdmissionDelta.toFixed(2), '0.00', 'Gross admission delta remains 0.00');

    const adm2DeltaT8 = adm2PlanT8.componentDeltas.find((d) => d.feeComponentId === optionalCompId)!;
    assert.equal(adm2DeltaT8.changeType, ComponentChangeType.AMOUNT_INCREASED);
    assert.equal(adm2DeltaT8.grossDeltaAmount.toFixed(2), '0.00', 'Gross component delta is 0.00 for excluded detail');
    assert.equal(adm2DeltaT8.isIncluded, false);
    assert.equal(adm2DeltaT8.isActive, true);
    console.log('✓ Test 8 passed: Amount increase on excluded component yields grossDelta 0.00.');

    // -------------------------------------------------------------------------
    // TEST 9: Stage 3.1 Excluded Component Deactivation (Zero Delta)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Active but Excluded Component Deactivation ---');
    const deactExcludedResult = await feeStructureSyncService.deactivateComponentWithSyncPlan(
      optionalCompId,
      adminUserId,
    );

    const adm2PlanT9 = deactExcludedResult.plan.admissions.find((a) => a.admissionId === admission2.id)!;
    assert.equal(adm2PlanT9.grossAdmissionDelta.toFixed(2), '0.00', 'Gross admission delta is 0.00 on deactivation of excluded component');

    const adm2DeltaT9 = adm2PlanT9.componentDeltas.find((d) => d.feeComponentId === optionalCompId)!;
    assert.equal(adm2DeltaT9.changeType, ComponentChangeType.COMPONENT_DEACTIVATED);
    assert.equal(adm2DeltaT9.grossDeltaAmount.toFixed(2), '0.00', 'Component gross delta is 0.00 on deactivation of excluded detail');
    assert.equal(adm2DeltaT9.isIncluded, false);
    console.log('✓ Test 9 passed: Deactivation of excluded component yields grossDelta 0.00.');

    // -------------------------------------------------------------------------
    // TEST 10: Inactive Detail Zero Obligation Delta
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Inactive Detail Zero Obligation Delta ---');
    // Create a new component to test update on inactive detail
    const inactiveTestComp = await feeStructureSyncService.createComponentWithSyncPlan(
      {
        feeStructureId: feeStructure.id,
        name: `Inactive Test Comp ${runId}`,
        amount: '500.00',
        isMandatory: false,
      },
      adminUserId,
    );

    const admission3 = await admissionService.create(
      {
        schoolId,
        academicYearId: academicYear.id,
        programId: program.id,
        classId: klass.id,
        sectionId: section.id,
        studentName: `Student InactiveTest ${runId}`,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2018-03-10'),
        parentName: 'Parent InactiveTest',
        parentRelation: Relation.MOTHER,
        parentPhone: '9876543212',
        addressLine1: '789 QA Lane',
        city: 'Metropolis',
        state: 'State',
        postalCode: '500001',
        country: 'India',
        createdById: adminUserId,
        selectedFeeComponentIds: [createResult.component.id, fracComp.component.id, inactiveTestComp.component.id],
        components: [
          { feeComponentId: createResult.component.id, discountPercentage: '0.00' },
          { feeComponentId: fracComp.component.id, discountPercentage: '0.00' },
          { feeComponentId: inactiveTestComp.component.id, discountPercentage: '0.00' },
        ],
      },
      adminActor as any,
    );

    const adm3Header = await db.feePaymentHeader.findFirstOrThrow({
      where: { admissionId: admission3.id, isActive: true },
    });

    // Update admission3's detail for inactiveTestComp to isActive: false
    await db.feePaymentDetails.updateMany({
      where: { feePaymentHeaderId: adm3Header.id, feeComponentId: inactiveTestComp.component.id },
      data: { isActive: false },
    });

    const updateInactiveResult = await feeStructureSyncService.updateComponentWithSyncPlan(
      inactiveTestComp.component.id,
      { amount: '750.00' },
      adminUserId,
    );

    const adm3PlanT10 = updateInactiveResult.plan.admissions.find((a) => a.admissionId === admission3.id)!;
    assert.equal(adm3PlanT10.grossAdmissionDelta.toFixed(2), '0.00', 'Gross admission delta is 0.00 for inactive detail');

    const adm3DeltaT10 = adm3PlanT10.componentDeltas.find((d) => d.feeComponentId === inactiveTestComp.component.id)!;
    assert.equal(adm3DeltaT10.isActive, false);
    assert.equal(adm3DeltaT10.isIncluded, true);
    assert.equal(adm3DeltaT10.grossDeltaAmount.toFixed(2), '0.00');
    console.log('✓ Test 10 passed: Inactive detail (isActive: false, isIncluded: true) yields grossDelta 0.00.');

    console.log('\n================================================================');
    console.log('ALL STAGE 3 INTEGRATION SCENARIOS PASSED SUCCESSFULLY');
    console.log('================================================================\n');
  } finally {
    console.log('Initiating test teardown and cleanup...');
    try {
      // Guaranteed clean up in reverse dependency order
      await db.feePaymentDetailAttribution.deleteMany({
        where: { feePayment: { admission: { schoolId } } },
      });
      await db.feePayment.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.admissionInstallment.deleteMany({
        where: { schedule: { feePaymentHeader: { admission: { schoolId } } } },
      });
      await db.admissionInstallmentSchedule.deleteMany({
        where: { feePaymentHeader: { admission: { schoolId } } },
      });
      await db.feePaymentDetails.deleteMany({
        where: { feePaymentHeader: { admission: { schoolId } } },
      });
      await db.feePaymentHeader.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.admissionFeeConcession.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.student.deleteMany({
        where: { admission: { schoolId } },
      });
      await db.admission.deleteMany({
        where: { schoolId },
      });
      await db.feeComponent.deleteMany({
        where: { feeStructure: { academicYear: { schoolId } } },
      });
      await db.feeStructure.deleteMany({
        where: { academicYear: { schoolId } },
      });
      await db.section.deleteMany({
        where: { class: { program: { academicYear: { schoolId } } } },
      });
      await db.class.deleteMany({
        where: { program: { academicYear: { schoolId } } },
      });
      await db.program.deleteMany({
        where: { academicYear: { schoolId } },
      });
      await db.academicYear.deleteMany({
        where: { schoolId },
      });
      await db.userRole.deleteMany({
        where: { user: { schoolId } },
      });
      await db.user.deleteMany({
        where: { schoolId },
      });
      await db.school.deleteMany({
        where: { id: schoolId },
      });

      const remainingAdmissions = await db.admission.count({ where: { schoolId } });
      const remainingHeaders = await db.feePaymentHeader.count({ where: { admission: { schoolId } } });
      const remainingComponents = await db.feeComponent.count({ where: { name: { contains: runId } } });
      assert.equal(remainingAdmissions, 0, 'Zero admissions residue');
      assert.equal(remainingHeaders, 0, 'Zero headers residue');
      assert.equal(remainingComponents, 0, 'Zero components residue');
      console.log('✓ Teardown complete. Zero residue verified.');
    } catch (cleanupErr: any) {
      console.warn(`[Teardown Warning] ${cleanupErr?.message}`);
    } finally {
      await db.$disconnect();
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  });
