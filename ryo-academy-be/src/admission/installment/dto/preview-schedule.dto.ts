import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateManualScheduleDto } from "./create-manual-schedule.dto.js";

export class PreviewScheduleDto {
  @ApiPropertyOptional({ example: "template-uuid", description: "Referenced template ID" })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ type: CreateManualScheduleDto, description: "Inline manual schedule to preview" })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateManualScheduleDto)
  manualSchedule?: CreateManualScheduleDto;

  @ApiPropertyOptional({ example: "2026-06-15", description: "First installment due date (YYYY-MM-DD)" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "firstDueDate must be in strict YYYY-MM-DD date format",
  })
  firstDueDate?: string;

  @ApiPropertyOptional({
    example: false,
    description: "Whether the final installment absorbs differences in fixed amount templates",
  })
  @IsOptional()
  @IsBoolean()
  allowFinalAbsorption?: boolean;

  @ApiPropertyOptional({ example: "header-uuid", description: "Specific fee payment header ID (optional)" })
  @IsOptional()
  @IsString()
  feePaymentHeaderId?: string;
}
