import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { SchoolsService } from '../src/schools/schools.service.js';
import { FeeManagementService } from '../src/fee-management/fee-management.service.js';
import { AdmissionStatus, Gender, DayOfWeek } from '../generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;

function checkQaTarget() {
  assert.ok(databaseUrl, 'DATABASE_URL must be set for the QA harness');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/ryo_qa');
}

async function expectError(action: () => Promise<unknown>, expectedSubstring?: string) {
  try {
    await action();
    assert.fail('Expected action to fail but it succeeded');
  } catch (error: any) {
    if (expectedSubstring) {
      const message = error?.message || String(error);
      assert.ok(
        message.includes(expectedSubstring),
        `Expected error message to include "${expectedSubstring}", got "${message}"`,
      );
    }
  }
}

async function main() {
  checkQaTarget();
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();
  await assertQaDatabase(db);

  const schoolsService = new SchoolsService(db);
  const feeManagementService = new FeeManagementService(db, schoolsService);

  const created = {
    admissions: [] as string[],
    sections: [] as string[],
    classes: [] as string[],
    programs: [] as string[],
    years: [] as string[],
    users: [] as string[],
    schools: [] as string[],
  };

  const cleanup = async () => {
    try {
      if (created.schools.length > 0) {
        await db.school.updateMany({
          where: { id: { in: created.schools } },
          data: { activeAcademicYearId: null },
        });
      }
      if (created.admissions.length > 0) {
        await db.admission.deleteMany({ where: { id: { in: created.admissions } } });
      }
      if (created.sections.length > 0) {
        await db.section.deleteMany({ where: { id: { in: created.sections } } });
      }
      if (created.classes.length > 0) {
        await db.class.deleteMany({ where: { id: { in: created.classes } } });
      }
      if (created.programs.length > 0) {
        await db.program.deleteMany({ where: { id: { in: created.programs } } });
      }
      if (created.years.length > 0) {
        await db.academicYear.deleteMany({ where: { id: { in: created.years } } });
      }
      if (created.users.length > 0) {
        await db.user.deleteMany({ where: { id: { in: created.users } } });
      }
      if (created.schools.length > 0) {
        await db.school.deleteMany({ where: { id: { in: created.schools } } });
      }
    } catch (cleanupErr) {
      console.warn('[QA Teardown] Warning during fixture cleanup:', cleanupErr);
    }
  };

  try {
    console.log('[QA Integration] Creating test schools, years, hierarchy, users, and admissions...');
    const ts = Date.now();

    // 1. Setup School A and School B
    const schoolA = await db.school.create({
      data: { name: 'QA Fee School A', schoolCode: `QA-FEE-A-${ts}` },
    });
    const schoolB = await db.school.create({
      data: { name: 'QA Fee School B', schoolCode: `QA-FEE-B-${ts}` },
    });
    created.schools.push(schoolA.id, schoolB.id);

    // 2. Setup Academic Years
    const yearA1 = await db.academicYear.create({
      data: {
        name: `AY 2026-27 A1-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const yearA2 = await db.academicYear.create({
      data: {
        name: `AY 2027-28 A2-${ts}`,
        startDate: new Date('2027-06-01'),
        endDate: new Date('2028-05-31'),
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const yearB = await db.academicYear.create({
      data: {
        name: `AY 2026-27 B-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolB.id,
        isActive: true,
      },
    });
    created.years.push(yearA1.id, yearA2.id, yearB.id);

    // Configure School A with yearA1
    await schoolsService.updateConfiguration(schoolA.id, { activeAcademicYearId: yearA1.id });

    // 3. Setup Programs, Classes, Sections for School A
    const progA1 = await db.program.create({
      data: {
        name: `Science-${ts}`,
        academicYearId: yearA1.id,
        startTime: '09:00',
        endTime: '16:00',
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
      },
    });
    const progA2 = await db.program.create({
      data: {
        name: `Commerce-${ts}`,
        academicYearId: yearA1.id,
        startTime: '09:00',
        endTime: '16:00',
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
      },
    });
    const progB = await db.program.create({
      data: {
        name: `Science-B-${ts}`,
        academicYearId: yearB.id,
        startTime: '09:00',
        endTime: '16:00',
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
      },
    });
    created.programs.push(progA1.id, progA2.id, progB.id);

    const classA1 = await db.class.create({
      data: { name: `Grade 11-${ts}`, programId: progA1.id },
    });
    const classA2 = await db.class.create({
      data: { name: `Grade 12-${ts}`, programId: progA2.id },
    });
    const classB = await db.class.create({
      data: { name: `Grade 11-B-${ts}`, programId: progB.id },
    });
    created.classes.push(classA1.id, classA2.id, classB.id);

    const secA1 = await db.section.create({
      data: { name: `Sec A-${ts}`, classId: classA1.id },
    });
    const secA2 = await db.section.create({
      data: { name: `Sec B-${ts}`, classId: classA2.id },
    });
    const secB = await db.section.create({
      data: { name: `Sec A-B-${ts}`, classId: classB.id },
    });
    created.sections.push(secA1.id, secA2.id, secB.id);

    // 4. Setup Users for School A and School B
    const actorUserA = await db.user.create({
      data: {
        email: `qa-actor-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Active',
        lastName: 'AdminA',
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const inactiveUserA = await db.user.create({
      data: {
        email: `qa-inactive-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Inactive',
        lastName: 'UserA',
        schoolId: schoolA.id,
        isActive: false,
      },
    });
    const deletedUserA = await db.user.create({
      data: {
        email: `qa-deleted-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Deleted',
        lastName: 'UserA',
        schoolId: schoolA.id,
        isActive: true,
        deletedAt: new Date(),
      },
    });
    const orphanUser = await db.user.create({
      data: {
        email: `qa-orphan-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Orphan',
        lastName: 'User',
        schoolId: null,
        isActive: true,
      },
    });
    const actorUserB = await db.user.create({
      data: {
        email: `qa-actor-b-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Active',
        lastName: 'AdminB',
        schoolId: schoolB.id,
        isActive: true,
      },
    });
    created.users.push(actorUserA.id, inactiveUserA.id, deletedUserA.id, orphanUser.id, actorUserB.id);

    // 5. Setup Admissions for School A
    // Confirmed Admission 1 (Grade 11, Science) - created 10 mins ago
    const admConfirmed1 = await db.admission.create({
      data: {
        admissionNumber: `ADM-A1-${ts}`,
        admissionSequence: 1,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Alice Smith',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2009-01-15'),
        createdById: actorUserA.id,
        createdAt: new Date(Date.now() - 600_000),
      },
    });
    // Confirmed Admission 2 (Grade 11, Science) - created 5 mins ago
    const admConfirmed2 = await db.admission.create({
      data: {
        admissionNumber: `ADM-A2-${ts}`,
        admissionSequence: 2,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Bob Johnson',
        gender: Gender.MALE,
        dateOfBirth: new Date('2009-03-20'),
        createdById: actorUserA.id,
        createdAt: new Date(Date.now() - 300_000),
      },
    });
    // Confirmed Admission 3 (Grade 12, Commerce) - created now
    const admConfirmed3 = await db.admission.create({
      data: {
        admissionNumber: `ADM-A3-${ts}`,
        admissionSequence: 3,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA2.id,
        classId: classA2.id,
        sectionId: secA2.id,
        studentName: 'Charlie Brown',
        gender: Gender.MALE,
        dateOfBirth: new Date('2008-05-10'),
        createdById: actorUserA.id,
        createdAt: new Date(),
      },
    });

    // Draft Admission (must be excluded)
    const admDraft = await db.admission.create({
      data: {
        admissionNumber: `ADM-DRAFT-${ts}`,
        admissionSequence: 4,
        admissionStatus: AdmissionStatus.DRAFT,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Draft Student',
        gender: Gender.MALE,
        dateOfBirth: new Date('2009-07-01'),
        createdById: actorUserA.id,
      },
    });
    // Cancelled Admission (must be excluded)
    const admCancelled = await db.admission.create({
      data: {
        admissionNumber: `ADM-CANCELLED-${ts}`,
        admissionSequence: 5,
        admissionStatus: AdmissionStatus.CANCELLED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Cancelled Student',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2009-08-01'),
        createdById: actorUserA.id,
      },
    });
    // Inactive Admission (must be excluded)
    const admInactive = await db.admission.create({
      data: {
        admissionNumber: `ADM-INACTIVE-${ts}`,
        admissionSequence: 6,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Inactive Student',
        gender: Gender.MALE,
        dateOfBirth: new Date('2009-09-01'),
        createdById: actorUserA.id,
        isActive: false,
      },
    });
    // Soft-deleted Admission (must be excluded)
    const admDeleted = await db.admission.create({
      data: {
        admissionNumber: `ADM-DELETED-${ts}`,
        admissionSequence: 7,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Deleted Student',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2009-10-01'),
        createdById: actorUserA.id,
        deletedAt: new Date(),
      },
    });

    // Confirmed Admission for School B (must NEVER appear in School A's results)
    const admSchoolB = await db.admission.create({
      data: {
        admissionNumber: `ADM-B1-${ts}`,
        admissionSequence: 1,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolB.id,
        academicYearId: yearB.id,
        programId: progB.id,
        classId: classB.id,
        sectionId: secB.id,
        studentName: 'Foreign Student',
        gender: Gender.MALE,
        dateOfBirth: new Date('2009-11-01'),
        createdById: actorUserB.id,
      },
    });

    created.admissions.push(
      admConfirmed1.id,
      admConfirmed2.id,
      admConfirmed3.id,
      admDraft.id,
      admCancelled.id,
      admInactive.id,
      admDeleted.id,
      admSchoolB.id,
    );

    // =========================================================
    // Test Section A: Canonical Tenant Resolution & Rejections
    // =========================================================
    console.log('[QA Integration] Verifying canonical tenant isolation and actor checks...');
    await expectError(
      () => feeManagementService.getDashboard(inactiveUserA.id, { page: 1, pageSize: 25 }),
      'User is inactive or deleted',
    );
    await expectError(
      () => feeManagementService.getDashboard(deletedUserA.id, { page: 1, pageSize: 25 }),
      'User is inactive or deleted',
    );
    await expectError(
      () => feeManagementService.getDashboard(orphanUser.id, { page: 1, pageSize: 25 }),
      'A school-scoped user is required',
    );

    // =========================================================
    // Test Section B: Unconfigured & Invalid Configuration Behavior
    // =========================================================
    console.log('[QA Integration] Verifying unconfigured and invalid configuration handling...');
    // School B currently has no activeAcademicYearId configured
    const schoolBConfig = await feeManagementService.getDashboard(actorUserB.id, {
      page: 1,
      pageSize: 25,
    });
    assert.equal(schoolBConfig.configured, false, 'Unconfigured school returns configured: false');
    assert.equal(
      schoolBConfig.invalidConfiguration,
      false,
      'Unconfigured school returns invalidConfiguration: false',
    );
    assert.equal(schoolBConfig.activeAcademicYear, null);
    assert.equal(schoolBConfig.data.length, 0);
    assert.equal(schoolBConfig.total, 0);
    assert.equal(schoolBConfig.totalPages, 0);

    // =========================================================
    // Test Section C: Confirmed Admissions Query & Isolation
    // =========================================================
    console.log('[QA Integration] Verifying confirmed admissions query and cross-school exclusion...');
    const schoolADash = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
    });
    assert.equal(schoolADash.configured, true, 'Configured school returns configured: true');
    assert.equal(schoolADash.invalidConfiguration, false);
    assert.equal(schoolADash.activeAcademicYear?.id, yearA1.id);
    assert.equal(schoolADash.total, 3, 'Must match exactly the 3 confirmed active admissions');
    assert.equal(schoolADash.totalPages, 1);
    assert.equal(schoolADash.data.length, 3);

    // Check that excluded admissions are not present
    const returnedIds = schoolADash.data.map((r: any) => r.id);
    assert.ok(returnedIds.includes(admConfirmed1.id));
    assert.ok(returnedIds.includes(admConfirmed2.id));
    assert.ok(returnedIds.includes(admConfirmed3.id));
    assert.ok(!returnedIds.includes(admDraft.id), 'Draft admission excluded');
    assert.ok(!returnedIds.includes(admCancelled.id), 'Cancelled admission excluded');
    assert.ok(!returnedIds.includes(admInactive.id), 'Inactive admission excluded');
    assert.ok(!returnedIds.includes(admDeleted.id), 'Soft-deleted admission excluded');
    assert.ok(!returnedIds.includes(admSchoolB.id), 'Foreign School B admission excluded');

    // Deterministic order: createdAt DESC -> admConfirmed3 (newest), admConfirmed2, admConfirmed1 (oldest)
    assert.equal(schoolADash.data[0].id, admConfirmed3.id, 'Newest admission first');
    assert.equal(schoolADash.data[1].id, admConfirmed2.id, 'Second newest admission second');
    assert.equal(schoolADash.data[2].id, admConfirmed1.id, 'Oldest admission third');

    // DATA-MIN-01: Verify explicit projection excludes sensitive PII and unneeded scalar fields
    console.log('[QA Integration] Verifying DATA-MIN-01 PII minimization...');
    const sampleRecord = schoolADash.data[0] as any;
    assert.ok(sampleRecord.id, 'id is present');
    assert.ok(sampleRecord.admissionNumber, 'admissionNumber is present');
    assert.ok(sampleRecord.studentName, 'studentName is present');
    assert.ok(sampleRecord.program, 'program relation summary is present');
    assert.ok(sampleRecord.class, 'class relation summary is present');
    assert.equal(sampleRecord.parentPhone, undefined, 'parentPhone must be excluded');
    assert.equal(sampleRecord.parentEmail, undefined, 'parentEmail must be excluded');
    assert.equal(sampleRecord.parentName, undefined, 'parentName must be excluded');
    assert.equal(sampleRecord.dateOfBirth, undefined, 'dateOfBirth must be excluded');
    assert.equal(sampleRecord.gender, undefined, 'gender must be excluded');
    assert.equal(sampleRecord.permanentAddress, undefined, 'permanentAddress must be excluded');
    assert.equal(sampleRecord.presentAddress, undefined, 'presentAddress must be excluded');
    assert.equal(sampleRecord.emergencyContactName, undefined, 'emergencyContactName must be excluded');
    assert.equal(sampleRecord.emergencyContactNumber, undefined, 'emergencyContactNumber must be excluded');

    // =========================================================
    // Test Section D: Search and Category Filtering
    // =========================================================
    console.log('[QA Integration] Verifying search, classId, and programId filters...');
    // Search by student name substring
    const searchAlice = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
      search: 'alice',
    });
    assert.equal(searchAlice.total, 1);
    assert.equal(searchAlice.data[0].studentName, 'Alice Smith');

    // Search by admission number substring with whitespace
    const searchNumber = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
      search: `  A2-${ts}  `,
    });
    assert.equal(searchNumber.total, 1);
    assert.equal(searchNumber.data[0].studentName, 'Bob Johnson');

    // Filter by classId
    const filterClass = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
      classId: classA1.id,
    });
    assert.equal(filterClass.total, 2, 'Class A1 has 2 confirmed admissions (Alice and Bob)');

    // Filter by programId
    const filterProg = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
      programId: progA2.id,
    });
    assert.equal(filterProg.total, 1, 'Program A2 has 1 confirmed admission (Charlie)');
    assert.equal(filterProg.data[0].studentName, 'Charlie Brown');

    // Cross-school class filter must return safely 0 results
    const filterForeignClass = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
      classId: classB.id,
    });
    assert.equal(filterForeignClass.total, 0, 'Foreign classId yields safe 0 results');
    assert.equal(filterForeignClass.data.length, 0);

    // =========================================================
    // Test Section E: Pagination & Tie-Breaking
    // =========================================================
    console.log('[QA Integration] Verifying server-side pagination and tie-breaking...');
    // Page 1 with pageSize 2 -> should return 2 records, total 3, totalPages 2
    const page1 = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 2,
    });
    assert.equal(page1.data.length, 2);
    assert.equal(page1.page, 1);
    assert.equal(page1.pageSize, 2);
    assert.equal(page1.total, 3);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.data[0].id, admConfirmed3.id);
    assert.equal(page1.data[1].id, admConfirmed2.id);

    // Page 2 with pageSize 2 -> should return 1 record
    const page2 = await feeManagementService.getDashboard(actorUserA.id, {
      page: 2,
      pageSize: 2,
    });
    assert.equal(page2.data.length, 1);
    assert.equal(page2.page, 2);
    assert.equal(page2.total, 3);
    assert.equal(page2.totalPages, 2);
    assert.equal(page2.data[0].id, admConfirmed1.id);

    // Page beyond total (page 3)
    const page3 = await feeManagementService.getDashboard(actorUserA.id, {
      page: 3,
      pageSize: 2,
    });
    assert.equal(page3.data.length, 0);
    assert.equal(page3.total, 3);
    assert.equal(page3.totalPages, 2);

    // Deterministic tie-breaker: create 2 admissions with identical createdAt
    const identicalTime = new Date('2026-08-01T10:00:00.000Z');
    const tieAdm1 = await db.admission.create({
      data: {
        id: `adm-tie-a-${ts}`,
        admissionNumber: `ADM-TIE-A-${ts}`,
        admissionSequence: 10,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Tie Student Alpha',
        gender: Gender.MALE,
        dateOfBirth: new Date('2009-01-01'),
        createdById: actorUserA.id,
        createdAt: identicalTime,
      },
    });
    const tieAdm2 = await db.admission.create({
      data: {
        id: `adm-tie-b-${ts}`,
        admissionNumber: `ADM-TIE-B-${ts}`,
        admissionSequence: 11,
        admissionStatus: AdmissionStatus.CONFIRMED,
        schoolId: schoolA.id,
        academicYearId: yearA1.id,
        programId: progA1.id,
        classId: classA1.id,
        sectionId: secA1.id,
        studentName: 'Tie Student Beta',
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2009-02-01'),
        createdById: actorUserA.id,
        createdAt: identicalTime,
      },
    });
    created.admissions.push(tieAdm1.id, tieAdm2.id);

    const tieSearch = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 10,
      search: 'Tie Student',
    });
    assert.equal(tieSearch.data.length, 2);
    // Order: identical createdAt, then id ASC -> adm-tie-a precedes adm-tie-b
    assert.equal(tieSearch.data[0].id, tieAdm1.id);
    assert.equal(tieSearch.data[1].id, tieAdm2.id);

    // =========================================================
    // Test Section F: Downstream Academic Year Invalidation & No Fallback
    // =========================================================
    console.log('[QA Integration] Verifying downstream invalidation and strict no-fallback...');
    // Soft-delete yearA1 which is configured in School A
    await db.academicYear.update({
      where: { id: yearA1.id },
      data: { deletedAt: new Date() },
    });

    const invalidatedDash = await feeManagementService.getDashboard(actorUserA.id, {
      page: 1,
      pageSize: 25,
    });
    assert.equal(invalidatedDash.configured, false, 'Invalidated year causes configured: false');
    assert.equal(invalidatedDash.invalidConfiguration, true, 'invalidConfiguration set to true');
    assert.equal(invalidatedDash.activeAcademicYear, null);
    assert.equal(invalidatedDash.data.length, 0);
    assert.equal(invalidatedDash.total, 0);
    assert.equal(invalidatedDash.totalPages, 0);
    // Ensure it did NOT fall back to yearA2 (which exists, is active, and is newer)
    assert.notEqual(invalidatedDash.activeAcademicYear?.id, yearA2.id);

    // =========================================================
    // Test Section G: Financial Immutability Assertion
    // =========================================================
    console.log('[QA Integration] Verifying financial immutability...');
    const feePaymentCount = await db.feePayment.count({ where: { schoolId: schoolA.id } });
    const feePaymentHeaderCount = await db.feePaymentHeader.count({
      where: { admission: { schoolId: schoolA.id } },
    });
    const financialLogCount = await db.financialLog.count({ where: { schoolId: schoolA.id } });
    assert.equal(feePaymentCount, 0, 'Zero fee payments created');
    assert.equal(feePaymentHeaderCount, 0, 'Zero fee payment headers created');
    assert.equal(financialLogCount, 0, 'Zero financial logs created');

    console.log('✅ All integration test assertions passed successfully!');
  } finally {
    console.log('[QA Integration] Cleaning up test fixtures...');
    await cleanup();
    await db.$disconnect();
  }
}

main()
  .then(() => {
    console.log('PASS test/fee-management-dashboard.integration.ts');
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAIL test/fee-management-dashboard.integration.ts:', err);
    process.exit(1);
  });
