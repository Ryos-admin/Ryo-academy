import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdmissionService } from "./admission.service.js";
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto } from "./dto/update-admission.dto.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";

@ApiTags('Admission')
@Controller('admission')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionController {
    constructor(private readonly admissionService: AdmissionService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.ADMISSION_READ)
    @ApiOperation({ summary: 'List all admissions' })
    @ApiOkResponse({ description: 'List of admissions' })
    async findAllAdmissions() {
        return await this.admissionService.findAll();
    }

    @Get(':id')
    @RequirePermissions(PERMISSIONS.ADMISSION_READ)
    @ApiOperation({ summary: 'Get admission by ID' })
    @ApiOkResponse({ description: 'Admission found' })
    @ApiBadRequestResponse({ description: 'Admission not found' })
    async findAdmissionById(@Param('id') id: string) {
        return await this.admissionService.findById(id);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
    @ApiOperation({ summary: 'Create a new admission' })
    @ApiBody({ type: CreateAdmissionDto })
    @ApiOkResponse({ description: 'Admission created successfully' })
    @ApiConflictResponse({ description: 'Admission with same number already exists for the academic year' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., admission with same number already exists for the academic year' })
    async createAdmission(@Body() createAdmissionDto: CreateAdmissionDto) {
        return await this.admissionService.create(createAdmissionDto);
    }

    @Patch(':id')
    @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
    @ApiOperation({ summary: 'Update an existing admission by ID' })
    @ApiBody({ type: UpdateAdmissionDto })
    @ApiOkResponse({ description: 'Admission updated successfully' })
    @ApiConflictResponse({ description: 'Admission with same number already exists for the academic year' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., admission with same number already exists for the academic year' })
    async updateAdmission(@Param('id') id: string, @Body() updateAdmissionDto: UpdateAdmissionDto) {
        return await this.admissionService.updateById(id, updateAdmissionDto);
    }


    @Post(':id/confirmed')
    @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
    @ApiOperation({ summary: 'Update the status of an admission to confirmed' })
    @ApiOkResponse({ description: 'Admission status updated to confirmed successfully' })
    @ApiBadRequestResponse({ description: 'Admission not found or status update failed' })
    @ApiConflictResponse({ description: 'Admission status update conflict, e.g., already confirmed or cancelled' })
    async admissionConfirmed(@Param('id') id: string) {
        return await this.admissionService.updateStatusById(id, 'CONFIRMED');
    }

    @Post(':id/cancelled')
    @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
    @ApiOperation({ summary: 'Update the status of an admission to cancelled' })
    @ApiOkResponse({ description: 'Admission status updated to cancelled successfully' })
    @ApiBadRequestResponse({ description: 'Admission not found or status update failed' })
    @ApiConflictResponse({ description: 'Admission status update conflict, e.g., already confirmed or cancelled' })
    async admissionCancelled(@Param('id') id: string) {
        return await this.admissionService.updateStatusById(id, 'CANCELLED');
    }
}
