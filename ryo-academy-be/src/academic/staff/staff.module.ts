import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { UsersModule } from '../../users/users.module.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { AuthorizationService } from '../../auth/authorization.service.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
@Module({ imports: [UsersModule, AccessTokenModule], controllers: [StaffController], providers: [StaffService, AuthorizationService, PermissionsGuard] })
export class StaffModule {}
