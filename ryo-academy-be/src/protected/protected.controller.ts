import { Controller, Get, UseGuards, Req } from '@nestjs/common';
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
@UseGuards(JwtAuthGuard)
@Controller('protected')
export class ProtectedController {
  // @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    // The guard attaches { userId } to request.user
    return user;
  }

  @Get('students')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_READ)
  getStudents(@Req() req: Request) {
    // Static response for demonstration; actual business logic omitted.
    return { message: 'Students endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/create')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_CREATE)
  createStudent(@Req() req: Request) {
    return { message: 'Student create endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/update')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_UPDATE)
  updateStudent(@Req() req: Request) {
    return { message: 'Student update endpoint accessed', userId: (req as any).user?.userId };
  }

  @Get('students/multi')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.STUDENT_READ, PERMISSIONS.STUDENT_UPDATE)
  multiPermission(@Req() req: Request) {
    return { message: 'Multi-permission endpoint accessed', userId: (req as any).user?.userId };
  }
}
