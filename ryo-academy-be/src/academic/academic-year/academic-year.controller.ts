import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AcademicYearService } from './academic-year.service.js';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto.js';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto.js';

@ApiTags('Academic Years')
@Controller('academic-years')
export class AcademicYearController {
  constructor(
    private readonly academicYearService: AcademicYearService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new academic year' })
  @ApiBody({ type: CreateAcademicYearDto })
  @ApiCreatedResponse({ description: 'Academic year created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed, e.g., startDate must be before endDate' })
  @ApiConflictResponse({ description: 'Academic year with same schoolCode and name already exists' })
  async create(
    @Body() createAcademicYearDto: CreateAcademicYearDto,
  ) {
    return this.academicYearService.create(createAcademicYearDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all academic years' })
  @ApiOkResponse({ description: 'List of academic years ordered by schoolCode asc and startDate desc' })
  async findAll() {
    return this.academicYearService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get academic year by ID' })
  @ApiParam({ name: 'id', description: 'Academic year UUID', example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c' })
  @ApiOkResponse({ description: 'Academic year found' })
  @ApiNotFoundResponse({ description: 'Academic year not found' })
  async findOne(@Param('id') id: string) {
    return this.academicYearService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update an academic year. schoolCode is immutable.' })
  @ApiParam({ name: 'id', description: 'Academic year UUID', example: '3f8a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c' })
  @ApiBody({ type: UpdateAcademicYearDto })
  @ApiOkResponse({ description: 'Academic year updated successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed, e.g., startDate must be before endDate' })
  @ApiNotFoundResponse({ description: 'Academic year not found' })
  @ApiConflictResponse({ description: 'Name conflict with existing academic year for same school' })
  async update(
    @Param('id') id: string,
    @Body() updateAcademicYearDto: UpdateAcademicYearDto,
  ) {
    return this.academicYearService.update(id, updateAcademicYearDto);
  }
}
