import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { InstallmentTemplateService } from "./installment-template.service.js";
import { ScheduleCalculatorService } from "./schedule-calculator.service.js";
import { parseMoney } from "../../common/money/money.util.js";
import { CreateInstallmentTemplateDto } from "./dto/create-installment-template.dto.js";
import { CalculateScheduleDto } from "./dto/calculate-schedule.dto.js";

@ApiTags("Installment Templates")
@Controller("installment-templates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InstallmentTemplateController {
  constructor(
    private readonly templateService: InstallmentTemplateService,
    private readonly calculatorService: ScheduleCalculatorService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.INSTALLMENT_TEMPLATE_CREATE)
  @ApiOperation({ summary: "Create a new installment template (College Admin only)" })
  @ApiCreatedResponse({ description: "Installment template created successfully" })
  async create(@Body() dto: CreateInstallmentTemplateDto, @Req() req: any) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.templateService.create(dto, actorUserId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INSTALLMENT_TEMPLATE_READ)
  @ApiOperation({ summary: "List installment templates for the school (College Admin & Office Admin)" })
  @ApiOkResponse({ description: "List of installment templates" })
  async findAll(@Req() req: any, @Query("includeInactive") includeInactive?: string) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.templateService.findAll(actorUserId, includeInactive === "true");
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_TEMPLATE_READ)
  @ApiOperation({ summary: "Get installment template by ID (College Admin & Office Admin)" })
  @ApiOkResponse({ description: "Installment template found" })
  async findById(@Param("id") id: string, @Req() req: any) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.templateService.findById(id, actorUserId);
  }

  @Patch(":id/deactivate")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_TEMPLATE_DEACTIVATE)
  @ApiOperation({ summary: "Soft-deactivate an installment template (College Admin only)" })
  @ApiOkResponse({ description: "Installment template deactivated successfully" })
  async deactivate(@Param("id") id: string, @Req() req: any) {
    const actorUserId = req.user?.userId ?? req.user?.id;
    return this.templateService.deactivate(id, actorUserId);
  }

  @Post("calculate-schedule")
  @RequirePermissions(PERMISSIONS.INSTALLMENT_TEMPLATE_READ)
  @ApiOperation({ summary: "Simulate and calculate installment schedule amounts and due dates" })
  @ApiOkResponse({ description: "Calculated schedule returned" })
  async calculateSchedule(@Body() dto: CalculateScheduleDto, @Req() req: any) {
    const actorUserId = req.user?.userId ?? req.user?.id;

    let templateInput: any = dto.manualTemplate;
    if (dto.templateId) {
      const template = await this.templateService.findById(dto.templateId, actorUserId);
      if (!template.isActive) {
        throw new BadRequestException(
          "Deactivated installment template cannot be used for new schedule calculations.",
        );
      }
      templateInput = {
        calculationType: template.calculationType,
        installmentCount: template.installmentCount,
        items: template.items,
      };
    } else if (!templateInput) {
      throw new BadRequestException("Either templateId or manualTemplate must be provided.");
    }

    return this.calculatorService.calculateSchedule(
      parseMoney(dto.netAmount, 'netAmount'),
      templateInput,
      dto.firstDueDate,
      dto.allowFinalAbsorption ?? false,
    );
  }
}
