import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CreateInstallmentTemplateDto } from "./create-installment-template.dto.js";
import { IsMoneyString } from "../../../common/money/money.util.js";

export class CalculateScheduleDto {
  @ApiProperty({ example: "100000.00", description: "Admission net payable amount to divide into installments", type: String })
  @IsMoneyString()
  netAmount!: string;

  @ApiPropertyOptional({ example: "template-uuid", description: "Referenced template ID (if using an existing template)" })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({
    type: CreateInstallmentTemplateDto,
    description: "Inline manual template definition (if testing or using a custom schedule)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInstallmentTemplateDto)
  manualTemplate?: CreateInstallmentTemplateDto;

  @ApiProperty({ example: "2026-06-15", description: "First installment due date in strict YYYY-MM-DD format" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "firstDueDate must be a strict date-only string in YYYY-MM-DD format",
  })
  firstDueDate!: string;

  @ApiPropertyOptional({
    example: true,
    description: "Whether the final installment absorbs differences in fixed-amount templates (defaults to false)",
  })
  @IsOptional()
  @IsBoolean()
  allowFinalAbsorption?: boolean;
}
