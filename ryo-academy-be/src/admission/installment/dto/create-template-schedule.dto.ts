import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class CreateTemplateScheduleDto {
  @ApiProperty({ example: "template-uuid", description: "Active installment template ID" })
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: "2026-06-15", description: "First installment due date in strict YYYY-MM-DD format" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "firstDueDate must be in strict YYYY-MM-DD date format",
  })
  firstDueDate!: string;

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
