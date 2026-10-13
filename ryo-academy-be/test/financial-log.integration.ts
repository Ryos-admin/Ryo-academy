import assert from 'node:assert/strict';
import { FinancialLogService } from '../src/finance/financial-log.service.js';
import { DatabaseService } from '../src/database/database.service.js';

const databaseUrl = process.env.DATABASE_URL; assert.ok(databaseUrl); const target = new URL(databaseUrl); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432'); assert.equal(target.pathname, '/ryo_qa');
async function main() {
  const db = new DatabaseService({ getOrThrow: () => databaseUrl } as any); await db.$connect(); const ids = { schools: [] as string[], users: [] as string[], logs: [] as string[] };
  const cleanup = async () => db.$transaction(async (tx: any) => { await tx.financialLog.deleteMany({ where: { schoolId: { in: ids.schools } } }); await tx.user.deleteMany({ where: { id: { in: ids.users } } }); await tx.school.deleteMany({ where: { id: { in: ids.schools } } }); });
  try {
    const a = await db.school.create({ data: { name: 'QA Report School A', schoolCode: `QA-REP-A-${Date.now()}` } }); const b = await db.school.create({ data: { name: 'QA Report School B', schoolCode: `QA-REP-B-${Date.now()}` } }); ids.schools.push(a.id, b.id);
    const actor = await db.user.create({ data: { email: `qa-report-${Date.now()}@example.test`, passwordHash: 'fixture-hash', firstName: 'Report', lastName: 'Actor', schoolId: a.id } }); ids.users.push(actor.id);
    const create = async (schoolId: string, flowType: 'INCOME' | 'EXPENSE', type: 'FEE_PAYMENT' | 'EXPENSE' | 'EXPENSE_REVERSAL', amount: number, day: string) => { const row = await db.financialLog.create({ data: { schoolId, userId: actor.id, flowType, type, amount, occurredAt: new Date(`${day}T12:00:00Z`), sourceType: type === 'FEE_PAYMENT' ? 'FEE_PAYMENT' : 'EXPENSE', sourceId: `${schoolId}-${day}-${type}-${amount}` } }); ids.logs.push(row.id); return row; };
    await create(a.id, 'INCOME', 'FEE_PAYMENT', 100, '2026-10-01'); await create(a.id, 'EXPENSE', 'EXPENSE', 40, '2026-10-02'); await create(a.id, 'INCOME', 'EXPENSE_REVERSAL', 10, '2026-10-03'); await create(b.id, 'INCOME', 'FEE_PAYMENT', 999, '2026-10-02');
    const service = new FinancialLogService(db); const report = await service.findAll({ page: 1, pageSize: 2, from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' }, actor.id);
    assert.equal(report.total, 3); assert.equal(report.data.length, 2); assert.equal(report.summary.income, '110'); assert.equal(report.summary.expenses, '40'); assert.equal(report.summary.net, '70'); assert.ok(report.data[0].occurredAt >= report.data[1].occurredAt);
    const expenses = await service.findAll({ page: 1, pageSize: 10, flowType: 'EXPENSE' }, actor.id); assert.equal(expenses.total, 1); assert.equal(expenses.summary.net, '-40');
    const empty = await service.findAll({ page: 1, pageSize: 10, from: '2025-01-01T00:00:00Z', to: '2025-01-31T23:59:59Z' }, actor.id); assert.equal(empty.total, 0); assert.deepEqual(empty.summary, { income: '0', expenses: '0', net: '0' });
    await assert.rejects(() => service.findAll({ page: 1, pageSize: 10 }, 'missing-actor'));
    console.log('FINANCIAL_LOG_INTEGRATION_PASS');
  } finally { await cleanup(); await db.$disconnect(); }
}
main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; });
