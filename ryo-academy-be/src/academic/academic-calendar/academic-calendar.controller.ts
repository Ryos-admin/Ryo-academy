import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AcademicCalendarService } from './academic-calendar.service.js';
import { CreateAcademicCalendarDto } from './dto/create-academic-calendar.dto.js';
import { QueryAcademicCalendarDto } from './dto/query-academic-calendar.dto.js';
import { UpdateAcademicCalendarDto } from './dto/update-academic-calendar.dto.js';
import { SeedAcademicCalendarDto } from './dto/seed-academic-calendar.dto.js';
import { JwtAuthGuard } from '../../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { RequirePermissions } from '../../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions/permission.constants.js';

@ApiTags('Academic Calendar')
@ApiBearerAuth()
@Controller('academic-calendar')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AcademicCalendarController {
  constructor(
    private readonly academicCalendarService: AcademicCalendarService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.SHIFT_CREATE)
  create(@Body() dto: CreateAcademicCalendarDto) {
    return this.academicCalendarService.create(dto);
  }

  @Post('seed')
  @RequirePermissions(PERMISSIONS.SHIFT_CREATE)
  seed(@Body() dto: SeedAcademicCalendarDto) {
    return this.academicCalendarService.seed(dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SHIFT_READ)
  findAll(@Query() query: QueryAcademicCalendarDto) {
    return this.academicCalendarService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_READ)
  findOne(@Param('id') id: string) {
    return this.academicCalendarService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateAcademicCalendarDto) {
    return this.academicCalendarService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SHIFT_UPDATE)
  remove(@Param('id') id: string) {
    return this.academicCalendarService.remove(id);
  }
}
