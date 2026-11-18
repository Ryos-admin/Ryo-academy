# Ryo Academy — Project Overview

> **Context Document**  
> **Status:** Authoritative  
> **Audience:** Human Engineers and AI Agents  
> **Canonical Path:** `docs/agent-context/project-overview.md`

---

## 1. Executive Summary

Ryo Academy is an enterprise school ERP platform designed to manage educational administration, academic structures, admissions, student enrollment, fee collections, payment schedules, and attendance. 

The system is architected as a cohesive monorepo housing both the backend API services and the frontend single-page application. The core philosophy is grounded in **strict ledger integrity, immutable audit history, explicit tenant isolation, and evidence-based migration**.

---

## 2. Monorepo Repository Structure

The repository contains two primary application packages and centralized documentation:

```text
/
├── AGENTS.md                                # Root operational and safety rules
├── DESIGN.md                                # Authoritative UI design contract & tokens
├── ReadMe.md                                # Master documentation index
├── docs/                                    # System architecture, operations, and agent context
│   ├── architecture/
│   │   └── financial-module-v1.md           # Canonical financial specification
│   ├── operations/
│   │   └── financial-module-v1-runbook.md   # Production deployment and maintenance runbook
│   ├── module-integration-tracker.md        # 15-module readiness ledger
│   └── agent-context/                       # Modular reference specifications
├── .agents/skills/                          # Project-local AGY skills
├── ryo-academy-be/                          # Backend API (NestJS + Prisma + PostgreSQL)
└── ryo-academy-fe/                          # Frontend Application (React + Vite + Tailwind v4)
```

---

## 3. Technology Stack Summary

### Backend (`ryo-academy-be`)
- **Runtime:** Node.js v22+ (ES Modules).
- **Framework:** NestJS v11 (Express platform).
- **ORM & Database:** Prisma ORM v6.19+ with PostgreSQL 16+.
- **Authentication & Security:** NestJS JWT, Argon2 password hashing, RBAC guards.
- **Testing:** Jest with experimental VM modules support (`NODE_OPTIONS=--experimental-vm-modules jest`).
- **Memory Constraint:** Builds require `NODE_OPTIONS=--max-old-space-size=512`.

### Frontend (`ryo-academy-fe`)
- **Runtime & Build:** Vite with TypeScript.
- **Framework:** React 18/19.
- **Styling:** Tailwind CSS v4 (`@import "tailwindcss"; @theme inline`), Radix UI primitives.
- **Data Fetching & Cache:** React Query (TanStack Query) with centralized Fetch-based API client.
- **Testing:** Vitest (`npm run test`), Playwright (`@playwright/test`).
- **Typography & Theme:** DM Sans (interface), Fraunces (editorial/headings), custom HSL CSS tokens.

---

## 4. Module Landscape & Integration Status

Module migration follows an evidence-based roadmap tracked authoritatively in [module-integration-tracker.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/module-integration-tracker.md) and [frontend-backend-migration-changelog.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/docs/frontend-backend-migration-changelog.md):

| Domain Module | Backend Status | Frontend Status | Verification State |
| :--- | :--- | :--- | :--- |
| **Authentication** | Implemented (JWT / Argon2) | Real API-integrated | Verified (Token storage, login flow) |
| **Academic Years** | Implemented | Real API-backed | Verified |
| **Programs** | Implemented | Real API-backed | Verified |
| **Classes** | Implemented | Real API-backed | Verified |
| **Sections** | Implemented | Real API-backed | Verified |
| **Subjects** | Implemented | Real API-backed | Verified (Soft-delete warnings) |
| **Staff & Assignments** | Implemented | Mock or partial | Partially migrated |
| **Admissions** | Implemented (BE-ND1/ND2) | Partially API-integrated | Creation, confirmation, fee preview real |
| **Students** | Partial backend capability | Partially API-integrated | Fee views real; profile partial |
| **Academic Calendar**| Implemented | Not migrated | Mock-backed |
| **Attendance** | Implemented | Mock-backed | Mock-backed |
| **Fees & Invoicing** | Implemented (V1 & BE-ND2) | Real API-backed | Structures, components, schedules real |
| **Timetable** | Not fully available | Mock-backed | **STRICT FREEZE (Blocked until V0 sign-off)** |
| **Dashboard** | Aggregated view | Mock-backed | Dependent on leaf modules |

---

## 5. Non-Negotiable Operational Principles

1. **Make the Smallest Complete Change:** Avoid speculative rewrites, architectural overhauls, or sweeping refactors.
2. **Never Fabricate Contracts:** Do not invent routes, DTO fields, database columns, permissions, or seed flows that lack backing source evidence.
3. **Approved Local Database Only:** All database operations, integration tests, seeds, and migrations must target an approved disposable local QA database. Remote or shared databases (such as Neon) are strictly prohibited.
4. **Append-Only Migration History:** [frontend-backend-migration-changelog.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/docs/frontend-backend-migration-changelog.md) is the permanent historical ledger; past entries must never be modified or rewritten.
5. **Direct Evidence Mandate:** Never assert that tests pass, migrations succeed, or features work without running the command and inspecting direct output.
