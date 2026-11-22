import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, Matches } from "class-validator";

export class SyncFeeStructureDto {
  @ApiPropertyOptional({
    description: "Optional supplementary due date in exact YYYY-MM-DD format (no time or timezone suffixes)",
    example: "2026-12-31",
  })
  @IsOptional()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "supplementaryDueDate must be in exact YYYY-MM-DD format (no time or timezone suffixes)",
  })
  supplementaryDueDate?: string;
}
