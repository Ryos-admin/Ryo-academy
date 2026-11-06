import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";
import { AdmissionInstallmentScheduleService } from "./admission-installment-schedule.service.js";
import { CreateTemplateScheduleDto } from "./dto/create-template-schedule.dto.js";
import { CreateManualScheduleDto } from "./dto/create-manual-schedule.dto.js";
import { UpdateDraftScheduleDto } from "./dto/update-draft-schedule.dto.js";
import { PreviewScheduleDto } from "./dto/preview-schedule.dto.js";

@ApiTags("Admission Installment Schedules")
@Controller(["admissions/:id/installment-schedule", "admission-installment-schedules/:id"])
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionInstallmentScheduleController {
  constructor(
    private readonly scheduleService: AdmissionInstallmentScheduleService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_READ)
  @ApiOperation({ summary: "Get installment schedule for an admission" })
  @ApiOkResponse({ description: "Schedule retrieved successfully" })
  async getSchedule(
    @Param("id") id: string,
    @Req() req: any,
    @Query("feePaymentHeaderId") feePaymentHeaderId?: string,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.getSchedule(id, actorUserId, feePaymentHeaderId);
  }

  @Get("lineage")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_READ)
  @ApiOperation({ summary: "Get installment schedule lineage and history for an admission" })
  @ApiOkResponse({ description: "Schedule lineage history retrieved successfully" })
  async getScheduleLineage(
    @Param("id") id: string,
    @Req() req: any,
    @Query("feePaymentHeaderId") feePaymentHeaderId?: string,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.getScheduleLineage(id, actorUserId, feePaymentHeaderId);
  }

  @Post("preview")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_READ)
  @ApiOperation({ summary: "Preview an installment schedule configuration against the admission obligation" })
  @ApiOkResponse({ description: "Schedule preview calculated successfully" })
  async previewSchedule(
    @Param("id") id: string,
    @Body() dto: PreviewScheduleDto,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.preview(id, dto, actorUserId);
  }

  @Post("template")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_MANAGE)
  @ApiOperation({ summary: "Create an admission installment schedule from an active template (Office Admin only)" })
  @ApiCreatedResponse({ description: "Schedule created from template successfully" })
  async createFromTemplate(
    @Param("id") id: string,
    @Body() dto: CreateTemplateScheduleDto,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.createFromTemplate(id, dto, actorUserId);
  }

  @Post("manual")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_MANAGE)
  @ApiOperation({ summary: "Create a custom manual admission installment schedule with justification (Office Admin only)" })
  @ApiCreatedResponse({ description: "Custom manual schedule created successfully" })
  async createManual(
    @Param("id") id: string,
    @Body() dto: CreateManualScheduleDto,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.createManual(id, dto, actorUserId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.INSTALLMENT_SCHEDULE_MANAGE)
  @ApiOperation({ summary: "Update / replace installments for a DRAFT schedule (Office Admin only)" })
  @ApiOkResponse({ description: "DRAFT schedule updated successfully" })
  async updateDraftSchedule(
    @Param("id") id: string,
    @Body() dto: UpdateDraftScheduleDto,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.scheduleService.updateDraftSchedule(id, dto, actorUserId);
  }
}
