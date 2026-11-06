import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { IsMoneyString } from "../../../common/money/money.util.js";

export class UpdateFeeComponentDto {

    @ApiPropertyOptional({
        description: 'Name of the fee component, e.g., "Tuition Fee"',
        example: 'Tuition Fee',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Description of the fee component',
        example: 'This fee component covers the tuition fees for the academic year',
        type: String,
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description: 'Amount for the fee component',
        example: "5000.00",
        type: String,
    })
    @IsOptional()
    @IsMoneyString()
    amount?: string;

    @ApiPropertyOptional({
        description: 'Indicates whether a discount is applicable to this fee component',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    discountApplicable?: boolean;

    @ApiPropertyOptional({
        description: 'Indicates whether this fee component is mandatory for all students',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isMandatory?: boolean;
    
}
