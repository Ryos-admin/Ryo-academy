import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubjectService } from './subject.service.js';
import { CreateSubjectDto } from './dto/create-subject.dto.js';
import { UpdateSubjectDto } from './dto/update-subject.dto.js';
import { JwtAuthGuard } from '../../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { RequirePermissions } from '../../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions/permission.constants.js';

@ApiTags('Subjects')
@ApiBearerAuth()
@Controller('subjects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubjectController {
  constructor(private readonly service: SubjectService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.SUBJECT_CREATE)
  create(@Body() dto: CreateSubjectDto) { return this.service.create(dto); }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUBJECT_READ)
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUBJECT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUBJECT_UPDATE)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
