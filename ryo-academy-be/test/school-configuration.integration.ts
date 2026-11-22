import assert from 'node:assert/strict';
import { assertQaDatabase } from '../src/test/assert-qa-database.js';
import { DatabaseService } from '../src/database/database.service.js';
import { SchoolsService } from '../src/schools/schools.service.js';
import { PERMISSIONS } from '../src/auth/permissions/permission.constants.js';

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

  const created = {
    schools: [] as string[],
    users: [] as string[],
    years: [] as string[],
  };

  const cleanup = async () => {
    try {
      // First null out activeAcademicYearId on schools to avoid delete constraints
      if (created.schools.length > 0) {
        await db.school.updateMany({
          where: { id: { in: created.schools } },
          data: { activeAcademicYearId: null },
        });
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
    console.log('[QA Integration] Creating test schools and users...');
    const ts = Date.now();

    // 1. Setup School A and School B
    const schoolA = await db.school.create({
      data: { name: 'QA Config School A', schoolCode: `QA-CFG-A-${ts}` },
    });
    const schoolB = await db.school.create({
      data: { name: 'QA Config School B', schoolCode: `QA-CFG-B-${ts}` },
    });
    created.schools.push(schoolA.id, schoolB.id);

    // 2. Setup Academic Years for School A and School B
    const yearA1 = await db.academicYear.create({
      data: {
        name: `2026-27 A1-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const yearA2 = await db.academicYear.create({
      data: {
        name: `2027-28 A2-${ts}`,
        startDate: new Date('2027-06-01'),
        endDate: new Date('2028-05-31'),
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const yearB = await db.academicYear.create({
      data: {
        name: `2026-27 B-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolB.id,
        isActive: true,
      },
    });
    created.years.push(yearA1.id, yearA2.id, yearB.id);

    // 3. Setup Users for School A
    const activeUserA = await db.user.create({
      data: {
        email: `qa-actor-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Active',
        lastName: 'Admin',
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    const inactiveUserA = await db.user.create({
      data: {
        email: `qa-inactive-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Inactive',
        lastName: 'User',
        schoolId: schoolA.id,
        isActive: false,
      },
    });
    const deletedUserA = await db.user.create({
      data: {
        email: `qa-deleted-a-${ts}@example.test`,
        passwordHash: 'hash',
        firstName: 'Deleted',
        lastName: 'User',
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
    created.users.push(activeUserA.id, inactiveUserA.id, deletedUserA.id, orphanUser.id);

    // =========================================================
    // Test Section A: Canonical Tenant Resolution
    // =========================================================
    console.log('[QA Integration] Verifying canonical tenant resolution...');
    const resolvedSchoolId = await schoolsService.resolveActiveSchool(activeUserA.id);
    assert.equal(resolvedSchoolId, schoolA.id, 'Active user resolves correct schoolId');

    await expectError(
      () => schoolsService.resolveActiveSchool(inactiveUserA.id),
      'User is inactive or deleted',
    );
    await expectError(
      () => schoolsService.resolveActiveSchool(deletedUserA.id),
      'User is inactive or deleted',
    );
    await expectError(
      () => schoolsService.resolveActiveSchool(orphanUser.id),
      'A school-scoped user is required',
    );

    // =========================================================
    // Test Section B: Initial Unconfigured State
    // =========================================================
    console.log('[QA Integration] Verifying initial unconfigured state...');
    const initialConfig = await schoolsService.getConfiguration(schoolA.id);
    assert.equal(initialConfig.isConfigured, false, 'Initial state isConfigured must be false');
    assert.equal(initialConfig.isInvalid, false, 'Initial state isInvalid must be false');
    assert.equal(initialConfig.activeAcademicYearId, null, 'activeAcademicYearId must be null');
    assert.equal(initialConfig.activeAcademicYear, null, 'activeAcademicYear must be null');

    // =========================================================
    // Test Section C: Valid Configuration Update
    // =========================================================
    console.log('[QA Integration] Verifying valid configuration update...');
    const updatedConfig = await schoolsService.updateConfiguration(schoolA.id, {
      activeAcademicYearId: yearA1.id,
    });
    assert.equal(updatedConfig.isConfigured, true, 'isConfigured must be true after update');
    assert.equal(updatedConfig.isInvalid, false, 'isInvalid must be false after update');
    assert.equal(updatedConfig.activeAcademicYearId, yearA1.id);
    assert.equal(updatedConfig.activeAcademicYear?.id, yearA1.id);
    assert.equal(updatedConfig.activeAcademicYear?.name, yearA1.name);

    // Verify DB state directly
    const dbSchool = await db.school.findUnique({
      where: { id: schoolA.id },
      select: { activeAcademicYearId: true },
    });
    assert.equal(dbSchool?.activeAcademicYearId, yearA1.id, 'DB column updated accurately');

    // =========================================================
    // Test Section D: Cross-School Rejection Invariant
    // =========================================================
    console.log('[QA Integration] Verifying cross-school rejection invariant...');
    await expectError(
      () => schoolsService.updateConfiguration(schoolA.id, { activeAcademicYearId: yearB.id }),
      'Academic year does not belong to this school',
    );
    // Verify configuration unchanged
    const afterFailedCross = await schoolsService.getConfiguration(schoolA.id);
    assert.equal(
      afterFailedCross.activeAcademicYearId,
      yearA1.id,
      'School A activeAcademicYearId preserved after cross-school attempt',
    );

    // =========================================================
    // Test Section E: Soft-Deleted & Inactive Academic Year Rejection
    // =========================================================
    console.log('[QA Integration] Verifying soft-deleted and inactive academic year rejection...');
    const softDeletedYear = await db.academicYear.create({
      data: {
        name: `SoftDeleted-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolA.id,
        isActive: true,
        deletedAt: new Date(),
      },
    });
    created.years.push(softDeletedYear.id);

    await expectError(
      () =>
        schoolsService.updateConfiguration(schoolA.id, {
          activeAcademicYearId: softDeletedYear.id,
        }),
      'Cannot configure a soft-deleted or inactive academic year',
    );

    const inactiveYear = await db.academicYear.create({
      data: {
        name: `Inactive-${ts}`,
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        schoolId: schoolA.id,
        isActive: false,
      },
    });
    created.years.push(inactiveYear.id);

    await expectError(
      () =>
        schoolsService.updateConfiguration(schoolA.id, {
          activeAcademicYearId: inactiveYear.id,
        }),
      'Cannot configure a soft-deleted or inactive academic year',
    );

    // =========================================================
    // Test Section F: Downstream Invalidation on Soft-Delete
    // =========================================================
    console.log('[QA Integration] Verifying downstream invalidation when configured year is soft-deleted...');
    // Soft-delete yearA1 which is currently configured
    await db.academicYear.update({
      where: { id: yearA1.id },
      data: { deletedAt: new Date() },
    });

    const invalidatedConfig = await schoolsService.getConfiguration(schoolA.id);
    assert.equal(invalidatedConfig.isConfigured, false, 'isConfigured drops to false');
    assert.equal(invalidatedConfig.isInvalid, true, 'isInvalid is marked true');
    assert.equal(invalidatedConfig.activeAcademicYearId, null);
    assert.equal(invalidatedConfig.activeAcademicYear, null);

    // Switch to yearA2
    const reconfigured = await schoolsService.updateConfiguration(schoolA.id, {
      activeAcademicYearId: yearA2.id,
    });
    assert.equal(reconfigured.isConfigured, true);
    assert.equal(reconfigured.isInvalid, false);
    assert.equal(reconfigured.activeAcademicYearId, yearA2.id);

    // =========================================================
    // Test Section G: Hard-Delete Referential Integrity (ON DELETE SET NULL)
    // =========================================================
    console.log('[QA Integration] Verifying ON DELETE SET NULL foreign key action...');
    // Create an ephemeral year specifically for hard-delete verification
    const ephemeralYear = await db.academicYear.create({
      data: {
        name: `Ephemeral-${ts}`,
        startDate: new Date('2028-06-01'),
        endDate: new Date('2029-05-31'),
        schoolId: schoolA.id,
        isActive: true,
      },
    });
    await schoolsService.updateConfiguration(schoolA.id, {
      activeAcademicYearId: ephemeralYear.id,
    });

    // Hard-delete the academic year from DB
    await db.academicYear.delete({
      where: { id: ephemeralYear.id },
    });

    // Verify School was not deleted and activeAcademicYearId became NULL automatically via PostgreSQL
    const schoolAfterHardDelete = await db.school.findUnique({
      where: { id: schoolA.id },
      select: { id: true, activeAcademicYearId: true },
    });
    assert.ok(schoolAfterHardDelete, 'School record must remain present');
    assert.equal(
      schoolAfterHardDelete.activeAcademicYearId,
      null,
      'PostgreSQL ON DELETE SET NULL successfully nullified activeAcademicYearId',
    );

    // =========================================================
    // Test Section H: RBAC Seed Invariants
    // =========================================================
    console.log('[QA Integration] Verifying RBAC permission constants and seed rules...');
    assert.equal(
      PERMISSIONS.SCHOOL_UPDATE,
      'school:update',
      'PERMISSIONS.SCHOOL_UPDATE is school:update',
    );

    console.log('✅ All integration test assertions passed successfully!');
  } finally {
    console.log('[QA Integration] Cleaning up test fixtures...');
    await cleanup();
    await db.$disconnect();
  }
}

main()
  .then(() => {
    console.log('PASS test/school-configuration.integration.ts');
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAIL test/school-configuration.integration.ts:', err);
    process.exit(1);
  });
