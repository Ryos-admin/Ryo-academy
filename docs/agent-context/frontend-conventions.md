# Ryo Academy — Frontend Engineering Conventions

> **Context Document**  
> **Status:** Authoritative  
> **Audience:** Human Engineers and AI Agents  
> **Canonical Path:** `docs/agent-context/frontend-conventions.md`  
> **Package Directory:** `ryo-academy-fe/`

---

## 1. Core Framework & Build Environment

- **Framework:** React 18/19 with TypeScript.
- **Build Tool:** Vite with ES Modules.
- **Styling Architecture:** Tailwind CSS v4 (`@import "tailwindcss"; @theme inline`).
- **Component Primitives:** Radix UI (`@radix-ui/react-*`).
- **Icons:** `lucide-react`.
- **Form Management:** React Hook Form with Zod schema validation resolvers (`@hookform/resolvers/zod`).
- **Data Fetching:** React Query (TanStack Query v5).

---

## 2. API Communication & Error Handling

### 2.1 Centralized API Client (`src/lib/api-client.ts`)
- All backend communication must pass through the centralized `apiClient` or domain adapters in `src/lib/*-api.ts`.
- **Configuration:** Base URL is driven by `import.meta.env.VITE_API_BASE_URL`.
- **Authentication:** The client automatically injects stored Bearer tokens:
  ```typescript
  const token = localStorage.getItem("accessToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  ```
- **Error Normalization:** HTTP non-2xx responses are normalized into a typed `ApiError` class exposing `statusCode`, `message`, and optional backend validation `errors`.

### 2.2 React Query Conventions
- **Query Keys:** Structure query keys hierarchically as tuple arrays:
  ```typescript
  export const feeKeys = {
    all: ["fees"] as const,
    structures: () => [...feeKeys.all, "structures"] as const,
    structure: (id: string) => [...feeKeys.structures(), id] as const,
    studentFees: (studentId: string) => ["students", studentId, "fees"] as const,
  };
  ```
- **Cache Invalidation:** Mutations must explicitly invalidate related query keys in `onSuccess`:
  ```typescript
  queryClient.invalidateQueries({ queryKey: feeKeys.studentFees(studentId) });
  ```

---

## 3. UI Implementation & Anti-Slop Guidelines

All UI components must adhere strictly to the Ryo Academy visual standards and [anti-slop-changes.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/docs/anti-slop-changes.md):

1. **Anti-AI Typography & Punctuation (Rule R-02):**
   - **Zero Em Dashes (`—`):** Never use em dashes in UI labels, badges, table cells, or placeholder values.
   - Use clean hyphens (`-`), colons, commas, or parentheses instead.
2. **Accessible Touch Targets (Rule R-03 / antislop-human):**
   - Interactive buttons, table action triggers, and checkboxes must have a minimum tap target of 44px on touch viewports:
     ```html
     className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
     ```
3. **Contrast Compliance (WCAG AA 4.5:1):**
   - Inactive or muted table rows must **never** use `opacity-60` on text.
   - Use `bg-muted/30` background tint with high-contrast text color tokens (`text-muted-foreground`).
4. **Visible Focus Affordance:**
   - Interactive elements must retain visible keyboard focus indicators (`focus-visible:ring-1 focus-visible:ring-ring`).

---

## 4. State & Component Modularization

- **Avoid Premature Global State:** Use local React state (`useState`, `useReducer`) for page-scoped UI state (e.g., active tabs, dialog visibility).
- **Page File Size Hygiene:** Large page files (`admissions-students-pages.tsx`, `fee-pages.tsx`) should extract self-contained forms, sub-tables, and dialogs into dedicated component files under `src/components/` or co-located submodules.
- **Preserve Mock Fallbacks:** When updating hybrid pages, ensure consumers that rely on `mock-erp.ts` continue functioning without runtime exceptions.

---

## 5. Frontend Verification Commands

From `ryo-academy-fe/`:

```bash
# Typecheck TypeScript without emitting JS
npm run typecheck

# Run unit and integration tests via Vitest
npm run test

# Run tests with coverage
npm run test:coverage

# Build for production verification
npm run build
```
