import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service.js';
import { CreateAttendanceDto } from './dto/create-attendance.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import { UpdateAttendanceDto } from './dto/update-attendance.dto.js';
import { JwtAuthGuard } from '../security/token/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { PERMISSIONS } from '../auth/permissions/permission.constants.js';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}
  @Post() @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK) create(
    @Req() req: Request,
    @Body() dto: CreateAttendanceDto,
  ) {
    return this.service.create(this.userId(req), dto);
  }
  @Get() @RequirePermissions(PERMISSIONS.ATTENDANCE_READ) findAll(
    @Req() req: Request,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.service.findAll(this.userId(req), query);
  }
  @Get('my') @RequirePermissions(PERMISSIONS.ATTENDANCE_READ) findMy(
    @Req() req: Request,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.service.findMy(this.userId(req), query);
  }
  @Post(':id/submit') @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK) submit(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.service.submit(this.userId(req), id);
  }
  @Get(':id') @RequirePermissions(PERMISSIONS.ATTENDANCE_READ) findOne(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.service.findOne(this.userId(req), id);
  }
  @Patch(':id') @RequirePermissions(PERMISSIONS.ATTENDANCE_UPDATE) update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.service.update(this.userId(req), id, dto);
  }
  @Delete(':id') @RequirePermissions(PERMISSIONS.ATTENDANCE_UPDATE) remove(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.service.remove(this.userId(req), id);
  }

  private userId(req: Request): string {
    if (!req.user?.userId)
      throw new UnauthorizedException('Authentication required');
    return req.user.userId;
  }
}
