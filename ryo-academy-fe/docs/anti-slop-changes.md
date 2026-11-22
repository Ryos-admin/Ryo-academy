# Anti-Slop Remediation Report

**Date:** 2026-11-07  
**Scope:** `ryo-academy-fe` (UI, accessibility, and anti-slop hygiene)  
**Reference Audit:** `ryo-academy-fe/anti-slop/audit-001-2026-11-07.md`  

---

## Executive Summary

This document records all anti-slop remediations performed across the Ryo Academy frontend following Audit 001. All eight audit findings have been resolved in strict conformance with the Antislop design principles:
1. **Rule R-02 (Anti-AI punctuation):** Zero em dashes (`—`) in user-facing UI and code. All instances replaced with clean hyphens (`-`), colons, commas, or parentheses.
2. **Rule R-01 (Anti-Slop / Real UI):** Real tables, real subtotal calculations, real multi-field interactions, and no fake or truncated UI mocks.
3. **Accessibility & Usability (antislop-human):**
   - Maintained contrast standards (WCAG AA 4.5:1+) on muted/inactive rows.
   - 44px minimum tap target sizing for mobile/touch screens (`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0`).
   - Accessible descriptions for checkboxes (`aria-description`).
   - Clear, visible keyboard focus indicators (`focus-visible:ring-1`).
4. **Codebase Stability:**
   - Pre-existing syntax and null-access bugs in `academic-pages.tsx` repaired cleanly without unsafe casts or schema changes.
   - 100% test pass rate across all 7 fee and admission test suites.

---

## Detailed Findings & Remediations

### Finding 1: Fee Pages Em Dashes (Rule R-02)
- **Problem:** `src/pages/fee-pages.tsx` contained multiple em dashes (`—`) in placeholder values and user-facing badge labels.
- **Remediation:**
  - In `displayMoney(null)`: Changed fallback from `" — "` to `"-"`.
  - In `FeeStructureDetail`: Changed fallback for missing term name from `"—"` to `"-"`.
  - In `FeeStructureForm`: Changed placeholder fallback for component description from `" — "` to `"-"`.
- **Files Modified:** `src/pages/fee-pages.tsx`

### Finding 2: Admissions & Students Pages Em Dashes (Rule R-02)
- **Problem:** `src/pages/admissions-students-pages.tsx` contained em dashes (`—`) in fallback displays and empty states.
- **Remediation:**
  - Replaced all fallback text `"—"` with `"-"` across student, admission, and fee ledger views.
  - Updated test assertions in `src/pages/__tests__/admission-fee-preview.test.tsx` to assert `"-"` instead of `"—"`.
- **Files Modified:**
  - `src/pages/admissions-students-pages.tsx`
  - `src/pages/__tests__/admission-fee-preview.test.tsx`

### Finding 3: Identifier Scope Bug in Class Form Navigation
- **Problem:** In `src/pages/academic-pages.tsx:2092`, the Cancel button callback referenced `id`, which was out of scope (`onClick={() => setLocation(id ? `/classes/${classId}` : "/classes")}`).
- **Remediation:** Corrected the identifier to `editing` (`onClick={() => setLocation(editing ? `/classes/${classId}` : "/classes")}`), matching the scoped variable used in submit handling.
- **Files Modified:** `src/pages/academic-pages.tsx`

### Finding 4: Contrast Ratio on Excluded and Inactive Ledger Rows
- **Problem:** In `src/pages/admissions-students-pages.tsx`, excluded/inactive rows used `opacity-60 bg-muted/20`, which reduced text contrast below WCAG AA 4.5:1 on light theme.
- **Remediation:** Removed `opacity-60` on text content; used `bg-muted/30` background tint with high-contrast text color tokens (`text-muted-foreground`), preserving legibility while visually distinguishing inactive rows.
- **Files Modified:** `src/pages/admissions-students-pages.tsx`

### Finding 5: Action Button Tap Targets on Touch Viewports
- **Problem:** Small action buttons (e.g. "Add component", "Remove component", table actions) lacked mobile touch target dimensions.
- **Remediation:** Added responsive tap target classes (`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center`) to interactive controls in `src/pages/fee-pages.tsx` and `src/pages/admissions-students-pages.tsx`.
- **Files Modified:**
  - `src/pages/fee-pages.tsx`
  - `src/pages/admissions-students-pages.tsx`

### Finding 6: Accessible Checkbox Context in Fee Component Grid
- **Problem:** Screen readers navigating checkboxes in data grids benefit from row-specific component name context.
- **Remediation:** Added `aria-description={`Mandatory setting for ${componentName}`}` and `aria-description={`Discount applicable for ${componentName}`}` to the respective checkboxes in `FeeStructureForm`.
- **Files Modified:** `src/pages/fee-pages.tsx`

### Finding 7: Safe School Data Access in Academic Year Form & Details
- **Problem:** `academic-pages.tsx:402` and `academic-pages.tsx:604` attempted to read `query.data?.school.name` directly on the `AcademicYear` interface, which risked runtime TypeError if `school` was undefined, and failed TypeScript compilation.
- **Remediation:**
  - Added optional `school?: { name: string; schoolCode: string; } | null;` to `interface AcademicYear` in `src/lib/academic-years-api.ts`.
  - Added safe navigation and fallback in `src/pages/academic-pages.tsx:402` and `604` (`query.data.school ? ... : query.data.schoolId || ""`).
- **Files Modified:**
  - `src/lib/academic-years-api.ts`
  - `src/pages/academic-pages.tsx`

### Finding 8: Focus Ring Visibility on Component Removal Actions
- **Problem:** Ghost/destructive icon buttons lacked crisp keyboard focus rings.
- **Remediation:** Added explicit `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` styling to component deletion triggers in `FeeStructureForm`.
- **Files Modified:** `src/pages/fee-pages.tsx`

---

## Verification Evidence

1. **Vitest Unit & Integration Suites:**
   - `src/pages/__tests__/fee-structure-form.test.tsx` (22 tests): **PASSED**
   - `src/pages/__tests__/admission-fee-preview.test.tsx` (49 tests): **PASSED**
   - `src/pages/__tests__/payable-concession.test.ts` (7 tests): **PASSED**
   - `src/lib/__tests__/fees-api.test.ts` (14 tests): **PASSED**
   - `src/lib/__tests__/fee-money.test.ts` (13 tests): **PASSED**
   - `src/lib/__tests__/admissions-api.test.tsx` (11 tests): **PASSED**
   - `src/lib/__tests__/concessions-api.test.ts` (9 tests): **PASSED**
   - **Total:** 125/125 tests passing.

2. **Em Dash Verification:**
   - `grep -n "—"` confirmed zero occurrences across all modified files.

3. **No Unintended Changes:**
   - Zero changes to backend APIs, database, migrations, or unrelated frontend modules.
