# Test Plan — Ryo Academy Frontend

**Scope target:** `ryo-academy-fe` (Vite 7 + React 19 + TypeScript + wouter + TanStack Query + react-hook-form + zod + Radix/Tailwind v4)

**Status:** Phase 1 complete. Tooling installed and running — 68 tests green. See
[section 8](#8-current-progress) for what is done and what remains.

---

## 1. Scope

**In scope**

- All 10 page domains (dashboard, academic setup, students/admissions, staff, fees, attendance, timetable, profile)
- `src/lib/*` API layer (12 modules), session handling, error mapping
- RBAC / permission enforcement
- Form validation (zod schemas)
- The days-of-week multi-select (`MultiSelectField`)

**Out of scope (backend-owned)**

- Business logic that lives in `ryo-academy-be`
- Database integrity, Prisma migrations
- Infrastructure / deployment

---

## 2. Strategy & tooling

Three-layer pyramid, cheapest first. Tooling is additive and matches what is already installed.

| Layer | Tool | Target | Rationale |
|---|---|---|---|
| Unit | `vitest` | ~80% | `lib/` is overwhelmingly pure functions — fastest ROI |
| Component | `@testing-library/react` + `jsdom` | ~15% | Form fields, the multi-select, permission-gated buttons |
| E2E | `@playwright/test` | ~5% | Critical paths only; catches routing/guard regressions |

`typescript` must be a devDependency — it was previously absent, which meant
`pnpm typecheck` could never pass. `tsc --noEmit` should be a CI gate.

---

## 3. Priority definitions

| Priority | Meaning |
|---|---|
| **P0** | Money, data integrity, or access control. Blocks release. |
| **P1** | Core workflow broken. No data loss. |
| **P2** | Polish, cosmetic, low-traffic. |

---


## 4. Test cases

### A. Build & tooling health — P0

| # | Case | Expected |
|---|---|---|
| A1 | `pnpm typecheck` | Must exit 0. Previously failed: `tsc: command not found` |
| A2 | `pnpm build` | Passes. Baseline verified: 1850 modules, exit 0 |
| A3 | Unused import scan | `toProgramViewModel`, `toWeekdayCodes`, `toWeekdayNames` all still referenced |

### B. Auth & session — P0

| # | Case | Expected |
|---|---|---|
| B1 | Login with valid credentials | Token written to `localStorage`, `hasSession()` true, redirect to `/dashboard` |
| B2 | Login with invalid credentials | Toast with backend message, **no token written** |
| B3 | Reload with a valid token | Session restored, no re-login |
| B4 | Direct URL to a protected route with no token | Redirect to `/login` |
| B5 | `session.clear()` | Token + expiry keys removed, subscribers notified |
| B6 | `setAccessToken(tok, 3600)` | Expiry = `Date.now() + 3600000`; omit `expiresIn` → expiry key removed |
| B7 | `/auth/me` returns 401 | `useCurrentUser` clears session (auto-logout) |
| B8 | Forgot / Reset password routes | Render standalone, no nav shell |

### C. RBAC — P0

Verify `hasPermission` across the **full 3 × 22 matrix** (`mock-erp.ts:20-24`) as a unit test, then assert the UI honours it.

| Role | Notable gaps to assert |
|---|---|
| `COLLEGE_ADMIN` | All 22 permissions |
| `OFFICE_ADMIN` | Has `STAFF_READ` but **not** `STAFF_CREATE` / `STAFF_UPDATE`; has **no** `ATTENDANCE_*` |
| `STAFF` | Only `STUDENT_READ`, `CLASS_READ`, `ATTENDANCE_*`, `TIMETABLE_READ`, `SHIFT_READ` |

| # | Case | Expected |
|---|---|---|
| C1 | `STAFF` opens `/fees` | `AccessState` denial |
| C2 | `OFFICE_ADMIN` opens `/attendance` | Denial — no attendance permissions |
| C3 | `STAFF` opens `/fees/new` | Blocked by `<Protected permission="FEES_CREATE">` |
| C4 | Direct-URL bypass check across all routes | Every `new` / `edit` route wrapped in `<Protected>` — see BUG-1 |
| C5 | **`/academic-programs/new` and `/:id/edit` as `STAFF`** | Should be blocked. Currently unguarded |
| C6 | Action buttons vs. permission | Create / Edit render only with a matching permission |

### D. API client & error mapping — P0

| # | Case | Expected |
|---|---|---|
| D1 | 204 No Content | Returns `undefined`, no JSON parse error |
| D2 | `content-length: 0` | Returns `undefined` |
| D3 | Malformed JSON body | Falls back to raw text, does not throw |
| D4 | `message` is `string[]` | `backendMessage` is the array; `Error.message` joined with `", "` |
| D5 | 401 / 403 / 404 / 409 mapping | Correct user message per each `*ErrorMessage()` helper (all 12 modules) |
| D6 | Missing `VITE_API_BASE_URL` | Throws a clear configuration error |
| D7 | Leading slashes in path | Normalised, no double-slash |
| D8 | `Authorization` header | `Bearer <token>` set only when a token is present |
| D9 | Network failure | Surfaces as a toast; no white screen |


### E. Days-of-week multi-select — P0

| # | Case | Expected |
|---|---|---|
| E1 | Trigger with no selection | Shows "Select days" in muted colour |
| E2 | Click trigger | Menu opens with 7 `DropdownMenuCheckboxItem`s, all unchecked |
| E3 | Check "Monday" | Trigger reads "Monday"; check icon visible |
| E4 | **Menu stays open** after checking | `onSelect` `preventDefault()` works |
| E5 | Check Mon + Wed + Fri | Trigger reads "Monday, Wednesday, Friday" |
| E6 | Uncheck "Wednesday" | Removed from trigger and payload |
| E7 | **Order independence** — click SAT then MON | Trigger reads **"Monday, Saturday"** (Mon→Sun ordering) |
| E8 | Select all 7, then unselect all | Back to placeholder |
| E9 | **Submit with 0 days selected** | Error "Add at least one day"; **no network call fired** |
| E10 | Create payload | `daysOfWeek: ["MON", ...]` codes, not names |
| E11 | Edit form | Saved days pre-checked from the API response |
| E12 | Round trip | Create → list renders `daysOfWeek.join(" · ")` |
| E13 | `startTime > endTime` | "Start time must be before end time." |
| E14 | Academic year while editing | Select **disabled** + helper text shown |
| E15 | Keyboard only | Enter/Space opens; arrows navigate; Space toggles; Esc closes; focus returns to trigger |
| E16 | Label association | `<label for>` targets the trigger button |
| E17 | Long selection (7 days) | Text truncates with ellipsis, layout intact |
| E18 | Menu width | ≥ trigger width; no clipping inside the 2-column `.form-grid` |

### F. Academic setup — P1

| # | Case | Expected |

### G. Students, admissions, staff — P1

| # | Case | Expected |
|---|---|---|
| G1 | Admission → student conversion | Status updates, student link created |
| G2 | Dependent dropdowns | Section list filters by the selected class |
| G3 | Duplicate staff email | 409 → friendly duplicate message |
| G4 | Search filters table | Rows filter; "No records found" when empty |
| G5 | `gender` / `status` enums | Only valid values submitted |

### H. Fees & payments — P0 *(money)*

| # | Case | Expected |
|---|---|---|
| H1 | **Decimal coercion** | Backend sends `number \| string`; `feeAmount()` renders correctly, never `NaN` |
| H2 | `totalAmount` of 0 or negative | Zod `.min(1)` rejects |
| H3 | Payment greater than outstanding | Rejected or clamped — verify intended behaviour |
| H4 | Partial payment | `paidAmount` + `outstandingAmount` recompute correctly |
| H5 | `discountApplicable` / `isMandatory` | Correctly coerced to booleans on submit |
| H6 | Component delete | Outstanding recalculates; totals stay consistent |
| H7 | **Invariants** | `paid + outstanding == total` after every mutation |

### I. Attendance state machine — P0

| # | Case | Expected |
|---|---|---|
| I1 | Create draft | Status `DRAFT`; all eligible students default to PRESENT |
| I2 | Submit register | Status → `SUBMITTED`, `submittedAt` set |
| I3 | **Edit a SUBMITTED register** | Read-only: "Submitted attendance cannot be edited." |
| I4 | Delete a SUBMITTED register | Blocked — only `DRAFT` is deletable |
| I5 | `OFFICE_ADMIN` on attendance | No mark / submit controls (no `ATTENDANCE_*`) |
| I6 | Toggle Present → Absent | Exactly one status active per student |
| I7 | Empty register | Blocked or warned; never silently saved |
| I8 | Register with zero students | Guard against submitting an empty entry list |

### J. Timetable, dashboard, cross-cutting — P2

| # | Case | Expected |
|---|---|---|
| J1 | Timetable grid | Mon–Fri only; no Sunday column |
| J2 | Empty timetable slots | "No entries" empty state |
| J3 | Dashboard counters | Match actual record counts |
| J4 | Unknown URL | 404 page |
| J5 | Every list page | Loading / error / empty states all render; no infinite spinner |
| J6 | Mobile 375px | Forms stack, tables scroll, multi-select usable |
| J7 | Keyboard-only navigation | All forms operable, visible focus rings |
| J8 | Long text overflow | Truncation, no layout break |

---

|---|---|---|
| F1 | Academic year `startDate >= endDate` | Refine error blocks submit |
| F2 | Class without a parent programme | "Choose a program or shift" |
| F3 | Section without a parent class | "Choose a class" |
| F4 | Program without an academic year | "Choose an academic year" |
| F5 | Detail page for a deleted id | "Record not found" empty state |

## 5. Known bugs & risks

### BUG-1 — Route guard gap (P0, security)

`app-pages.tsx:742-747` — `/academic-programs/new` and `/academic-programs/:id/edit` are **not**
wrapped in `<Protected>`, unlike every other `new` / `edit` route. `ProgramForm` also performs no
internal permission check (it takes no `session` prop and calls no `hasPermission`).

A `STAFF` user can navigate directly to these URLs and attempt a create/update. Fix by wrapping the
routes in `<Protected>`, and/or adding a permission check inside `ProgramForm`. Cover with a
regression test (C5).

### BUG-2 — `pnpm typecheck` was broken, and reveals 52 pre-existing errors (P0, CI blocker)

`typescript` was absent from devDependencies, so the existing `typecheck` script could never pass.
It has now been added, and running it surfaces **52 pre-existing type errors** that were previously
invisible. Verified as pre-existing: stashing the multi-select change and re-running produces the
identical 52 errors, so none were introduced by recent work.

| File | Errors |
|---|---|
| `src/pages/admissions-students-pages.tsx` | 19 |
| `src/pages/staff-pages.tsx` | 12 |
| `src/pages/academic-pages.tsx` | 7 |
| `src/pages/dashboard-page.tsx` | 5 |
| `src/lib/mock-erp.ts` | 5 |
| `src/pages/fee-pages.tsx` | 3 |
| `src/pages/attendance-pages.tsx` | 1 |

Two dominant root causes:

1. **`Field` / `SelectField` are typed as `useForm<Record<string, unknown>>`**, so any form using a
   narrower shape (`useForm<{ name: string; classId: string }>`) fails to satisfy the prop type —
   `UseFormWatch<...>` is contravariant in the field names. Fix by making the field components
   generic over the form's value type.
2. **`mock-erp.ts` has `role: "Office Admin"` / `"College Admin"` / `"Staff"`** where the `Role`
   type expects `"OFFICE_ADMIN"` / `"COLLEGE_ADMIN"` / `"STAFF"`. This is a genuine data bug, not
   just a type complaint — a role string that does not match the union will fail every
   `ROLE_PERMISSIONS[role]` lookup at runtime.

`typecheck` must not be made a CI gate until these are fixed, or CI will be red on day one.

### BUG-3 — Dead mock attendance components (P2)

`AttendancePage`, `AttendanceMark` and `AttendanceDetail` (`attendance-pages.tsx:15-31`) are exported
and imported into `app-pages.tsx` but never routed — only the `Real*` variants are used.
`AttendanceMark` additionally contains a duplicated form: a `.form-grid` of
`SelectField form={undefined as never}` **plus** a near-identical `.attendance-select-grid` block.

Risk: a future maintainer edits the dead copy. Recommend deleting all three exports and their
imports in `app-pages.tsx`.

### RISK-4 — Types verified clean for the multi-select (RESOLVED)

The multi-select change was originally validated with `vite build` only, because `tsc` was
unavailable. Now that `typescript` is installed, `tsc` has been run: the 52 errors in BUG-2 are all
pre-existing and **none** are in `MultiSelectField`, `toWeekdayCodeList`, or the new zod schemas.
`vite build` also passes (1850 modules, exit 0).

### RISK-5 — Test tooling (RESOLVED)

`vitest`, `jsdom`, `@testing-library/{react,jest-dom,user-event}` and `typescript` are now
installed. `pnpm test`, `pnpm test:watch` and `pnpm test:coverage` are wired up, with
`vitest.config.ts` and `src/test/setup.ts` (including the pointer-capture / `ResizeObserver` /
`PointerEvent` / `matchMedia` shims Radix UI needs under jsdom).

> Note: getting the install to run required repointing `node_modules/.modules.yaml` at the current
> pnpm store, because it referenced a store directory from a previous snap revision that no longer
> exists on disk. If a future `pnpm install` reports `ERR_PNPM_UNEXPECTED_STORE`, that file is why.

---

## 6. Execution order

| Phase | Work | Effort |
|---|---|---|
| 1 | Re-link `node_modules`; add `typescript`; verify `typecheck`; add `vitest` + jsdom + RTL | 0.5 day |
| 2 | Unit tests: RBAC matrix, `session`, `api-client`, `programs-api` converters, zod schemas | 1 day |
| 3 | Component tests for `MultiSelectField` (E1–E18) | 1 day |
| 4 | Component tests: attendance state machine, fee invariants | 1 day |
| 5 | E2E: login → academic program CRUD → attendance mark/submit | 1.5 days |
| 6 | Fix BUG-1 and BUG-3; add CI gate | 0.5 day |

---

## 7. Exit criteria

- [ ] `pnpm typecheck` and `pnpm build` both green in CI
- [ ] 100% of **P0** cases passing, including the full RBAC matrix
- [ ] BUG-1 (route guard) fixed and covered by a regression test
- [ ] BUG-2 (52 pre-existing type errors) fixed before `typecheck` becomes a CI gate
- [ ] Fee invariants (H7) hold across payment scenarios
- [ ] No P1 failures outstanding; P2 failures tracked

---

## 8. Current progress

### Done

| Item | Status |
|---|---|
| A2 `pnpm build` | ✅ passes — 1850 modules, exit 0 |
| BUG-2 `typescript` installed | ✅ done (revealed the 52 errors above) |
| RISK-4 multi-select type safety | ✅ verified — zero errors in the new code |
| RISK-5 test tooling installed | ✅ vitest 5, jsdom, RTL, user-event |
| RBAC matrix (C) | ✅ `src/lib/__tests__/permissions.test.ts` |
| Session (B5, B6) | ✅ `src/lib/__tests__/session.test.ts` |
| API client (D1–D8) | ✅ `src/lib/__tests__/api-client.test.ts` |
| Weekday converters (E10) | ✅ `src/lib/__tests__/programs-api.test.ts` |
| Multi-select (E1–E8, E15, E16) | ✅ `src/pages/__tests__/multi-select-field.test.tsx` |

**Result: 68 tests, 68 passing.**

Run with `pnpm test`, `pnpm test:watch`, or `pnpm test:coverage`.

### Not yet covered

Everything else in sections B, E, F, G, H, I and J, plus Playwright E2E. In particular the three
highest-risk areas still have **no** automated coverage:

- Attendance DRAFT → SUBMITTED state machine (section I)
- Fee invariants `paid + outstanding == total` (H7)
- The BUG-1 route-guard gap (C5) — no regression test exists yet

### Known test-harness caveats

- Radix `DropdownMenu` is modal, so it sets `aria-hidden` on outside content while open. The
  multi-select tests therefore look the trigger up by DOM id rather than accessible role. If the
  component is ever changed to `modal={false}`, these lookups still work, but the accessibility
  tree will change.
- `src/test/setup.ts` polyfills `PointerEvent`, pointer capture, `ResizeObserver` and `matchMedia`
  because jsdom does not implement them. Do not remove them without re-running the component tests.

| F6 | Academic calendar date range | Invalid ranges rejected |

---

---
