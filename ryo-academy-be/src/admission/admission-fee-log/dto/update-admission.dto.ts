import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDate, IsEmail, IsNotEmpty, IsNumber, IsObject, IsPhoneNumber, IsPostalCode, IsString } from "class-validator";
import { Gender, Relation } from "../../../../generated/prisma/enums.js";



export class UpdateFeePaymentDetailsDto {

    @ApiProperty({
        description: 'ID of the admission associated with the fee payment',
        example: 'admission-123',
    })
    @IsString()
    @IsNotEmpty()
    id!: string;

    @ApiProperty({
        description: 'ID of the fee payment header associated with the fee payment detail',
        example: 'fee-payment-header-123',
    })
    @IsString()
    @IsNotEmpty()
    feePaymentHeaderId!: string;

    @ApiProperty({
        description: 'ID of the fee component associated with the fee payment detail',
        example: 'fee-component-123',
    })
    @IsString()
    @IsNotEmpty()
    feeComponentId!: string;

    @ApiProperty({
        description: 'Original amount of the fee component before any discounts',
        example: 1000.00,
    })
    @IsNumber()
    @IsNotEmpty()
    originalAmount!: number;

    @ApiProperty({
        description: 'Discount amount of the fee component before any discounts',
        example: 100.00
    })
    @IsNotEmpty()
    @IsNumber()
    discountAmount!: number;

    @ApiProperty({
        description: 'Discount applicable of the fee component',
        type: Boolean,
        example: true
    })
    @IsNotEmpty()
    @IsBoolean()
    discountApplicable!: boolean;

    @ApiProperty({
        description: 'Is mandate from the fee component',
        example: false
    })
    @IsNotEmpty()
    @IsBoolean()
    isMandatory!: boolean;

    @ApiProperty({
        description: 'Total Payment Amount againist this component',
        example: 1000
    })
    @IsNotEmpty()
    @IsNumber()
    amountPaid!: number;

    @ApiProperty({
        description: 'last payment date',
        type: Date,
        example: '10-02-2001'
    })
    @IsNotEmpty()
    @IsDate()
    paymentDate!: Date;
}


export class UpdateFeePaymentHeaderDto {

    @ApiProperty({
        description: 'ID of the admission associated with the fee payment',
        example: 'admission-123',
    })
    @IsString()
    @IsNotEmpty()
    id!: string;


    @ApiProperty({
        description: 'ID of the academic year for the admission',
        example: '2023-24',
    })
    @IsString()
    @IsNotEmpty()
    academicYearId!: string;

    @ApiProperty({
        description: 'ID of the admission associated with the fee payment',
        example: 'admission-123',
    })
    @IsString()
    @IsNotEmpty()
    admissionId!: string;

    @ApiProperty({
        description: 'ID of the fee payment master id associated with the fee payment',
        example: 'fee-payment-master-123',
    })
    @IsString()
    @IsNotEmpty()
    feeStructureId!: string;

    @ApiProperty({
        description: 'Gross amount of the fee payment',
        example: 1000.00,
    })
    @IsNumber()
    @IsNotEmpty()
    grossAmount!: number;

    @ApiProperty({
        description: 'Discount amount applied to the fee payment',
        example: 100.00,
    })
    @IsNumber()
    @IsNotEmpty()
    discountAmount!: number;

    @ApiProperty({
        description: 'Net amount after discount for the fee payment',
        example: 900.00,
    })
    @IsNumber()
    @IsNotEmpty()
    netAmount!: number;

    @ApiProperty({
        description: 'Total amount paid for the fee payment',
        example: 900.00,
    })
    @IsNumber()
    @IsNotEmpty()
    totalPaidAmount!: number;

    @ApiProperty({
        description: 'Total amount due for the fee payment',
        example: 100.00,
    })
    @IsNumber()
    @IsNotEmpty()
    totalDueAmount!: number

    @ApiProperty({
        description: 'Total fee amount for the fee payment',
        example: 1000.00,
    })
    @IsNumber()
    @IsNotEmpty()
    totalFeeAmount!: number;

    @ApiProperty({
        description: 'List of fee payment details associated with the fee payment',
        example: "[]",
    })
    @IsNotEmpty()
    @IsObject()
    feePaymentDetails!: UpdateFeePaymentDetailsDto[];
}

export class UpdateAdmissionDto {


    @ApiProperty({
        description: 'Admission number, e.g., "ADM-2023-001"',
        example: 'ADM-2023-001',
    })
    @IsString()
    @IsNotEmpty()
    admissionId!: string;

    @ApiProperty({
        description: 'ID of the program for the admission',
        example: 'Day Care',
    })
    @IsString()
    @IsNotEmpty()
    programId!: string;

    @ApiProperty({
        description: 'ID of the class for the admission',
        example: 'class-12th',
    })
    @IsString()
    @IsNotEmpty()
    classId!: string;

    @ApiProperty({
        description: 'Name of the student for the admission',
        example: 'John Doe',
    })
    @IsString()
    @IsNotEmpty()
    studentName!: string;

    @ApiProperty({
        description: 'Gender of the student',
        example: 'Male',
    })
    gender: Gender;

    @ApiProperty({
        description: 'Date of birth of the student',
        example: '2010-05-15',
    })
    @IsDate()
    dateOfBirth: Date;

    @ApiProperty({
        description: 'Name of the parent or guardian',
        example: 'Jane Doe',
    })
    @IsString()
    parentName: string;

    @ApiProperty({
        description: 'Relation of the parent or guardian to the student',
        example: 'Mother',
    })
    parentRelation: Relation;

    @ApiProperty({
        description: 'Phone number of the parent or guardian',
        example: '+1-234-567-8901',
    })
    @IsPhoneNumber()
    parentPhone: string;

    @ApiProperty({
        description: 'Alternate phone number of the parent or guardian',
        example: '+1-234-567-8902',
    })
    @IsPhoneNumber()
    parentAlternatePhone: string;

    @ApiProperty({
        description: 'Email address of the parent or guardian',
        example: 'asdh@fdfh.df',
    })
    @IsEmail()
    parentEmail: string;

    @ApiProperty({
        description: 'Address of the student or parent/guardian',
        example: '123 Main St, Springfield, IL, USA, 62704',
    })
    @IsString()
    addressLine1: string;

    @ApiProperty({
        description: 'Additional address information, if any',
        example: 'Apt 4B',
    })
    @IsString()
    addressLine2: string;

    @ApiProperty({
        description: 'City of residence',
        example: 'Springfield',
    })
    @IsString() 
    city: string;

    @ApiProperty({
        description: 'State of residence',
        example: 'Illinois',
    })
    @IsString()
    state: string;

    @ApiProperty({
        description: 'Country of residence',
        example: 'USA',
    })
    @IsString()
    country: string;

    @ApiProperty({
        description: 'Postal code of the residence',
        example: '627034',
    })
    @IsPostalCode()
    postalCode: string;
    
    @ApiProperty({
        description: 'Array of Fee structure for admission record',
        type: Object,
    })
    @IsNotEmpty()
    @IsObject()
    feePaymentHeaders!: UpdateFeePaymentHeaderDto
    

}
