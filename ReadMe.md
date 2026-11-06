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
