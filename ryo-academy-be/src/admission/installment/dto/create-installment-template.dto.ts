import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { InstallmentCalculationType } from "../../../../generated/prisma/enums.js";
import { CreateInstallmentTemplateItemDto } from "./create-installment-template-item.dto.js";

export class CreateInstallmentTemplateDto {
  @ApiProperty({ example: "Three-Term Standard Plan", description: "Template name (unique within school case-insensitively)" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "Standard 3-term payment schedule (50/30/20)", description: "Optional template description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: InstallmentCalculationType,
    example: InstallmentCalculationType.PERCENTAGE,
    description: "Calculation mode: PERCENTAGE, CUSTOM_AMOUNT, or EQUAL_SPLIT",
  })
  @IsEnum(InstallmentCalculationType)
  calculationType!: InstallmentCalculationType;

  @ApiProperty({ example: 3, description: "Total number of installments configured in template" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentCount!: number;

  @ApiPropertyOptional({ example: "school-uuid", description: "School ID (derived from JWT if omitted)" })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiProperty({
    type: [CreateInstallmentTemplateItemDto],
    description: "Ordered template installment items defining sequence, label, interval, and split",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInstallmentTemplateItemDto)
  items!: CreateInstallmentTemplateItemDto[];
}
