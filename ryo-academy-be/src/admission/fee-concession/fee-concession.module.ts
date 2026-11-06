import { Module } from "@nestjs/common";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { FeeConcessionCategoryController } from "./fee-concession-category.controller.js";
import { FeeConcessionCategoryService } from "./fee-concession-category.service.js";
import { AdmissionConcessionService } from "./admission-concession.service.js";

@Module({
  imports: [AccessTokenModule],
  controllers: [FeeConcessionCategoryController],
  providers: [
    FeeConcessionCategoryService,
    AdmissionConcessionService,
    AuthorizationService,
    PermissionsGuard,
  ],
  exports: [FeeConcessionCategoryService, AdmissionConcessionService],
})
export class FeeConcessionModule {}
