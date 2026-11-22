# Repository Instructions

- Make the smallest complete change. Preserve unrelated user changes and avoid broad refactors.
- Reuse existing backend modules, services, DTOs, guards, fixtures, QA harnesses, utilities, scripts, and test commands.
- Before changing shared behavior, inspect its callers, tests, fixtures, configuration, and exports.
- Run focused checks first. Run broader regression checks at milestone boundaries or when shared contracts change.
- Read `ryo-academy-fe/docs/frontend-backend-migration-changelog.md` before every implementation milestone.
- Treat the migration changelog as append-only history. Preserve every historical entry and append only factual, verified entries.
- Do not invent routes, DTO fields, permissions, seed flows, database behavior, or unsupported feature contracts.
- Never expose credentials, tokens, passwords, connection strings, or sensitive fixture data in source, logs, traces, reports, or chat.
- Database writes, migrations, seeds, integration tests, HTTP QA, and browser QA may use only an approved disposable local QA database. Never use Neon or another unverified remote/shared database.
- Browser fixture provisioning, credential delivery, and residue verification require explicit owner approval before database-backed browser testing.
- QA fixtures must be deterministic, clearly test-owned, idempotent, cleaned in guaranteed teardown, and followed by residue verification.
- Preserve authorization, trusted actor/school context, validation, transaction boundaries, rollback behavior, idempotency behavior, and historical data.
- Assert attendance-history and fee-payment-history preservation only when the actual application contract and approved fixtures support those assertions.
- Do not claim browser QA, HTTP/JWT behavior, authorization, tenant isolation, rollback, idempotency, or historical-data preservation without direct evidence.
- Report exact files changed, exact commands run, results, blocked checks, limitations, and unverified areas.
- Timetable work is out of scope until V0 browser QA is explicitly signed off.

## Engineering Context & Architecture References

Read these authoritative context documents for domain-specific implementation rules:
- Design Identity & Visual Contract: [DESIGN.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/DESIGN.md)
- Monorepo Overview: [project-overview.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/project-overview.md)
- System Architecture: [architecture.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/architecture.md)
- Domain Business Rules: [domain-business-rules.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/domain-business-rules.md)
- Financial Invariants & Lineage: [financial-module-rules.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/financial-module-rules.md)
- Frontend Conventions: [frontend-conventions.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/frontend-conventions.md)
- Backend Conventions: [backend-conventions.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/backend-conventions.md)
- Testing & Quality Standards: [testing-and-quality.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/testing-and-quality.md)
- Known Technical Constraints: [known-technical-constraints.md](file:///home/qwerty/Qwerty_WorkSpace/ProjWorks/Poo%20anna/Ryo%20Academy/Backend/docs/agent-context/known-technical-constraints.md)
