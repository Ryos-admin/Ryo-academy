# Ryo Academy ERP — Repository Documentation Index

Welcome to the Ryo Academy ERP repository. This document serves as the master documentation index for system architecture, operational runbooks, API contracts, and integration tracking.

---

## 1. Canonical Architecture Documentation

- [Financial Module V1 Architecture Specification](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/architecture/financial-module-v1.md)
  - Canonical specification covering the 18 financial entities, Discount Engine V1, Installment Management V1, FIFO Payment Allocation Engine, Full Payment Reversal V1, relational DAG lineage, monetary interval partitions, and concurrency lock hierarchies.

---

## 2. Operational Runbooks & Deployment Guides

- [Financial Module V1 Operational Runbook](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/operations/financial-module-v1-runbook.md)
  - Production guide covering controlled financial-write maintenance windows, staged deployment sequences, maintenance advisory locks (`55432001`), the standalone historical offset backfill runner (`npm run backfill:offsets`), deterministic error catalog resolution, and audit SQL playbooks.

---

## 3. Migration, API & Integration Trackers

- [Module Integration Tracker](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/module-integration-tracker.md)
  - Master tracking document for backend module readiness and frontend real-API integration status.
- [Frontend-Backend Migration Changelog](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-fe/docs/frontend-backend-migration-changelog.md)
  - Append-only verified milestone history covering all authentication, academic structure, attendance, fee concession, installment management, and payment reversal implementations.
- [Backend API Documentation](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/ryo-academy-be/docs/api-documentation.md)
  - OpenAPI endpoint references, route definitions, and DTO specifications for backend services.

---

## 4. Engineering Context & Design Specifications

- [Design Identity & Visual Contract](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/DESIGN.md)
  - Canonical UI design specification covering typography (DM Sans, Fraunces), HSL color tokens, semantic status treatments, 44px tap targets, and anti-slop visual standards.
- [Engineering Context Documents](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/)
  - [Project Overview](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/project-overview.md): High-level system overview, technology stack, and module landscape.
  - [System Architecture](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/architecture.md): Client-server topology, NestJS backend layout, React frontend layout, and tenant isolation.
  - [Domain Business Rules](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/domain-business-rules.md): Academic hierarchy immutability, admissions lifecycle, attendance rules, and RBAC context.
  - [Financial Module Rules](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/financial-module-rules.md): Condensed financial invariants, DAG installment lineage, reversal mechanics, and advisory locking.
  - [Frontend Engineering Conventions](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/frontend-conventions.md): React Query conventions, API client adapter patterns, anti-slop rules, and test commands.
  - [Backend Engineering Conventions](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/backend-conventions.md): NestJS module patterns, Prisma transactions, DTO validation, and memory-safe build instructions.
  - [Testing & Quality Standards](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/testing-and-quality.md): Verification pyramid, strict disposable QA database rules (Neon prohibited), fixture hygiene, and Playwright approval gates.
  - [Known Technical Constraints](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/known-technical-constraints.md): Build memory caps, `/auth/me` user ID limitation, database connection rules, and scope freezes.
