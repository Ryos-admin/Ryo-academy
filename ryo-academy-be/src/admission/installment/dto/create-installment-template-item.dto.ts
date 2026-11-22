import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsMoneyString } from "../../../common/money/money.util.js";

export class CreateInstallmentTemplateItemDto {
  @ApiProperty({ example: 1, description: "Sequential position of the installment (1-based)" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ example: "Term 1", description: "Display label for this installment" })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ example: 50.0, description: "Percentage of total obligation (required for PERCENTAGE calculation)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  percentage?: number;

  @ApiPropertyOptional({ example: "25000.00", description: "Fixed installment amount (required for CUSTOM_AMOUNT calculation)", type: String })
  @IsOptional()
  @IsMoneyString()
  fixedAmount?: string;

  @ApiPropertyOptional({
    example: 30,
    description: "Interval in days after the previous installment (for sequence 1, typically 0)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  intervalDaysAfterPrevious?: number;

  @ApiPropertyOptional({
    example: 30,
    description: "Backward-compatible alias for intervalDaysAfterPrevious",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dueDaysAfterAdmission?: number;
}
