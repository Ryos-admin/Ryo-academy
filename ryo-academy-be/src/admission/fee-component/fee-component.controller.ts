import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UpdateFeeComponentDto } from "./dto/update-fee-component.dto.js";
import { CreateFeeComponentDto } from "./dto/create-fee-component.dto.js";
import { FeeComponentService } from "./fee-component.service.js";

@ApiTags('Fee Structure Child')
@Controller('fee-structure-child')
export class FeeComponentController {
    constructor(private readonly feeComponentService: FeeComponentService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new fee component' })
    @ApiBody({type: CreateFeeComponentDto})
    @ApiCreatedResponse({ description: 'Fee component created successfully' })
    @ApiConflictResponse({ description: 'Fee component with same name already exists for the fee structure' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., fee component with same name already exists for the fee structure' })
    async createFeeComponent(@Body() createFeeComponentDto: CreateFeeComponentDto) {
        return await this.feeComponentService.create(createFeeComponentDto);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update an existing fee component by ID' })
    @ApiBody({type: UpdateFeeComponentDto})
    @ApiOkResponse({ description: 'Fee component updated successfully' })
    @ApiConflictResponse({ description: 'Fee component with same name already exists for the fee structure' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., fee component with same name already exists for the fee structure' })
    async updateFeeComponent(@Param('id') id: string, @Body() updateFeeComponentDto: UpdateFeeComponentDto) {
        return await this.feeComponentService.update(id, updateFeeComponentDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a fee component by ID' })
    @ApiOkResponse({ description: 'Fee component deleted successfully' })
    @ApiBadRequestResponse({ description: 'Fee component not found' })
    async deleteFeeComponent(@Param('id') id: string) {
        return await this.feeComponentService.delete(id);
    }

    @Get()
    @ApiOperation({ summary: 'List all fee components' })
    @ApiOkResponse({ description: 'List of fee components ordered by name' })
    async findAllFeeComponents() {
        return await this.feeComponentService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get fee component by ID' })
    @ApiOkResponse({ description: 'Fee component found' })
    @ApiBadRequestResponse({ description: 'Fee component not found' })
    async findFeeComponentById(@Param('id') id: string) {
        return await this.feeComponentService.findById(id);
    }
}