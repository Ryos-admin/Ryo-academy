import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import { QueryFinancialLogDto } from './dto/query-financial-log.dto.js';

@Injectable()
export class FinancialLogService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(query: QueryFinancialLogDto, actorUserId: string) {
    const schoolId = await this.schoolFor(actorUserId);
    const where = this.where(query, schoolId);
    const skip = (query.page - 1) * query.pageSize;
    const [rows, total, summary] = await Promise.all([
      this.db.financialLog.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip, take: query.pageSize }),
      this.db.financialLog.count({ where }),
      this.summary(where),
    ]);
    return { data: rows.map((row) => ({ ...row, amount: row.amount.toString() })), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize), summary };
  }

  private async schoolFor(actorUserId: string) {
    const actor = await this.db.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    if (!actor?.schoolId) throw new ForbiddenException('A school-scoped user is required');
    return actor.schoolId;
  }

  private where(query: QueryFinancialLogDto, schoolId: string): Prisma.FinancialLogWhereInput {
    return { schoolId, ...(query.flowType && { flowType: query.flowType }), ...(query.sourceType && { sourceType: query.sourceType }), ...(query.from || query.to ? { occurredAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } } : {}) };
  }

  private async summary(where: Prisma.FinancialLogWhereInput) {
    const incomeWhere = where.flowType === 'EXPENSE' ? { ...where, id: '__no-income-for-flow-filter__' } : where.flowType === 'INCOME' ? where : { ...where, flowType: 'INCOME' as const };
    const expenseWhere = where.flowType === 'INCOME' ? { ...where, id: '__no-expense-for-flow-filter__' } : where.flowType === 'EXPENSE' ? where : { ...where, flowType: 'EXPENSE' as const };
    const [income, expense] = await Promise.all([
      this.db.financialLog.aggregate({ where: incomeWhere, _sum: { amount: true } }),
      this.db.financialLog.aggregate({ where: expenseWhere, _sum: { amount: true } }),
    ]);
    const incomeAmount = income._sum.amount ?? new Prisma.Decimal(0);
    const expenseAmount = expense._sum.amount ?? new Prisma.Decimal(0);
    return { income: incomeAmount.toString(), expenses: expenseAmount.toString(), net: incomeAmount.minus(expenseAmount).toString() };
  }
}
