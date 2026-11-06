import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../src/database/database.service.js';
import { InstallmentTemplateService } from '../src/admission/installment/installment-template.service.js';
import { ScheduleCalculatorService } from '../src/admission/installment/schedule-calculator.service.js';
import { InstallmentTemplateController } from '../src/admission/installment/installment-template.controller.js';
import { PermissionsGuard } from '../src/auth/permissions.guard.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import { InstallmentCalculationType } from '../generated/prisma/enums.js';
import { PERMISSIONS } from '../src/auth/permissions/permission.constants.js';

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'DATABASE_URL is required');
const target = new URL(databaseUrl);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55432');
assert.equal(target.pathname, '/ryo_qa');

function createMockContext(handler: Function, userId: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => InstallmentTemplateController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId, id: userId },
      }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as any;
}

async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any);
  await db.$connect();

  const templateService = new InstallmentTemplateService(db);
  const calculatorService = new ScheduleCalculatorService();
  const controller = new InstallmentTemplateController(templateService, calculatorService);
  const reflector = new Reflector();
  const authzService = new AuthorizationService(db);
  const guard = new PermissionsGuard(reflector, authzService);

  console.log('--- Setting up isolated QA fixtures for Installment Template Management & RBAC ---');

  const schoolAId = 'sch-tpl-a-' + Date.now();
  const schoolBId = 'sch-tpl-b-' + Date.now();
  const collegeAdminAId = 'usr-col-a-' + Date.now();
  const officeAdminAId = 'usr-off-a-' + Date.now();
  const collegeAdminBId = 'usr-col-b-' + Date.now();

  try {
    // 1. Ensure Roles and Permissions exist in DB
    const roleCollege = await db.role.upsert({
      where: { name: 'COLLEGE_ADMIN' },
      update: {},
      create: { name: 'COLLEGE_ADMIN', description: 'College Administrator' },
    });
    const roleOffice = await db.role.upsert({
      where: { name: 'OFFICE_ADMIN' },
      update: {},
      create: { name: 'OFFICE_ADMIN', description: 'Office Administrator' },
    });

    const permCreate = await db.permission.upsert({
      where: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_CREATE },
      update: {},
      create: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_CREATE, description: 'Create installment templates' },
    });
    const permDeact = await db.permission.upsert({
      where: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_DEACTIVATE },
      update: {},
      create: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_DEACTIVATE, description: 'Deactivate installment templates' },
    });
    const permRead = await db.permission.upsert({
      where: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_READ },
      update: {},
      create: { name: PERMISSIONS.INSTALLMENT_TEMPLATE_READ, description: 'Read installment templates' },
    });

    // Link permissions to roles:
    // COLLEGE_ADMIN has CREATE, DEACTIVATE, READ
    // OFFICE_ADMIN has READ only
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleCollege.id, permissionId: permCreate.id } },
      update: {},
      create: { roleId: roleCollege.id, permissionId: permCreate.id },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleCollege.id, permissionId: permDeact.id } },
      update: {},
      create: { roleId: roleCollege.id, permissionId: permDeact.id },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleCollege.id, permissionId: permRead.id } },
      update: {},
      create: { roleId: roleCollege.id, permissionId: permRead.id },
    });

    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleOffice.id, permissionId: permRead.id } },
      update: {},
      create: { roleId: roleOffice.id, permissionId: permRead.id },
    });

    // 2. Provision School A and School B
    await db.school.createMany({
      data: [
        { id: schoolAId, name: 'Template QA School A', schoolCode: 'SCH-TPLA-' + Math.floor(Math.random() * 100000) },
        { id: schoolBId, name: 'Template QA School B', schoolCode: 'SCH-TPLB-' + Math.floor(Math.random() * 100000) },
      ],
    });

    // 3. Provision Users with Role associations
    await db.user.createMany({
      data: [
        {
          id: collegeAdminAId,
          email: `col-a-${Date.now()}@example.com`,
          passwordHash: 'dummy',
          firstName: 'College',
          lastName: 'Admin A',
          schoolId: schoolAId,
        },
        {
          id: officeAdminAId,
          email: `off-a-${Date.now()}@example.com`,
          passwordHash: 'dummy',
          firstName: 'Office',
          lastName: 'Admin A',
          schoolId: schoolAId,
        },
        {
          id: collegeAdminBId,
          email: `col-b-${Date.now()}@example.com`,
          passwordHash: 'dummy',
          firstName: 'College',
          lastName: 'Admin B',
          schoolId: schoolBId,
        },
      ],
    });

    await db.userRole.createMany({
      data: [
        { userId: collegeAdminAId, roleId: roleCollege.id },
        { userId: officeAdminAId, roleId: roleOffice.id },
        { userId: collegeAdminBId, roleId: roleCollege.id },
      ],
    });

    console.log('✓ QA fixtures provisioned with verified RBAC roles and permissions.');

    // ------------------------------------------------------------------------
    // TEST 1: OFFICE_ADMIN cannot create a template — HTTP 403 Forbidden
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: OFFICE_ADMIN Cannot Create Template (HTTP 403) ---');
    let officeCreateForbidden: any = null;
    try {
      const canCreate = await guard.canActivate(createMockContext(controller.create, officeAdminAId));
      if (canCreate) {
        await controller.create(
          {
            name: 'Office Admin Plan',
            calculationType: InstallmentCalculationType.PERCENTAGE,
            installmentCount: 2,
            items: [
              { sequence: 1, label: 'T1', percentage: 50, intervalDaysAfterPrevious: 0 },
              { sequence: 2, label: 'T2', percentage: 50, intervalDaysAfterPrevious: 30 },
            ],
          },
          { user: { userId: officeAdminAId } },
        );
      }
    } catch (e: any) {
      officeCreateForbidden = e;
    }
    assert.ok(officeCreateForbidden instanceof ForbiddenException, 'Must throw ForbiddenException');
    assert.equal(officeCreateForbidden.getStatus(), 403, 'Must return HTTP 403 status code');
    console.log('✓ Test 1 passed: OFFICE_ADMIN create rejected with HTTP 403 Forbidden.');

    // ------------------------------------------------------------------------
    // TEST 2: COLLEGE_ADMIN can create template with intervalDaysAfterPrevious — HTTP 201
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: COLLEGE_ADMIN Creates Valid Template (HTTP 201) ---');
    const canCollegeCreate = await guard.canActivate(createMockContext(controller.create, collegeAdminAId));
    assert.equal(canCollegeCreate, true, 'COLLEGE_ADMIN must be permitted by PermissionsGuard');

    const createdTemplate = await controller.create(
      {
        name: 'Three-Term Standard Plan',
        description: 'Standard 50/30/20 split',
        calculationType: InstallmentCalculationType.PERCENTAGE,
        installmentCount: 3,
        items: [
          { sequence: 1, label: 'Term 1', percentage: 50, intervalDaysAfterPrevious: 0 },
          { sequence: 2, label: 'Term 2', percentage: 30, intervalDaysAfterPrevious: 30 },
          { sequence: 3, label: 'Term 3', percentage: 20, intervalDaysAfterPrevious: 30 },
        ],
      },
      { user: { userId: collegeAdminAId } },
    );

    assert.equal(createdTemplate.schoolId, schoolAId);
    assert.equal(createdTemplate.name, 'Three-Term Standard Plan');
    assert.equal(createdTemplate.items.length, 3);
    assert.equal(createdTemplate.isActive, true);
    assert.equal(createdTemplate.items[0].dueDaysAfterAdmission, 0);
    assert.equal(createdTemplate.items[1].dueDaysAfterAdmission, 30);
    assert.equal(createdTemplate.items[2].dueDaysAfterAdmission, 30);
    console.log('✓ Test 2 passed: COLLEGE_ADMIN created template with intervalDaysAfterPrevious (HTTP 201 Created).');

    // ------------------------------------------------------------------------
    // TEST 3: OFFICE_ADMIN cannot deactivate template — HTTP 403 Forbidden
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: OFFICE_ADMIN Cannot Deactivate Template (HTTP 403) ---');
    let officeDeactForbidden: any = null;
    try {
      const canDeact = await guard.canActivate(createMockContext(controller.deactivate, officeAdminAId));
      if (canDeact) {
        await controller.deactivate(createdTemplate.id, { user: { userId: officeAdminAId } });
      }
    } catch (e: any) {
      officeDeactForbidden = e;
    }
    assert.ok(officeDeactForbidden instanceof ForbiddenException, 'Must throw ForbiddenException');
    assert.equal(officeDeactForbidden.getStatus(), 403, 'Must return HTTP 403 status code');
    console.log('✓ Test 3 passed: OFFICE_ADMIN deactivation rejected with HTTP 403 Forbidden.');

    // ------------------------------------------------------------------------
    // TEST 4: Both COLLEGE_ADMIN and OFFICE_ADMIN can READ templates — HTTP 200
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Template Retrieval Permitted for Both Roles (HTTP 200) ---');
    const canOfficeRead = await guard.canActivate(createMockContext(controller.findById, officeAdminAId));
    assert.equal(canOfficeRead, true, 'OFFICE_ADMIN must hold INSTALLMENT_TEMPLATE_READ');

    const retrievedByOffice = await controller.findById(createdTemplate.id, { user: { userId: officeAdminAId } });
    assert.equal(retrievedByOffice.id, createdTemplate.id);
    assert.equal(retrievedByOffice.items.length, 3);
    console.log('✓ Test 4 passed: OFFICE_ADMIN retrieved template within own school (HTTP 200 OK).');

    // ------------------------------------------------------------------------
    // TEST 5: COLLEGE_ADMIN can deactivate template — HTTP 200 OK
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: COLLEGE_ADMIN Can Deactivate Template (HTTP 200) ---');
    const canCollegeDeact = await guard.canActivate(createMockContext(controller.deactivate, collegeAdminAId));
    assert.equal(canCollegeDeact, true, 'COLLEGE_ADMIN must hold INSTALLMENT_TEMPLATE_DEACTIVATE');

    const deactivated = await controller.deactivate(createdTemplate.id, { user: { userId: collegeAdminAId } });
    assert.equal(deactivated.id, createdTemplate.id);
    assert.equal(deactivated.isActive, false);
    console.log('✓ Test 5 passed: COLLEGE_ADMIN successfully deactivated template (HTTP 200 OK).');

    // ------------------------------------------------------------------------
    // TEST 6: Deactivated template remains retrievable by ID — HTTP 200 OK
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Deactivated Template Remains Retrievable by ID (HTTP 200) ---');
    const retrievedDeactivated = await controller.findById(createdTemplate.id, { user: { userId: officeAdminAId } });
    assert.equal(retrievedDeactivated.id, createdTemplate.id);
    assert.equal(retrievedDeactivated.isActive, false);
    console.log('✓ Test 6 passed: Deactivated template retrieved successfully with isActive = false (HTTP 200 OK).');

    // ------------------------------------------------------------------------
    // TEST 7: Inactive template filtering works correctly
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Inactive Template Filtering (includeInactive) ---');
    // includeInactive = false (default): should return 0 templates
    const activeList = await controller.findAll({ user: { userId: officeAdminAId } }, 'false');
    assert.equal(activeList.length, 0, 'Inactive template must not be returned when includeInactive=false');

    // includeInactive = true: should return 1 template
    const allList = await controller.findAll({ user: { userId: officeAdminAId } }, 'true');
    assert.equal(allList.length, 1, 'Inactive template must be included when includeInactive=true');
    assert.equal(allList[0].id, createdTemplate.id);
    console.log('✓ Test 7 passed: Filtering works correctly (0 active, 1 including inactive).');

    // ------------------------------------------------------------------------
    // TEST 8: Deactivated templates CANNOT be used for new schedule calculations — HTTP 400
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Deactivated Template Rejected in Schedule Calculation (HTTP 400) ---');
    let deactCalcError: any = null;
    try {
      await controller.calculateSchedule(
        {
          netAmount: '100000',
          templateId: createdTemplate.id,
          firstDueDate: '2026-06-15',
        },
        { user: { userId: officeAdminAId } },
      );
    } catch (e: any) {
      deactCalcError = e;
    }
    assert.ok(deactCalcError instanceof BadRequestException, 'Must throw BadRequestException');
    assert.equal(deactCalcError.getStatus(), 400, 'Must return HTTP 400 status code');
    assert.match(deactCalcError.message, /Deactivated installment template cannot be used/i);
    console.log('✓ Test 8 passed: Deactivated template calculation rejected with HTTP 400 BadRequest.');

    // ------------------------------------------------------------------------
    // TEST 9: Cross-School Isolation (Read and Deactivate) — HTTP 404 Not Found
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Cross-School Isolation (HTTP 404) ---');
    // School B admin attempts to read School A template
    let crossSchoolReadError: any = null;
    try {
      await controller.findById(createdTemplate.id, { user: { userId: collegeAdminBId } });
    } catch (e: any) {
      crossSchoolReadError = e;
    }
    assert.ok(crossSchoolReadError instanceof NotFoundException, 'Must throw NotFoundException');
    assert.equal(crossSchoolReadError.getStatus(), 404, 'Must return HTTP 404');
    console.log('✓ Cross-school read rejected with HTTP 404 NotFound.');

    // School B admin attempts to deactivate School A template
    let crossSchoolDeactError: any = null;
    try {
      await controller.deactivate(createdTemplate.id, { user: { userId: collegeAdminBId } });
    } catch (e: any) {
      crossSchoolDeactError = e;
    }
    assert.ok(crossSchoolDeactError instanceof NotFoundException, 'Must throw NotFoundException');
    assert.equal(crossSchoolDeactError.getStatus(), 404, 'Must return HTTP 404');
    console.log('✓ Test 9 passed: Cross-school deactivation rejected with HTTP 404 NotFound.');

    // ------------------------------------------------------------------------
    // TEST 10: Case-Insensitive Duplicate Name within Same School Rejected — HTTP 409
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Case-Insensitive Duplicate Name Rejected (HTTP 409) ---');
    let dupNameError: any = null;
    try {
      await templateService.create(
        {
          name: '  three-term standard plan  ', // Mixed case & surrounding whitespace
          calculationType: InstallmentCalculationType.PERCENTAGE,
          installmentCount: 2,
          items: [
            { sequence: 1, label: 'T1', percentage: 50, intervalDaysAfterPrevious: 0 },
            { sequence: 2, label: 'T2', percentage: 50, intervalDaysAfterPrevious: 30 },
          ],
        },
        collegeAdminAId,
      );
    } catch (e: any) {
      dupNameError = e;
    }
    assert.ok(dupNameError instanceof ConflictException);
    assert.equal(dupNameError.getStatus(), 409);
    assert.match(dupNameError.message, /already exists for this school/i);
    console.log('✓ Test 10 passed: Case-insensitive duplicate name rejected with HTTP 409 Conflict.');

    // ------------------------------------------------------------------------
    // TEST 11: Concurrency Protection (Parallel Duplicate Creation)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 11: Concurrency Protection Under Parallel Creation ---');
    const concurrentPayload = {
      name: 'Concurrent Plan ' + Date.now(),
      calculationType: InstallmentCalculationType.PERCENTAGE,
      installmentCount: 2,
      items: [
        { sequence: 1, label: 'Part 1', percentage: 60, intervalDaysAfterPrevious: 0 },
        { sequence: 2, label: 'Part 2', percentage: 40, intervalDaysAfterPrevious: 30 },
      ],
    };

    const p1 = templateService.create(concurrentPayload, collegeAdminAId);
    const p2 = templateService.create(
      {
        ...concurrentPayload,
        name: concurrentPayload.name.toLowerCase(),
      },
      collegeAdminAId,
    );

    const outcomes = await Promise.allSettled([p1, p2]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent request must succeed');
    assert.equal(rejected.length, 1, 'The competing concurrent request must fail');
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof ConflictException);
    console.log('✓ Test 11 passed: Advisory lock serialized concurrent requests; duplicate rejected with HTTP 409 Conflict.');

    // ------------------------------------------------------------------------
    // TEST 12: Atomic Rollback on Failure
    // ------------------------------------------------------------------------
    console.log('\n--- Test 12: Atomic Rollback on Failure ---');
    let atomicFailureError: any = null;
    try {
      await templateService.create(
        {
          name: 'Faulty Template',
          calculationType: InstallmentCalculationType.PERCENTAGE,
          installmentCount: 2,
          items: [
            { sequence: 1, label: 'Part 1', percentage: 50, intervalDaysAfterPrevious: 0 },
            { sequence: 2, label: 'Part 2', percentage: 40, intervalDaysAfterPrevious: 30 }, // Sum = 90% (fails validation)
          ],
        },
        collegeAdminAId,
      );
    } catch (e: any) {
      atomicFailureError = e;
    }
    assert.ok(atomicFailureError instanceof BadRequestException);
    assert.equal(atomicFailureError.getStatus(), 400);

    const searchFaulty = await db.installmentTemplate.findFirst({
      where: { schoolId: schoolAId, name: 'Faulty Template' },
    });
    assert.equal(searchFaulty, null);
    console.log('✓ Test 12 passed: Invalid creation rejected before write; zero residue.');

    console.log('\n================================================================');
    console.log('ALL TASK 04B.2.1 AUTHORIZATION & SEMANTIC TESTS PASSED CLEANLY!');
    console.log('================================================================\n');
  } finally {
    console.log('--- Cleaning up QA fixtures ---');
    await db.$executeRawUnsafe(`
      DELETE FROM "InstallmentTemplateItem" WHERE "templateId" IN (SELECT id FROM "InstallmentTemplate" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}'));
      DELETE FROM "InstallmentTemplate" WHERE "schoolId" IN ('${schoolAId}', '${schoolBId}');
      DELETE FROM "UserRole" WHERE "userId" IN ('${collegeAdminAId}', '${officeAdminAId}', '${collegeAdminBId}');
      DELETE FROM "User" WHERE "id" IN ('${collegeAdminAId}', '${officeAdminAId}', '${collegeAdminBId}');
      DELETE FROM "School" WHERE "id" IN ('${schoolAId}', '${schoolBId}');
    `);
    await db.$disconnect();
    console.log('--- Teardown complete ---');
  }
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
