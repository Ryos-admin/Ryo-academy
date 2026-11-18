# Ryo Academy — Known Technical Constraints

> **Context Document**  
> **Status:** Authoritative  
> **Audience:** Human Engineers and AI Agents  
> **Canonical Path:** `docs/agent-context/known-technical-constraints.md`

---

## 1. Environment & Build Constraints

1. **Node.js Runtime Requirement:**
   - The backend uses Node.js v22+ with ES Modules (`"type": "module"`). Legacy CommonJS `require` constructs must not be introduced into backend application code.
2. **Build Old-Space-Size Cap:**
   - Prisma Client generation and NestJS compilation require explicit Node memory allocation:
     ```bash
     NODE_OPTIONS=--max-old-space-size=512 prisma generate && NODE_OPTIONS=--max-old-space-size=512 nest build
     ```
   - Running builds without this memory option can cause out-of-memory crashes in restricted execution environments.

---

## 2. Database & Persistence Constraints

1. **Neon & Remote Database Prohibition:**
   - Automated tests, migrations, and developer scripts are strictly prohibited from connecting to Neon or any external cloud database.
2. **Connection Pooling vs. Direct Connections:**
   - Standard application traffic uses pooled connections (`DATABASE_URL`).
   - DDL migrations, the historical offset backfill runner (`npm run backfill:offsets`), and PostgreSQL session advisory locks (`55432001`) require direct unpooled database connections (`DIRECT_DATABASE_URL`).
3. **Database-Enforced Deletion Prevention:**
   - All relational foreign keys for parent financial records use `onDelete: Restrict`. Physical deletion of parent entities (`Admission`, `FeePaymentHeader`, `FeePayment`, `AdmissionInstallmentSchedule`) with dependent children is physically blocked by PostgreSQL.

---

## 3. Authentication & Permission Constraints

1. **`/auth/me` User ID Limitation:**
   - The current `/auth/me` backend endpoint returns only `{ id: string }`.
   - User roles, assigned schools, and granular permission sets are not currently returned in the session payload.
   - Frontend components must not assume authoritative permission arrays exist on the client user object without fallback or backend guard validation.

---

## 4. Scope & Feature Freezes

1. **Timetable Work Freeze:**
   - Timetable backend and frontend implementation is **strictly frozen** and out of scope until V0 browser QA is explicitly signed off by the repository owner.
2. **Append-Only Migration Changelog:**
   - The file [frontend-backend-migration-changelog.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/docs/frontend-backend-migration-changelog.md) is an append-only historical log. Previous entries must never be edited, pruned, or reordered.
3. **Admission Cancellation Contract (BE-ND2 Stage 5):**
   - Admission cancellation is strictly restricted to DRAFT status with zero unreversed financial balances and defensive student deactivation (`isActive = false`), as defined in the resolved contract in [domain-business-rules.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/domain-business-rules.md).
