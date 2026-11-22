import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type.js';
import { SchoolsService } from './schools.service.js';
import { UpdateSchoolConfigurationDto } from './dto/update-school-configuration.dto.js';
import { SchoolConfigurationResponseDto } from './dto/school-configuration-response.dto.js';

@ApiTags('Schools')
@ApiBearerAuth()
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get('configuration')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current school operational configuration' })
  @ApiOkResponse({
    description: 'Current school configuration returned',
    type: SchoolConfigurationResponseDto,
  })
  @ApiForbiddenResponse({ description: 'User or school is inactive, deleted, or unassociated' })
  @ApiNotFoundResponse({ description: 'School not found' })
  async getConfiguration(@CurrentUser() user: AuthenticatedUser): Promise<SchoolConfigurationResponseDto> {
    const schoolId = await this.schoolsService.resolveActiveSchool(user.userId);
    return this.schoolsService.getConfiguration(schoolId);
  }

  @Patch('configuration')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SCHOOL_UPDATE)
  @ApiOperation({ summary: 'Update the active academic year for the school' })
  @ApiOkResponse({
    description: 'School configuration updated successfully',
    type: SchoolConfigurationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed, cross-school reference, or soft-deleted/inactive academic year',
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions or inactive school' })
  @ApiNotFoundResponse({ description: 'Academic year or school not found' })
  async updateConfiguration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSchoolConfigurationDto,
  ): Promise<SchoolConfigurationResponseDto> {
    const schoolId = await this.schoolsService.resolveActiveSchool(user.userId);
    console.log('Academic Year fetched:', schoolId, user, dto);

    return this.schoolsService.updateConfiguration(schoolId, dto);
  }
}
