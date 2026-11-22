import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type.js';
import { FeeManagementService } from './fee-management.service.js';
import { QueryFeeDashboardDto } from './dto/query-fee-dashboard.dto.js';
import { FeeDashboardResponseDto } from './dto/fee-dashboard-response.dto.js';

@ApiTags('Fee Management')
@ApiBearerAuth()
@Controller('fee-management')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeManagementController {
  constructor(private readonly feeManagementService: FeeManagementService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: 'Get fee management dashboard admissions for active academic year' })
  @ApiOkResponse({
    description: 'Fee management dashboard data returned',
    type: FeeDashboardResponseDto,
  })
  @ApiForbiddenResponse({ description: 'User or school is inactive, deleted, or lacks FEES_READ' })
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryFeeDashboardDto,
  ): Promise<FeeDashboardResponseDto> {
    return this.feeManagementService.getDashboard(user.userId, query);
  }
}
