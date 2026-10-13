import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import { QueryFinancialLogDto } from './dto/query-financial-log.dto.js';
import { FinancialLogService } from './financial-log.service.js';

@ApiTags('Financial Logs')
@ApiBearerAuth()
@Controller('financial-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialLogController {
  constructor(private readonly financialLogService: FinancialLogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOkResponse({ description: 'School-scoped read-only financial log report.' })
  findAll(@Query() query: QueryFinancialLogDto, @Req() request: { user: { userId: string } }) {
    return this.financialLogService.findAll(query, request.user.userId);
  }
}
