import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdmissionService } from "./admission.service.js";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApplicableFeeConfigurationQueryDto, CreateAdmissionDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto, UpdateAdmissionFeeConfigurationDto } from "./dto/update-admission.dto.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { AdmissionConcessionService } from "../fee-concession/admission-concession.service.js";
import { CreateAdmissionConcessionDto, UpdateAdmissionConcessionDto } from "../fee-concession/dto/create-admission-concession.dto.js";

@ApiTags("Admission")
@Controller(["admission", "admissions"])
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionController {
  constructor(
    private readonly admissionService: AdmissionService,
    private readonly admissionConcessionService: AdmissionConcessionService,
  ) {}

  @Get("fee-configuration/applicable")
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  @ApiOperation({ summary: "Preview the applicable fee structure and components" })
  @ApiOkResponse({ description: "Applicable fee structure and active components" })
  @ApiBadRequestResponse({ description: "Invalid or incomplete fee-configuration dimensions" })
  @ApiConflictResponse({ description: "Multiple active fee structures match the dimensions" })
  async getApplicableFeeConfiguration(@Query() query: ApplicableFeeConfigurationQueryDto) {
    return this.admissionService.getApplicableFeeConfiguration(query);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  @ApiOperation({ summary: "List all admissions" })
  @ApiOkResponse({ description: "List of admissions" })
  async findAllAdmissions() {
    return await this.admissionService.findAll();
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  @ApiOperation({ summary: "Get admission by ID" })
  @ApiOkResponse({ description: "Admission found" })
  @ApiBadRequestResponse({ description: "Admission not found" })
  async findAdmissionById(@Param("id") id: string) {
    return await this.admissionService.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  @ApiOperation({ summary: "Create a new admission" })
  @ApiBody({ type: CreateAdmissionDto })
  @ApiOkResponse({ description: "Admission created successfully" })
  @ApiConflictResponse({
    description: "Admission with same number already exists for the academic year",
  })
  @ApiBadRequestResponse({
    description:
      "Validation failed, e.g., admission with same number already exists for the academic year",
  })
  async createAdmission(@Body() createAdmissionDto: CreateAdmissionDto) {
    return await this.admissionService.create(createAdmissionDto);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  @ApiOperation({ summary: "Update an existing admission by ID" })
  @ApiBody({ type: UpdateAdmissionDto })
  @ApiOkResponse({ description: "Admission updated successfully" })
  @ApiConflictResponse({
    description: "Admission with same number already exists for the academic year",
  })
  @ApiBadRequestResponse({
    description:
      "Validation failed, e.g., admission with same number already exists for the academic year",
  })
  async updateAdmission(@Param("id") id: string, @Body() updateAdmissionDto: UpdateAdmissionDto) {
    return await this.admissionService.updateById(id, updateAdmissionDto);
  }

  @Get(":id/fee-configuration")
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async getFeeConfiguration(@Param("id") id: string) {
    return this.admissionService.getFeeConfiguration(id);
  }

  @Patch(":id/fee-configuration")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  async updateFeeConfiguration(@Param("id") id: string, @Body() dto: UpdateAdmissionFeeConfigurationDto) {
    return this.admissionService.updateFeeConfiguration(id, dto);
  }

  // @Patch(':id/delete')
  // @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  // @ApiOperation({ summary: 'Delete an admission by ID' })
  // @ApiOkResponse({ description: 'Admission deleted successfully' })
  // @ApiBadRequestResponse({ description: 'Admission not found or deletion failed' })
  // async deleteAdmission(@Param('id') id: string, @CurrentUser() user: any) {
  //     return await this.admissionService.deleteById(id, user);
  // }

  @Post(":id/confirmed")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  @ApiOperation({ summary: "Update the status of an admission to confirmed" })
  @ApiOkResponse({ description: "Admission status updated to confirmed successfully" })
  @ApiBadRequestResponse({ description: "Admission not found or status update failed" })
  @ApiConflictResponse({
    description: "Admission status update conflict, e.g., already confirmed or cancelled",
  })
  async admissionConfirmed(@Param("id") id: string, @CurrentUser() user: any) {
    return await this.admissionService.updateStatusById(id, user, "CONFIRMED");
  }

  @Post(":id/cancelled")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  @ApiOperation({ summary: "Update the status of an admission to cancelled" })
  @ApiOkResponse({ description: "Admission status updated to cancelled successfully" })
  @ApiBadRequestResponse({ description: "Admission not found or status update failed" })
  @ApiConflictResponse({
    description: "Admission status update conflict, e.g., already confirmed or cancelled",
  })
  async admissionCancelled(@Param("id") id: string, @CurrentUser() user: any) {
    return await this.admissionService.updateStatusById(id, user, "CANCELLED");
  }

  @Get(":id/concessions")
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  @ApiOperation({ summary: "Get fee concessions breakdown for an admission" })
  @ApiOkResponse({ description: "Fee concessions breakdown returned successfully" })
  async getAdmissionConcessions(@Param("id") id: string) {
    return await this.admissionConcessionService.getConcessionsForAdmission(id);
  }

  @Post(":id/concessions")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  @ApiOperation({ summary: "Assign a concession to an admission fee component" })
  @ApiBody({ type: CreateAdmissionConcessionDto })
  @ApiOkResponse({ description: "Concession assigned successfully" })
  async assignAdmissionConcession(
    @Param("id") id: string,
    @Body() dto: CreateAdmissionConcessionDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.userId ?? req.user?.id;
    return await this.admissionConcessionService.assignConcession(id, dto, actorId);
  }

  @Patch(":id/concessions/:concessionId")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  async updateAdmissionConcession(@Param("id") id: string, @Param("concessionId") concessionId: string, @Body() dto: UpdateAdmissionConcessionDto, @Req() req: any) {
    return this.admissionConcessionService.updateConcession(id, concessionId, dto, req.user?.userId ?? req.user?.id);
  }


  @Delete(":id/concessions/:concessionId")
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  @ApiOperation({ summary: "Remove a concession from an admission fee component" })
  @ApiOkResponse({ description: "Concession removed successfully" })
  async removeAdmissionConcession(
    @Param("id") id: string,
    @Param("concessionId") concessionId: string,
  ) {
    return await this.admissionConcessionService.removeConcession(id, concessionId);
  }
}
