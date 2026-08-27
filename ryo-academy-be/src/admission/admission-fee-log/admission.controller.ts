import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdmissionService } from "./admission.service.js";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto } from "./dto/update-admission.dto.js";

@ApiTags('Admission')
@Controller('admission')
export class AdmissionController {
    constructor(private readonly admissionService: AdmissionService) {}

    @Get()
    @ApiOperation({ summary: 'List all admissions' })
    @ApiOkResponse({ description: 'List of admissions' })
    async findAllAdmissions() {
        return await this.admissionService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get admission by ID' })
    @ApiOkResponse({ description: 'Admission found' })
    @ApiBadRequestResponse({ description: 'Admission not found' })
    async findAdmissionById(@Param('id') id: string) {
        return await this.admissionService.findById(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new admission' })
    @ApiBody({ type: CreateAdmissionDto })
    @ApiOkResponse({ description: 'Admission created successfully' })
    @ApiConflictResponse({ description: 'Admission with same number already exists for the academic year' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., admission with same number already exists for the academic year' })
    async createAdmission(@Body() createAdmissionDto: CreateAdmissionDto) {
        return await this.admissionService.create(createAdmissionDto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing admission by ID' })
    @ApiBody({ type: UpdateAdmissionDto })
    @ApiOkResponse({ description: 'Admission updated successfully' })
    @ApiConflictResponse({ description: 'Admission with same number already exists for the academic year' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., admission with same number already exists for the academic year' })
    async updateAdmission(@Param('id') id: string, @Body() updateAdmissionDto: UpdateAdmissionDto) {
        return await this.admissionService.updateById(id, updateAdmissionDto);
    }


    @Post(':id/confirmed')
    @ApiOperation({ summary: 'Update the status of an admission to confirmed' })
    @ApiOkResponse({ description: 'Admission status updated to confirmed successfully' })
    @ApiBadRequestResponse({ description: 'Admission not found or status update failed' })
    @ApiConflictResponse({ description: 'Admission status update conflict, e.g., already confirmed or cancelled' })
    async admissionConfirmed(@Param('id') id: string) {
        return await this.admissionService.updateStatusById(id, 'CONFIRMED');
    }

    @Post(':id/cancelled')
    @ApiOperation({ summary: 'Update the status of an admission to cancelled' })
    @ApiOkResponse({ description: 'Admission status updated to cancelled successfully' })
    @ApiBadRequestResponse({ description: 'Admission not found or status update failed' })
    @ApiConflictResponse({ description: 'Admission status update conflict, e.g., already confirmed or cancelled' })
    async admissionCancelled(@Param('id') id: string) {
        return await this.admissionService.updateStatusById(id, 'CANCELLED');
    }
}
