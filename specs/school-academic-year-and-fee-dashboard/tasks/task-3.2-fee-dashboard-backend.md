# Task 3.2: Fee Management Dashboard Backend

## 1. Metadata
- **Task ID:** `task-3.2-fee-dashboard-backend`
- **Feature:** School-wide Academic Year Configuration & Fee Management Dashboard
- **Estimated Tier:** Standard
- **Status:** Implemented & Verified against Disposable QA DB (Awaiting Review)
- **Dependencies:** `task-3.1-school-configuration-backend` (Must be accepted first)

---

## 2. Objective & Scope

Implement the backend service and endpoint for the Fee Management Dashboard:
1. Implement `GET /fee-management/dashboard`.
2. Secure with `JwtAuthGuard` and `PermissionsGuard` (`PERMISSIONS.FEES_READ`).
3. Derive `schoolId` from canonical tenant resolution (`SchoolsService.resolveActiveSchool` or equivalent).
4. If unconfigured, return `configured: false` with empty array and zero counts. **Do not fall back to the newest academic year.**
5. Query admissions filtering strictly in the database query `where` clause by `schoolId`, `academicYearId = activeAcademicYearId`, `admissionStatus = CONFIRMED`, `isActive = true`, and `deletedAt = null`.
6. Enforce server-side pagination (`page`, `pageSize`, default 25, max 100) and deterministic sorting (`createdAt DESC, id ASC`).
7. Provide comprehensive unit tests.
8. **STOP and wait for independent audit and acceptance before proceeding to frontend tasks.**

---

## 3. Files to Touch / Create

### Backend Implementation Files:
- `ryo-academy-be/src/fee-management/dto/query-fee-dashboard.dto.ts` (Create query DTO)
- `ryo-academy-be/src/fee-management/fee-management.service.ts` (Create dashboard service)
- `ryo-academy-be/src/fee-management/fee-management.controller.ts` (Create controller)
- `ryo-academy-be/src/fee-management/fee-management.module.ts` (Create module)
- `ryo-academy-be/src/app.module.ts` (Register `FeeManagementModule`)

### Backend Tests:
- `ryo-academy-be/src/fee-management/fee-management.service.spec.ts` (Service unit tests)
- `ryo-academy-be/src/fee-management/fee-management.controller.spec.ts` (Controller unit tests)

---

## 4. Step-by-Step Implementation Instructions

### Step 1: Query DTO Definition
`src/fee-management/dto/query-fee-dashboard.dto.ts`:
```typescript
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryFeeDashboardDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @ApiPropertyOptional({ description: 'Filter by student or admission number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by class UUID' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by program UUID' })
  @IsOptional()
  @IsUUID()
  programId?: string;
}
```

### Step 2: Service Implementation
`src/fee-management/fee-management.service.ts`:
```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { QueryFeeDashboardDto } from './dto/query-fee-dashboard.dto.js';
import { AdmissionStatus, Prisma } from '../../generated/prisma/index.js';

@Injectable()
export class FeeManagementService {
  constructor(private readonly db: DatabaseService) {}

  async getDashboard(userId: string, query: QueryFeeDashboardDto) {
    const actor = await this.db.user.findUnique({
      where: { id: userId },
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
      include: {
        activeAcademicYear: true,
      },
    });

    if (!school || !school.isActive) {
      throw new ForbiddenException('School is inactive or not found');
    }

    const isInvalid = Boolean(
      school.activeAcademicYear &&
      (school.activeAcademicYear.deletedAt !== null || !school.activeAcademicYear.isActive)
    );

    // Unconfigured or invalid configuration: return empty state without fallback
    if (!school.activeAcademicYearId || !school.activeAcademicYear || isInvalid) {
      return {
        configured: false,
        invalidConfiguration: isInvalid,
        activeAcademicYear: null,
        data: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      };
    }

    // Pure database-level query scoping — zero cross-school rows in memory
    const where: Prisma.AdmissionWhereInput = {
      schoolId: actor.schoolId,
      academicYearId: school.activeAcademicYearId,
      admissionStatus: AdmissionStatus.CONFIRMED,
      isActive: true,
      deletedAt: null,
      ...(query.search && {
        OR: [
          { studentName: { contains: query.search, mode: 'insensitive' } },
          { admissionNumber: { contains: query.search, mode: 'insensitive' } },
          { student: { studentName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
      ...(query.classId && { classId: query.classId }),
      ...(query.programId && { programId: query.programId }),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.db.admission.findMany({
        where,
        include: {
          program: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          student: { select: { id: true, studentNumber: true, studentName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.db.admission.count({ where }),
    ]);

    return {
      configured: true,
      invalidConfiguration: false,
      activeAcademicYear: {
        id: school.activeAcademicYear.id,
        name: school.activeAcademicYear.name,
        startDate: school.activeAcademicYear.startDate,
        endDate: school.activeAcademicYear.endDate,
      },
      data: rows,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
```

### Step 3: Controller Implementation
`src/fee-management/fee-management.controller.ts`:
- Secure with `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
- Method `@Get('dashboard')` decorated with `@RequirePermissions(PERMISSIONS.FEES_READ)`.
- Dispatches directly to `feeService.getDashboard(user.userId, query)`.

---

## 5. Security & Invariant Rules
1. Never accept `schoolId` from client query params or headers.
2. Filter strictly by `admissionStatus: CONFIRMED`. Reject inclusion of `DRAFT` or `CANCELLED`.
3. Do not mutate any financial tables or records.
4. Total count must match the exact same `where` clause as data rows.

---

## 6. Verification & Stop Condition
- Run unit tests:
  ```bash
  npm --prefix ryo-academy-be test -- src/fee-management/fee-management.service.spec.ts src/fee-management/fee-management.controller.spec.ts
  ```
- Run typecheck:
  ```bash
  npm --prefix ryo-academy-be run typecheck
  ```
- **STOP CONDITION:** When Task 3.2 unit tests pass and typecheck is clean, submit the task output for independent code review and STOP. Do NOT begin frontend implementation until backend contracts are accepted.
