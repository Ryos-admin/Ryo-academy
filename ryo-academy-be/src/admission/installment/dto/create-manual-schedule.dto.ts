import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { IsMoneyString } from "../../../common/money/money.util.js";

export class ManualInstallmentItemDto {
  @ApiProperty({ example: 1, description: "Sequential order of the installment (1-based)" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ example: "Term 1", description: "Installment display label" })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ example: "50000.00", description: "Installment amount (strictly positive)", type: String })
  @IsMoneyString()
  amount!: string;

  @ApiProperty({ example: "2026-06-15", description: "Installment due date in strict YYYY-MM-DD format" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "dueDate must be in strict YYYY-MM-DD date format",
  })
  dueDate!: string;
}

export class CreateManualScheduleDto {
  @ApiProperty({
    example: "Special parent fee dispensation approved by director",
    description: "Mandatory justification for custom schedule",
  })
  @IsString()
  @IsNotEmpty({ message: "Justification is mandatory for custom manual installment schedules." })
  justification!: string;

  @ApiProperty({ type: [ManualInstallmentItemDto], description: "List of custom installments" })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualInstallmentItemDto)
  installments!: ManualInstallmentItemDto[];

  @ApiPropertyOptional({ example: "header-uuid", description: "Specific fee payment header ID (optional)" })
  @IsOptional()
  @IsString()
  feePaymentHeaderId?: string;
}
