# Task 3.4: Fee Management Dashboard UI Screen

## 1. Metadata
- **Task ID:** `task-3.4-fee-dashboard-ui`
- **Feature:** School-wide Academic Year Configuration & Fee Management Dashboard
- **Estimated Tier:** Standard
- **Status:** Implemented & Verified (Awaiting Independent Audit & Review)
- **Dependencies:** `task-3.2-fee-dashboard-backend`, `task-3.3-profile-configuration-ui` (Both accepted)

---

## 2. Objective & Scope

Implement the dedicated frontend screen for the Fee Management Dashboard:
1. Create `feeDashboardApi` in `ryo-academy-fe/src/lib/fee-dashboard-api.ts`.
2. Implement `FeeManagementDashboardPage` displaying confirmed admissions scoped to the school's configured academic year.
3. Handle unconfigured, invalid, loading, error, and empty states cleanly.
4. Integrate search and pagination controls.
5. Provide seamless navigation from table rows to the existing Admission Details screen (`/admissions/:id`).
6. Register `/fee-management` in app routing and sidebar navigation (`FEES_READ`), preserving `/fees` as Fee Structure Master.
7. Add component tests.
8. **Final Feature 3 milestone verification and sign-off.**

---

## 3. Files to Touch / Create

### Frontend API Adapters & Types:
- `ryo-academy-fe/src/lib/fee-dashboard-api.ts` (Create API client adapter)

### Frontend Components & Pages:
- `ryo-academy-fe/src/pages/fee-dashboard-pages.tsx` (Create dashboard screen)
- `ryo-academy-fe/src/pages/app-pages.tsx` (Add `/fee-management` route and sidebar nav item)

### Frontend Tests:
- `ryo-academy-fe/src/pages/__tests__/fee-management-dashboard.test.tsx` (Component tests)

---

## 4. Step-by-Step Implementation Instructions

### Step 1: Create `src/lib/fee-dashboard-api.ts`
```typescript
import { apiClient } from './api-client';
import { useQuery } from '@tanstack/react-query';
import { useAccessToken } from './auth-api';

export interface FeeDashboardItem {
  id: string;
  admissionNumber: string;
  admissionSequence: number;
  admissionStatus: 'CONFIRMED';
  studentName: string;
  program?: { id: string; name: string };
  class?: { id: string; name: string };
  section?: { id: string; name: string };
  student?: { id: string; studentNumber: string; studentName: string };
  confirmedAt?: string;
  createdAt: string;
}

export interface FeeDashboardResponse {
  configured: boolean;
  invalidConfiguration?: boolean;
  activeAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  data: FeeDashboardItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FeeDashboardQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  classId?: string;
  programId?: string;
}

export const feeDashboardApi = {
  getDashboard: (params: FeeDashboardQuery, token: string) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params.search) searchParams.set('search', params.search);
    if (params.classId) searchParams.set('classId', params.classId);
    if (params.programId) searchParams.set('programId', params.programId);

    const queryStr = searchParams.toString();
    const endpoint = `/fee-management/dashboard${queryStr ? `?${queryStr}` : ''}`;
    return apiClient.get<FeeDashboardResponse>(endpoint, { token });
  },
};

export function useFeeDashboard(params: FeeDashboardQuery) {
  const token = useAccessToken();
  return useQuery({
    queryKey: ['fee-management', 'dashboard', params],
    queryFn: () => feeDashboardApi.getDashboard(params, token!),
    enabled: Boolean(token),
  });
}
```

### Step 2: Implement `FeeManagementDashboardPage`
In `ryo-academy-fe/src/pages/fee-dashboard-pages.tsx`:
- Render loading, error, unconfigured, invalid, and data states.
- If `!data?.configured`:
  - If `data?.invalidConfiguration`: Display Alert that configured academic year is inactive or deleted, with CTA to `/profile`.
  - Else: Display `<Empty title="No Academic Year Configured" detail="A school-wide academic year has not been set yet." action={canConfigure && <Link href="/profile">Configure in Profile</Link>} />`.
- Table listing confirmed admissions with column links to `/admissions/${row.id}`.
- Pagination controls with previous/next buttons and record indicators.

### Step 3: Register Routing & Sidebar
In `ryo-academy-fe/src/pages/app-pages.tsx`:
1. Register route:
   ```tsx
   <Route path="/fee-management">
     <Protected session={session} permission="FEES_READ">
       <FeeManagementDashboardPage session={session} />
     </Protected>
   </Route>
   ```
2. Add navigation item in `nav`:
   ```typescript
   {
     href: "/fee-management",
     label: "Fee Management",
     icon: Wallet,
     permission: "FEES_READ",
   }
   ```
3. Keep existing `/fees` route unchanged as Fee Structure Master (`RealFeesPage`).

---

## 5. Verification Commands
```bash
npm --prefix ryo-academy-fe test -- src/pages/__tests__/fee-management-dashboard.test.tsx
npm --prefix ryo-academy-fe run typecheck
npm --prefix ryo-academy-fe run build
```

---

## 6. Implementation & Verification Summary

### DATA-MIN-01 Backend Remediation:
- **Location:** `ryo-academy-be/src/fee-management/fee-management.service.ts`
- **Correction:** Replaced broad Admission query and `include` with explicit top-level Prisma `select`:
  - Retained fields: `id`, `admissionNumber`, `admissionSequence`, `admissionStatus`, `studentName`, `confirmedAt`, `createdAt`, `program` ({id, name}), `class` ({id, name}), `section` ({id, name}), and `student` ({id, studentNumber, studentName}).
  - Excluded fields: `dateOfBirth`, `gender`, `parentName`, `parentRelation`, `parentPhone`, `parentAlternatePhone`, `parentEmail`, `permanentAddress`, `presentAddress`, `emergencyContactName`, `emergencyContactNumber`, `createdById`, `confirmedById`, `cancelledById`, and financial fields.
- **Backend Verification:**
  - `src/fee-management/fee-management.service.spec.ts` (14 tests) + `fee-management.controller.spec.ts` (1 test). All 15 tests passed.
  - PostgreSQL QA Integration test `test/fee-management-dashboard.integration.ts` executed on isolated disposable PostgreSQL cluster (port 55432). Verified DATA-MIN-01 PII exclusion on real database records.

### Frontend Fee Management Dashboard:
- Created `ryo-academy-fe/src/lib/fee-dashboard-api.ts` with `useFeeDashboard()` query hook and query key `['fee-management', 'dashboard', params]`.
- Implemented `FeeManagementDashboardPage` in `ryo-academy-fe/src/pages/fee-dashboard-pages.tsx` with all 5 configuration states (loading, error, unconfigured, invalid, and configured), search with 300ms debounce, program and class filters, pagination controls, and row links to `/admissions/:id`.
- Registered `/fee-management` route and sidebar entry with `FEES_READ` in `app-pages.tsx`, preserving `/fees` untouched as Fee Structure Master.
- Component tests: `src/pages/__tests__/fee-management-dashboard.test.tsx` (16 tests passed).
- Full frontend test suite: 23 test files passed, 393/393 tests passed (100%).
- Typecheck & Production Build: Both clean (exit code 0).
