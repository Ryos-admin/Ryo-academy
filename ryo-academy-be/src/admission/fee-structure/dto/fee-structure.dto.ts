import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class FeeStructureDto {
    @ApiProperty({
        description: 'Fee Structure name, e.g., "Standard Fee Structure"',
        example: 'Standard Fee Structure',
    })
    @IsString()
    @IsNotEmpty() 
    name: string;

    @ApiProperty({
        description: 'Description of the fee structure',
        example: 'This is the standard fee structure for the current academic year',
    })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({
        description: 'ID of the academic year to which this fee structure belongs',
        example: '2027-28',
    })
    @IsString()
    @IsNotEmpty()
    academicYearId: string;

    @ApiProperty({
        description: 'ID of the program to which this fee structure belongs',
        example: 'Day Care',
    })
    @IsString()
    @IsNotEmpty()
    programId: string;

    @ApiProperty({
        description: 'ID of the class to which this fee structure belongs',
        example: 'class-12th',
    })
    @IsString()
    @IsNotEmpty()
    classId: string;

    @ApiProperty({
        description: 'Total amount for the fee structure',  
        example: 10000,
    })
    @IsString()
    @IsNotEmpty()
    totalAmount: Number;

    @ApiProperty({
        description: 'List of fee components associated with this fee structure',
        example: [
            { name: 'Tuition Fee', amount: 5000 },
            { name: 'Library Fee', amount: 2000 },
            { name: 'Lab Fee', amount: 3000 },
        ],
    })
    @IsNotEmpty()
    feeComponents: Object[];


    
}