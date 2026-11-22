# Ryo Academy — Backend Engineering Conventions

> **Context Document**  
> **Status:** Authoritative  
> **Audience:** Human Engineers and AI Agents  
> **Canonical Path:** `docs/agent-context/backend-conventions.md`  
> **Package Directory:** `ryo-academy-be/`

---

## 1. Core Framework & Build Environment

- **Runtime:** Node.js v22+ (ES Modules: `"type": "module"`).
- **Framework:** NestJS v11 (Express platform).
- **Database ORM:** Prisma Client v6.19+ with PostgreSQL 16+.
- **Build Memory Constraint:** Because Prisma schema generation and TypeScript transpilation consume significant memory, builds must execute with the old-space-size cap:
  ```bash
  NODE_OPTIONS=--max-old-space-size=512 prisma generate && NODE_OPTIONS=--max-old-space-size=512 nest build
  ```

---

## 2. Prisma Schema Organization & Output

- **Multi-File Layout:** Models are located in `prisma/models/`:
  - `academic/`: Academic years, programs, classes, sections, subjects.
  - `admission_fees/`: Admissions, fee structures, components, installments, schedules.
  - `attendance/`: Sessions and attendance records.
  - `finance/`: Financial logs and transaction audit records.
  - `identity/`: Users, credentials, roles, schools.
- **Client Generation Target:** Prisma client generates to a custom location:
  ```prisma
  generator client {
    provider = "prisma-client"
    output   = "../generated/prisma"
  }
  ```
- **Foreign Key Deletion Policy:** All financial and historical parent entities must use `onDelete: Restrict` to enforce database-level deletion prevention.

---

## 3. Controller & DTO Standards

1. **Input Validation:**
   - Every input payload must be typed with a dedicated DTO class using `class-validator` and `class-transformer`.
   - Global `ValidationPipe` enforces:
     - `whitelist: true` (strips unrecognized properties).
     - `forbidNonWhitelisted: true` (rejects unapproved payload fields).
     - `transform: true` (automatically converts types).
2. **Never Fabricate DTOs or Routes:**
   - Adding new fields to request or response DTOs requires backing database columns or verified application logic. Speculative fields are prohibited.
3. **HTTP Status Codes:**
   - `POST`: 201 Created for resource generation; 200 OK for operational actions (confirmation, reversal).
   - `GET`: 200 OK.
   - `PUT` / `PATCH`: 200 OK.
   - `DELETE`: 200 OK or 204 No Content.

---

## 4. Service Layer, Transactions & Locking

1. **Transaction Encapsulation:**
   - Operations that write across multiple tables or update monetary balances must run inside a Prisma interactive transaction:
     ```typescript
     await this.prisma.$transaction(async (tx) => {
       // All transactional reads and writes must use tx, never this.prisma
     });
     ```
2. **Advisory Lock for Maintenance Windows:**
   - Financial schema migrations and historical backfills require acquiring the PostgreSQL advisory lock `55432001` before freezing writers.
3. **Audit Logging:**
   - High-value financial mutations (admission confirmation, installment schedule creation, fee collection, payment reversal) must create an immutable `FinancialLog` entry within the same transaction.

---

## 5. Backend Verification Commands

From `ryo-academy-be/`:

```bash
# Build backend and generate Prisma client
npm run build

# Run unit tests via Jest
npm run test

# Run tests with coverage
npm run test:cov

# Run historical offset backfill runner (requires DB connection)
npm run backfill:offsets

# Run RBAC seed (approved local QA DB only!)
npm run db:seed
```
