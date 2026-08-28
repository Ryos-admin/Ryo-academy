import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FeeStructureService } from "./fee-structure.service.js";
import { FeeStructureDto } from "./dto/fee-structure.dto.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";

@ApiTags('Fee Structure Master')
@Controller('fee-structure-master')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeStructureController {
    constructor(private readonly feeStructureService: FeeStructureService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.FEES_READ)
    @ApiOperation({ summary: 'List all fee structures' })
    @ApiOkResponse({ description: 'List of fee structures ordered by academic year and name' })
    async findAllFeeStructure() {
        return await this.feeStructureService.find();
    }

    @Get(':id')
    @RequirePermissions(PERMISSIONS.FEES_READ)
    @ApiOperation({ summary: 'Get fee structure by ID' })
    @ApiOkResponse({ description: 'Fee structure found' })
    @ApiBadRequestResponse({ description: 'Fee structure not found' })
    async findFeeStructureById(@Param('id') id: string) {
        return await this.feeStructureService.findById(id);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.FEES_CREATE)
    @ApiOperation({ summary: 'Create a new fee structure' })
    @ApiBody({type: FeeStructureDto})
    @ApiCreatedResponse({ description: 'Fee structure created successfully' })
    @ApiConflictResponse({ description: 'Fee structure with same name already exists for the academic year' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., fee structure with same name already exists for the academic year' })
    @ApiOkResponse({ description: 'Fee structure created successfully' })
    async createFeeStructure(@Body() createFeeStructureDto: FeeStructureDto) {
        return await this.feeStructureService.create(createFeeStructureDto);
    }

    @Delete(':id')
    @RequirePermissions(PERMISSIONS.FEES_CREATE)
    @ApiOperation({ summary: 'Delete a fee structure by ID' })
    @ApiOkResponse({ description: 'Fee structure deleted successfully' })
    @ApiBadRequestResponse({ description: 'Fee structure not found' })
    async deleteFeeStructure(@Param('id') id: string) {
        return await this.feeStructureService.delete(id);
    }
}