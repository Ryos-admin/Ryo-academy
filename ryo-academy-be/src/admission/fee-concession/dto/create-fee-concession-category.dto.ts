import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateFeeConcessionCategoryDto {
  @ApiProperty({ example: "Sibling Concession" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "SIBLING" })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: "Concession for families with multiple enrolled siblings" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "school-uuid" })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
