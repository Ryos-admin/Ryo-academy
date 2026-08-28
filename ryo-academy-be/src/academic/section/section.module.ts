import { Module } from "@nestjs/common";
import { SectionService } from "./section.service.js";
import { SectionController } from "./section.controller.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";

@Module({
  imports: [AccessTokenModule],
  controllers: [SectionController],
  providers: [SectionService, AuthorizationService, PermissionsGuard],
  exports: [SectionService],
})
export class SectionModule {}