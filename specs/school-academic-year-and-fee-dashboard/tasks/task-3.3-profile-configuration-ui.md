# Task 3.3: Profile Academic Year Configuration UI

## 1. Metadata
- **Task ID:** `task-3.3-profile-configuration-ui`
- **Feature:** School-wide Academic Year Configuration & Fee Management Dashboard
- **Estimated Tier:** Standard
- **Status:** Implemented & Verified (Awaiting Review)
- **Dependencies:** `task-3.1-school-configuration-backend` (Must be accepted first)

---

## 2. Objective & Scope

Implement frontend UI for configuring the school's active academic year on the College Admin Profile page:
1. Create `schoolsApi` adapter in `ryo-academy-fe/src/lib/schools-api.ts`.
2. Add shared React Query hooks `useSchoolConfiguration()` and `useUpdateSchoolConfiguration()`.
3. Render a "School Academic Year Configuration" panel on `/profile` for users holding `SCHOOL_UPDATE`.
4. Provide a select box with available academic years from `useAcademicYears()`.
5. Invalidate React Query keys `["schools", "configuration"]` and `["fee-management", "dashboard"]` on successful update.
6. Connect the sidebar `.workspace-chip` to the shared `useSchoolConfiguration()` hook with full state handling (loading, configured, unconfigured, invalid, error).
7. Eliminate all hardcoded `"AY 2025–26"` fallback strings.
8. Add component tests.
9. **STOP and wait for independent audit and acceptance before proceeding to Task 3.4.**

---

## 3. Files to Touch / Create

### Frontend API Adapters & Types:
- `ryo-academy-fe/src/lib/schools-api.ts` (Create API adapter)
- `ryo-academy-fe/src/lib/mock-erp.ts` (Ensure `SCHOOL_UPDATE` in `Permission` type if needed)

### Frontend Components:
- `ryo-academy-fe/src/pages/operations-pages.tsx` (Add configuration panel to `Profile` component)
- `ryo-academy-fe/src/pages/app-pages.tsx` (Update `.workspace-chip` to consume shared hook)

### Frontend Tests:
- `ryo-academy-fe/src/pages/__tests__/profile-school-config.test.tsx` (Component tests)

---

## 4. Step-by-Step Implementation Instructions

### Step 1: Create `src/lib/schools-api.ts`
```typescript
import { apiClient } from './api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccessToken } from './auth-api';

export interface SchoolConfigurationResponse {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  activeAcademicYearId: string | null;
  activeAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  isConfigured: boolean;
  isInvalid?: boolean;
}

export interface UpdateSchoolConfigurationDto {
  activeAcademicYearId: string;
}

export const schoolConfigQueryKey = ['schools', 'configuration'] as const;

export const schoolsApi = {
  getConfiguration: (token: string) =>
    apiClient.get<SchoolConfigurationResponse>('/schools/configuration', { token }),
  updateConfiguration: (data: UpdateSchoolConfigurationDto, token: string) =>
    apiClient.patch<SchoolConfigurationResponse>('/schools/configuration', data, { token }),
};

export function useSchoolConfiguration() {
  const token = useAccessToken();
  return useQuery<SchoolConfigurationResponse>({
    queryKey: schoolConfigQueryKey,
    queryFn: () => schoolsApi.getConfiguration(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useUpdateSchoolConfiguration() {
  const token = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSchoolConfigurationDto) =>
      schoolsApi.updateConfiguration(data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolConfigQueryKey });
      queryClient.invalidateQueries({ queryKey: ['fee-management', 'dashboard'] });
    },
  });
}
```

### Step 2: Implement Configuration Panel in `Profile`
In `ryo-academy-fe/src/pages/operations-pages.tsx`:
- Render only when `hasPermission(session, "SCHOOL_UPDATE")` is `true`.
- Display current active academic year status.
- Dropdown populated with active academic years for the school (`useAcademicYears()`).
- On submit, fire mutation and surface success confirmation.

### Step 3: Dynamic Sidebar Academic Year Chip
In `ryo-academy-fe/src/pages/app-pages.tsx`:
In `Shell` component, replace hardcoded chip:
```tsx
const schoolConfig = useSchoolConfiguration();

// Determine chip state
const chipContent = schoolConfig.isLoading ? (
  <>
    <span className="live-dot animate-pulse" />
    <span>Loading AY...</span>
  </>
) : schoolConfig.isError ? (
  <>
    <span className="live-dot live-dot-red" />
    <span>AY Unavailable</span>
  </>
) : schoolConfig.data?.isInvalid ? (
  <>
    <span className="live-dot live-dot-red" />
    <span>Invalid AY</span>
  </>
) : schoolConfig.data?.isConfigured && schoolConfig.data.activeAcademicYear ? (
  <>
    <span className="live-dot" />
    <span>{schoolConfig.data.activeAcademicYear.name}</span>
  </>
) : (
  <>
    <span className="live-dot live-dot-amber" />
    <span>No AY Selected</span>
  </>
);

return (
  ...
  <div className="workspace-chip" data-testid="sidebar-workspace-chip">
    {chipContent}
    <ChevronDown size={13} />
  </div>
  ...
);
```

---

## 5. Verification & Stop Condition
- Run component tests:
  ```bash
  npm --prefix ryo-academy-fe test -- src/pages/__tests__/profile-school-config.test.tsx
  ```
- Run typecheck:
  ```bash
  npm --prefix ryo-academy-fe run typecheck
  ```
- **STOP CONDITION:** When Task 3.3 component tests pass and typecheck is clean, submit for independent code review and STOP.
