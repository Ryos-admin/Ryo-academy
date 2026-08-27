import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsNumber, isNumber, IsPositive, IsString } from "class-validator";

export class CreateFeeComponentDto {

    @ApiProperty({
        description: 'Name of the fee component, e.g., "Tuition Fee"',
        example: 'Tuition Fee',
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Description of the fee component',
        example: 'This fee component covers the tuition fees for the academic year',
    })
    @IsString()
    description?: string;

    @ApiProperty({
        description: 'Amount for the fee component',
        example: 5000,
    })
    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    amount!: number;

    @ApiProperty({
        description: 'ID of the fee structure to which this fee component belongs',
        example: 'fee-structure-123',
    })

    @IsString()
    @IsNotEmpty()
    feeStructureId!: string;

    @ApiProperty({
        description: 'Indicates whether a discount is applicable to this fee component',
        example: true,
    })
    @IsBoolean()
    discountApplicable?: boolean;

    @ApiProperty({
        description: 'Indicates whether this fee component is mandatory for all students',
        example: true,
    })
    @IsBoolean()
    isMandatory?: boolean;
    
}