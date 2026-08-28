import { Module } from "@nestjs/common";
import { FeeStructureController } from "./fee-structure.controller.js";
import { FeeStructureService } from "./fee-structure.service.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";

@Module({
    imports: [AccessTokenModule],
    controllers: [FeeStructureController],
    providers: [FeeStructureService, AuthorizationService, PermissionsGuard],
    exports: [FeeStructureService],
})

export class FeeStructureModule {}