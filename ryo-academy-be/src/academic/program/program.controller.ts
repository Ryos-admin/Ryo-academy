import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProgramService } from "./program.service.js";
import { CreateProgramDto } from "./dto/create-program.dto.js";
import { UpdateProgramDto } from "./dto/update-program.dto.js";

@ApiTags('Programs')
@Controller('programs')
export class ProgramController {
    constructor(private readonly programService: ProgramService) {}

    @Get()
    @ApiOperation({ summary: 'List all programs / shifts' })
    @ApiOkResponse({ description: 'List of programs ordered by name asc, academicYear desc, and isPrimary desc' })
    async findAllPrograms() {
        return await this.programService.findAllPrgms();
    }

    @Post()
    @ApiOperation({ summary: 'Create a new program' })
    @ApiBody({ type: CreateProgramDto })
    @ApiCreatedResponse({ description: 'Program created successfully' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., startTime must be before endTime or program with same name already exists for the academic year' })
    @ApiConflictResponse({ description: 'Program with same name already exists for the academic year' })
    async createProgram(@Body() createProgramDto: CreateProgramDto) {
        return await this.programService.createPrgm(createProgramDto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing program' })
    @ApiBody({ type: UpdateProgramDto })
    @ApiOkResponse({ description: 'Program updated successfully' })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., startTime must be before endTime or program with same name already exists for the academic year' })
    @ApiConflictResponse({ description: 'Program with same name already exists for the academic year' })
    async updateProgram(@Param('id') id: string, @Body() updateProgramDto: Partial<UpdateProgramDto>) {
        return await this.programService.updatePrgm(id, updateProgramDto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get program by ID' })
    @ApiOkResponse({ description: 'Program found' })
    @ApiBadRequestResponse({ description: 'Program not found' })
    async findProgramById(@Param('id') id: string) {
        return await this.programService.findPrgmById(id);
    }
}