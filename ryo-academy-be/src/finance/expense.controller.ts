import { Body, Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseService } from './expense.service.js';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.EXPENSE_CREATE)
  @ApiBody({ type: CreateExpenseDto })
  @ApiCreatedResponse({ description: 'Cash expense posted successfully.' })
  create(@Body() dto: CreateExpenseDto, @Req() request: { user: { userId: string } }) {
    return this.expenseService.create(dto, request.user.userId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EXPENSE_DELETE)
  @ApiNotFoundResponse({ description: 'Expense not found.' })
  @ApiConflictResponse({ description: 'Expense was already deleted.' })
  remove(@Param('id') id: string, @Req() request: { user: { userId: string } }) {
    return this.expenseService.remove(id, request.user.userId);
  }
}
