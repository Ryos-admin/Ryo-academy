import { Module } from '@nestjs/common';
import { ProtectedController } from './protected.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenModule } from '../security/token/access-token.module.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';

/**
 * Module exposing a minimal protected endpoint.
 * Imports JwtModule (provides JwtService) and AccessTokenModule so that
 * JwtAuthGuard can resolve its dependencies.
 * Also provides AuthorizationService and PermissionsGuard for RBAC checks.
 */
@Module({
  imports: [JwtModule.register({}), AccessTokenModule],
  controllers: [ProtectedController],
  providers: [AuthorizationService, PermissionsGuard],
})
export class ProtectedModule {}
