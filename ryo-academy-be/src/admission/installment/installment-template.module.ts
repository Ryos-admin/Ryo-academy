import { Module } from "@nestjs/common";
import { AccessTokenModule } from "../../security/token/access-token.module.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { AuthorizationService } from "../../auth/authorization.service.js";
import { InstallmentTemplateController } from "./installment-template.controller.js";
import { InstallmentTemplateService } from "./installment-template.service.js";
import { ScheduleCalculatorService } from "./schedule-calculator.service.js";
import { AdmissionInstallmentScheduleController } from "./admission-installment-schedule.controller.js";
import { AdmissionInstallmentScheduleService } from "./admission-installment-schedule.service.js";
import { InstallmentAllocationService } from "./installment-allocation.service.js";
import { HistoricalOffsetBackfillService } from "./historical-offset-backfill.service.js";

@Module({
  imports: [AccessTokenModule],
  controllers: [
    InstallmentTemplateController,
    AdmissionInstallmentScheduleController,
  ],
  providers: [
    InstallmentTemplateService,
    ScheduleCalculatorService,
    AdmissionInstallmentScheduleService,
    InstallmentAllocationService,
    HistoricalOffsetBackfillService,
    AuthorizationService,
    PermissionsGuard,
  ],
  exports: [
    InstallmentTemplateService,
    ScheduleCalculatorService,
    AdmissionInstallmentScheduleService,
    InstallmentAllocationService,
    HistoricalOffsetBackfillService,
  ],
})
export class InstallmentTemplateModule {}
