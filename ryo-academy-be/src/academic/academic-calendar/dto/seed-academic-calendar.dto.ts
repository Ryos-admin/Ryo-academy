import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export enum WeekdayDto {
  MONDAY = "MONDAY",
  TUESDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}

export interface WeeklyScheduleDto {
  dayOfWeek: WeekdayDto;
  isWorkingDay: boolean;
}

export class SeedAcademicCalendarDto {
  @ApiProperty({ example: "academic-year-uuid", type: String })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({
    enum: WeekdayDto,
    isArray: true,
    type: [String],
    example: ["SATURDAY", "SUNDAY"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(WeekdayDto, { each: true })
  weeklyOffDays!: WeekdayDto[];

  @ApiPropertyOptional({ example: "2024-01-01", type: String })
  @IsOptional()
  startDate?: Date | string;

  @ApiPropertyOptional({ example: "2024-12-31", type: String })
  @IsOptional()
  endDate?: Date | string;
}
