import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from "class-validator";

export class FeeComponentInputDto {
    @ApiProperty({ example: 'Tuition Fee', type: String })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ example: 'Instruction and academic services.', type: String })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 5000, type: Number })
    @IsNumber()
    @IsPositive()
    amount!: number;

    @ApiPropertyOptional({ example: true, type: Boolean })
    @IsOptional()
    @IsBoolean()
    discountApplicable?: boolean;

    @ApiPropertyOptional({ example: true, type: Boolean })
    @IsOptional()
    @IsBoolean()
    isMandatory?: boolean;
}

export class FeeStructureDto {
    @ApiProperty({
        description: 'Fee Structure name, e.g., "Standard Fee Structure"',
        example: 'Standard Fee Structure',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Description of the fee structure',
        example: 'This is the standard fee structure for the current academic year',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    description!: string;

    @ApiProperty({
        description: 'ID of the academic year to which this fee structure belongs',
        example: '2027-28',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    academicYearId!: string;

    @ApiProperty({
        description: 'ID of the program to which this fee structure belongs',
        example: 'Day Care',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    programId!: string;

    @ApiProperty({
        description: 'ID of the class to which this fee structure belongs',
        example: 'class-12th',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    classId!: string;

    @ApiProperty({
        description: 'Total amount for the fee structure',  
        example: 10000,
        type: Number,
    })
    @IsNumber()
    @IsPositive()
    totalAmount!: number;

    @ApiProperty({
        description: 'List of fee components associated with this fee structure',
        type: () => FeeComponentInputDto,
        isArray: true,
        example: [
            { name: 'Tuition Fee', amount: 5000 },
            { name: 'Library Fee', amount: 2000 },
            { name: 'Lab Fee', amount: 3000 },
        ],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => FeeComponentInputDto)
    feeComponents!: FeeComponentInputDto[];


    
}