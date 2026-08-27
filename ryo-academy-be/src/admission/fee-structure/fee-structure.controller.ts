import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FeeStructureService } from "./fee-structure.service.js";
import { FeeStructureDto } from "./dto/fee-structure.dto.js";

@ApiTags('Fee Structure Master')
@Controller('fee-structure-master')
export class FeeStructureController {
    constructor(private readonly feeStructureService: FeeStructureService) {}

    @Get()
    @ApiOperation({ summary: 'List all fee structures' })
    @ApiOkResponse({ description: 'List of fee structures ordered by academic year and name' })
    async findAllFeeStructure() {
        return await this.feeStructureService.find();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get fee structure by ID' })
    @ApiOkResponse({ description: 'Fee structure found' })
    @ApiBadRequestResponse({ description: 'Fee structure not found' })
    async findFeeStructureById(@Param('id') id: string) {
        return await this.feeStructureService.findById(id);
    }

    @Post()
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
    @ApiOperation({ summary: 'Delete a fee structure by ID' })
    @ApiOkResponse({ description: 'Fee structure deleted successfully' })
    @ApiBadRequestResponse({ description: 'Fee structure not found' })
    async deleteFeeStructure(@Param('id') id: string) {
        return await this.feeStructureService.delete(id);
    }
}