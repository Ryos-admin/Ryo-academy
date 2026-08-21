import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from 'src/common/types/authenticated-user.type.js';

/**
 * Minimal protected endpoint used to verify JWT authentication and, now, authorization.
 */
@ApiTags('Protected')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('protected')
export class ProtectedController {
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'User profile returned' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('students')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  @ApiOperation({ summary: 'Access students list - requires STUDENT_READ permission' })
  @ApiOkResponse({ description: 'Students endpoint accessed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  getStudents(@Req() req: Request) {
    return { message: 'Students endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/create')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_CREATE)
  @ApiOperation({ summary: 'Access student create - requires STUDENT_CREATE permission' })
  @ApiOkResponse({ description: 'Student create endpoint accessed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  createStudent(@Req() req: Request) {
    return { message: 'Student create endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/update')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_UPDATE)
  @ApiOperation({ summary: 'Access student update - requires STUDENT_UPDATE permission' })
  @ApiOkResponse({ description: 'Student update endpoint accessed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  updateStudent(@Req() req: Request) {
    return { message: 'Student update endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/multi')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_READ, PERMISSIONS.STUDENT_UPDATE)
  @ApiOperation({ summary: 'Access multi-permission endpoint - requires STUDENT_READ and STUDENT_UPDATE' })
  @ApiOkResponse({ description: 'Multi-permission endpoint accessed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  multiPermission(@Req() req: Request) {
    return { message: 'Multi-permission endpoint accessed', userId: (req as any).user?.userId };
  }
}
