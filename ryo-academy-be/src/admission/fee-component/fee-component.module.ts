import { Module } from "@nestjs/common";
import { FeeComponentController } from "./fee-component.controller.js";
import { FeeComponentService } from "./fee-component.service.js";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";

@Module({
    imports: [AccessTokenModule],
    controllers: [FeeComponentController],
    providers: [FeeComponentService, AuthorizationService, PermissionsGuard],
    exports: [FeeComponentService],
})

export class FeeComponentModule {}