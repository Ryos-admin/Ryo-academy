import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ManualInstallmentItemDto } from "./create-manual-schedule.dto.js";

export class UpdateDraftScheduleDto {
  @ApiProperty({
    type: [ManualInstallmentItemDto],
    description: "Updated list of installments for the DRAFT schedule",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualInstallmentItemDto)
  installments!: ManualInstallmentItemDto[];

  @ApiPropertyOptional({
    example: "Adjusted terms for parent request",
    description: "Reason for updating the DRAFT schedule",
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: "header-uuid", description: "Specific fee payment header ID (optional)" })
  @IsOptional()
  @IsString()
  feePaymentHeaderId?: string;
}
