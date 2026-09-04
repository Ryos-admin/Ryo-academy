import { Module } from '@nestjs/common';
import { SubjectController } from './subject.controller.js';
import { SubjectService } from './subject.service.js';
import { AccessTokenModule } from '../../security/token/access-token.module.js';
import { AuthorizationService } from '../../auth/authorization.service.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';

@Module({ imports: [AccessTokenModule], controllers: [SubjectController], providers: [SubjectService, AuthorizationService, PermissionsGuard] })
export class SubjectModule {}
