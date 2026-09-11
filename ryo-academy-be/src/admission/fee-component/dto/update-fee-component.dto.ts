import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class UpdateFeeComponentDto {

    @ApiProperty({
        description: 'Name of the fee component, e.g., "Tuition Fee"',
        example: 'Tuition Fee',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Description of the fee component',
        example: 'This fee component covers the tuition fees for the academic year',
        type: String,
    })
    @IsString()
    description?: string;

    @ApiProperty({
        description: 'Amount for the fee component',
        example: 5000,
        type: Number,
    })
    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    amount!: number;

    @ApiProperty({
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