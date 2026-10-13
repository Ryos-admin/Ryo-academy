import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';

@Injectable()
export class ExpenseService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateExpenseDto, actorUserId: string) {
    const actor = await this.db.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    const schoolId = actor?.schoolId;
    if (!schoolId) throw new ForbiddenException('A school-scoped user is required');
    const amount = new Prisma.Decimal(dto.amount.toString());
    const occurredAt = new Date(dto.occurredAt);
    if (amount.lte(0) || Number.isNaN(occurredAt.getTime())) throw new ConflictException('Invalid expense amount or occurrence date.');

    return this.db.$transaction(async (tx) => {
      const expense = await tx.expense.create({ data: { schoolId, userId: actorUserId, category: dto.category, amount, occurredAt, description: dto.description } });
      await this.createFinancialLog(tx, { data: { schoolId, userId: actorUserId, type: 'EXPENSE', flowType: 'EXPENSE', amount, occurredAt, description: dto.description, sourceType: 'EXPENSE', sourceId: expense.id } });
      return expense;
    });
  }

  async remove(id: string, actorUserId: string) {
    const actor = await this.db.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    const schoolId = actor?.schoolId;
    if (!schoolId) throw new ForbiddenException('A school-scoped user is required');
    const expense = await this.db.expense.findFirst({ where: { id, schoolId } });
    if (!expense) throw new NotFoundException(`Expense with id "${id}" not found`);
    if (!expense.isActive || expense.deletedAt) throw new ConflictException('Expense has already been deleted.');

    const deletedAt = new Date();
    return this.db.$transaction(async (tx) => {
      const deleted = await tx.expense.update({ where: { id }, data: { isActive: false, deletedAt, deletedById: actorUserId } });
      await this.createFinancialLog(tx, { data: { schoolId, userId: actorUserId, type: 'EXPENSE_REVERSAL', flowType: 'INCOME', amount: expense.amount, occurredAt: deletedAt, description: `Reversal for expense ${expense.id}`, sourceType: 'EXPENSE', sourceId: expense.id } });
      return deleted;
    });
  }

  protected createFinancialLog(tx: any, data: any) {
    return tx.financialLog.create(data);
  }
}
