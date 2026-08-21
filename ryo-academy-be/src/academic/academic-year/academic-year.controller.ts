import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AcademicYearService } from './academic-year.service.js';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto.js';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto.js';

@Controller('academic-years')
export class AcademicYearController {
  constructor(
    private readonly academicYearService: AcademicYearService,
  ) {}

  @Post()
  async create(
    @Body() createAcademicYearDto: CreateAcademicYearDto,
  ) {
    return this.academicYearService.create(createAcademicYearDto);
  }

  @Get()
  async findAll() {
    return this.academicYearService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.academicYearService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAcademicYearDto: UpdateAcademicYearDto,
  ) {
    return this.academicYearService.update(id, updateAcademicYearDto);
  }
}