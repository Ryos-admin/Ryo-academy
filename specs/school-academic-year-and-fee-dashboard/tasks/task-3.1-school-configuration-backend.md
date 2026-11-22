# Task 3.1: School Academic Year Configuration Backend

## 1. Metadata
- **Task ID:** `task-3.1-school-configuration-backend`
- **Feature:** School-wide Academic Year Configuration & Fee Management Dashboard
- **Estimated Tier:** Standard
- **Status:** Implemented & Verified against Disposable QA DB (Awaiting Review)
- **Dependencies:** None (Independent foundation)

---

## 2. Objective & Scope

Implement backend support for persisting and managing the school-wide configured academic year:
1. Update Prisma schema to model `School.activeAcademicYearId` with explicit bi-directional relation naming (`SchoolAcademicYears` and `SchoolActiveAcademicYear`) to disambiguate the existing `School.academicYears` relation.
2. Add `PERMISSIONS.SCHOOL_UPDATE = 'school:update'` to RBAC constants and assign to `COLLEGE_ADMIN` in seeds (ensuring `OFFICE_ADMIN` and `STAFF` do NOT receive it).
3. Implement `SchoolsModule`, `SchoolsController`, and `SchoolsService` exposing:
   - `GET /schools/configuration` (accessible to all authenticated users of the school).
   - `PATCH /schools/configuration` (restricted to users holding `SCHOOL_UPDATE`).
4. Validate same-school ownership, active status, and non-deleted state for the target academic year.
5. Provide canonical tenant resolution verifying user and school active/deleted state.
6. Provide comprehensive unit tests.
7. **STOP and wait for independent audit and acceptance before proceeding to Task 3.2.**

---

## 3. Files to Touch / Create

### Backend Schemas & Constants:
- `ryo-academy-be/prisma/models/academic/school.prisma` (Add `activeAcademicYearId` and relation)
- `ryo-academy-be/prisma/models/academic/academic-year.prisma` (Disambiguate relation)
- `ryo-academy-be/src/auth/permissions/permission.constants.ts` (Add `SCHOOL_UPDATE`)
- `ryo-academy-be/src/database/seed/rbac.seed.ts` (Assign `SCHOOL_UPDATE` to `COLLEGE_ADMIN`)

### Backend Implementation Files:
- `ryo-academy-be/src/schools/dto/school-configuration.dto.ts` (Create DTOs)
- `ryo-academy-be/src/schools/dto/update-school-configuration.dto.ts` (Create DTOs)
- `ryo-academy-be/src/schools/schools.service.ts` (Create service with canonical tenant resolution)
- `ryo-academy-be/src/schools/schools.controller.ts` (Create controller)
- `ryo-academy-be/src/schools/schools.module.ts` (Create module)
- `ryo-academy-be/src/app.module.ts` (Import `SchoolsModule`)

### Backend Tests:
- `ryo-academy-be/src/schools/schools.service.spec.ts` (Unit tests)
- `ryo-academy-be/src/schools/schools.controller.spec.ts` (Controller unit tests)

---

## 4. Step-by-Step Implementation Instructions

### Step 1: Prisma Schema Updates
In `prisma/models/academic/school.prisma`:
```prisma
// Disambiguate existing relation
academicYears AcademicYear[] @relation("SchoolAcademicYears")

// Add new configured academic year pointer with explicit relation name
activeAcademicYearId String?
activeAcademicYear   AcademicYear? @relation("SchoolActiveAcademicYear", fields: [activeAcademicYearId], references: [id], onDelete: SetNull)

@@index([activeAcademicYearId])
```

In `prisma/models/academic/academic-year.prisma`:
```prisma
// Disambiguate existing relation
schoolId         String?
school           School?  @relation("SchoolAcademicYears", fields: [schoolId], references: [id])
legacySchoolCode String?  @map("schoolCode")

// Reciprocal relation for active academic year pointer
configuredInSchools School[] @relation("SchoolActiveAcademicYear")
```

Execute `npx prisma generate` to refresh the Prisma Client types.

### Step 2: RBAC Constant & Seed
In `src/auth/permissions/permission.constants.ts`:
```typescript
export const PERMISSIONS = {
  ...
  SCHOOL_UPDATE: 'school:update',
} as const;
```

In `src/database/seed/rbac.seed.ts`:
Add description to `PERMISSION_DESCRIPTIONS`:
```typescript
[PERMISSIONS.SCHOOL_UPDATE]: 'Configure school-wide settings including active academic year.',
```
Verify that `COLLEGE_ADMIN` receives `SCHOOL_UPDATE` via `Object.values(PERMISSIONS).filter(p => p !== INSTALLMENT_SCHEDULE_MANAGE)`, while `OFFICE_ADMIN` and `STAFF` do NOT have it in their explicit whitelist arrays.

### Step 3: DTO Definitions
`src/schools/dto/update-school-configuration.dto.ts`:
```typescript
import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSchoolConfigurationDto {
  @ApiProperty({ description: 'UUID of the active Academic Year for the school' })
  @IsUUID()
  @IsNotEmpty()
  activeAcademicYearId: string;
}
```

### Step 4: Service Implementation & Canonical Tenant Resolution
`src/schools/schools.service.ts`:
```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { UpdateSchoolConfigurationDto } from './dto/update-school-configuration.dto.js';

@Injectable()
export class SchoolsService {
  constructor(private readonly db: DatabaseService) {}

  async resolveActiveSchool(actorUserId: string): Promise<string> {
    const actor = await this.db.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, schoolId: true, isActive: true, deletedAt: true },
    });

    if (!actor || !actor.isActive || actor.deletedAt !== null) {
      throw new ForbiddenException('User is inactive or deleted');
    }

    if (!actor.schoolId) {
      throw new ForbiddenException('A school-scoped user is required');
    }

    const school = await this.db.school.findUnique({
      where: { id: actor.schoolId },
      select: { id: true, isActive: true },
    });

    if (!school || !school.isActive) {
      throw new ForbiddenException('School is inactive or not found');
    }

    return school.id;
  }

  async getConfiguration(schoolId: string) {
    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      include: {
        activeAcademicYear: true,
      },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const isInvalid = Boolean(
      school.activeAcademicYear &&
      (school.activeAcademicYear.deletedAt !== null || !school.activeAcademicYear.isActive)
    );

    const isConfigured = Boolean(school.activeAcademicYearId && !isInvalid);

    return {
      schoolId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      activeAcademicYearId: isConfigured ? school.activeAcademicYearId : null,
      activeAcademicYear: isConfigured
        ? {
            id: school.activeAcademicYear!.id,
            name: school.activeAcademicYear!.name,
            startDate: school.activeAcademicYear!.startDate,
            endDate: school.activeAcademicYear!.endDate,
            isActive: school.activeAcademicYear!.isActive,
          }
        : null,
      isConfigured,
      isInvalid,
    };
  }

  async updateConfiguration(schoolId: string, dto: UpdateSchoolConfigurationDto) {
    const academicYear = await this.db.academicYear.findUnique({
      where: { id: dto.activeAcademicYearId },
    });

    if (!academicYear) {
      throw new NotFoundException('Academic year not found');
    }

    // Invariant 1: Cross-school rejection
    if (academicYear.schoolId !== schoolId) {
      throw new BadRequestException('Academic year does not belong to this school');
    }

    // Invariant 2: Soft-delete / inactive rejection
    if (academicYear.deletedAt !== null || !academicYear.isActive) {
      throw new BadRequestException('Cannot configure a soft-deleted or inactive academic year');
    }

    // Update School entity without mutating AcademicYear
    await this.db.school.update({
      where: { id: schoolId },
      data: { activeAcademicYearId: dto.activeAcademicYearId },
    });

    return this.getConfiguration(schoolId);
  }
}
```

### Step 5: Controller Implementation
`src/schools/schools.controller.ts`:
- `@Get('configuration')` protected by `JwtAuthGuard`. Resolves `schoolId` via `this.schoolsService.resolveActiveSchool(user.userId)`.
- `@Patch('configuration')` protected by `JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions(PERMISSIONS.SCHOOL_UPDATE)`. Resolves `schoolId` and calls `updateConfiguration`.

---

## 5. Security & Invariant Rules
1. Never accept `schoolId` from client parameters, body, or headers. Derive solely from authenticated `user.userId`.
2. Do not mutate any fields on the target `AcademicYear` entity (specifically `isActive`, dates, or lifecycle state).
3. Always verify `academicYear.schoolId === actorSchoolId` to block cross-school privilege escalation.

---

## 6. Verification & Stop Condition
- Run unit tests:
  ```bash
  npm --prefix ryo-academy-be test -- src/schools/schools.service.spec.ts src/schools/schools.controller.spec.ts
  ```
- Run integration tests against disposable QA database:
  ```bash
  node ryo-academy-be/scripts/run-integration-tests.mjs school-configuration.integration.ts
  ```
- Run build and typecheck:
  ```bash
  npm --prefix ryo-academy-be run build
  ```
- **STOP CONDITION:** Task 3.1 unit tests pass (19/19), RBAC guard unit tests pass (7/7), integration tests pass against disposable PostgreSQL QA database (all 36 migrations deployed cleanly), and backend build passes with zero errors. Work submitted for independent code review and STOPPED.

---

## 7. Verification Evidence
1. **Prisma Client Generation:**
   `prisma generate` succeeded generating Client (6.19.3) with explicit bi-directional relations `SchoolAcademicYears` and `SchoolActiveAcademicYear`.
2. **PostgreSQL QA Integration Verification:**
   `node ryo-academy-be/scripts/run-integration-tests.mjs school-configuration.integration.ts` deployed migration `20261118220000_school_active_academic_year` to ephemeral cluster `ryo_qa` on `127.0.0.1:55432`. All test assertions passed (canonical tenant resolution, initial unconfigured state, valid configuration update, cross-school rejection invariant, soft-delete rejection, downstream invalidation on soft-delete, and hard-delete `ON DELETE SET NULL` referential integrity). Cluster was cleanly torn down.
3. **Backend Unit Tests:**
   `npm test -- src/schools/ src/auth/permissions.guard.spec.ts`: 3 test suites passed, 26/26 tests passed (100%).
4. **Backend Build & Typecheck:**
   `npm run build`: Exit code 0, zero errors.
5. **Frontend Compatibility:**
   `npm --prefix ryo-academy-fe test -- src/lib/__tests__/permissions.test.ts`: 22/22 tests passed.
   `npm --prefix ryo-academy-fe run typecheck`: Clean (0 errors).
