import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service.js';
import { CreateStaffDto, createTeachingAssignmentDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto, UpdateStaffStatusDto, UpdateTeachingAssignmentDto } from './dto/update-staff.dto.js';
import { JwtAuthGuard } from '../../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/permissions.guard.js';
import { RequirePermissions } from '../../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../../auth/permissions/permission.constants.js';
@ApiTags('Staff') @ApiBearerAuth() @Controller('staff') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly service: StaffService) {}
  @Get() @RequirePermissions(PERMISSIONS.STAFF_READ) findAll() { return this.service.findAllStaff(); }
  @Get('me') @RequirePermissions(PERMISSIONS.STAFF_READ) me(@Req() req: any) { return this.service.findStaffByUserId(req.user.userId); }
  @Get('me/teaching-assignments') @RequirePermissions(PERMISSIONS.STAFF_READ) myAssignments(@Req() req: any) { return this.service.findStaffByUserId(req.user.userId).then(staff => this.service.findAssignmentsByStaff(staff.id)); }
  @Get(':staffId/teaching-assignments') @RequirePermissions(PERMISSIONS.STAFF_READ) assignmentsByStaff(@Param('staffId') staffId: string) { return this.service.findAssignmentsByStaff(staffId); }
  @Get('assignments') @RequirePermissions(PERMISSIONS.STAFF_READ) assignments() { return this.service.findAssignments(); }
  @Get(':id') @RequirePermissions(PERMISSIONS.STAFF_READ) findOne(@Param('id') id: string) { return this.service.findStaffById(id); }
  @Post() @RequirePermissions(PERMISSIONS.STAFF_CREATE) create(@Body() dto: CreateStaffDto) { return this.service.createStaff(dto); }
  @Patch(':id') @RequirePermissions(PERMISSIONS.STAFF_UPDATE) update(@Param('id') id: string, @Body() dto: UpdateStaffDto) { return this.service.updateStaff(id, dto); }
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.STAFF_UPDATE) updateStatus(@Param('id') id: string, @Body() dto: UpdateStaffStatusDto) { return this.service.updateStatus(id, dto.status); }
  @Post('assignments') @RequirePermissions(PERMISSIONS.STAFF_UPDATE) assign(@Body() dto: createTeachingAssignmentDto) { return this.service.createAssignment(dto); }
  @Patch('assignments/:id') @RequirePermissions(PERMISSIONS.STAFF_UPDATE) updateAssignment(@Param('id') id: string, @Body() dto: UpdateTeachingAssignmentDto) { return this.service.updateAssignment(id, dto); }
  @Delete('assignments/:id') @RequirePermissions(PERMISSIONS.STAFF_UPDATE) deleteAssignment(@Param('id') id: string) { return this.service.deleteAssignment(id); }
}
