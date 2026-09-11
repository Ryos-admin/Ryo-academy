import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { StudentAttendanceStatus } from '../../../generated/prisma/enums.js';

export class AttendanceEntryDto {
  @ApiProperty({ example: 'student-uuid', type: String })
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @ApiProperty({ enum: StudentAttendanceStatus, type: String })
  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remarks?: string;
}
