import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsPostalCode,
  IsString,
} from 'class-validator';
import { Gender, Relation } from '../../../../generated/prisma/enums.js';

export class CreateFeePaymentDetailsDto {
  @ApiProperty({
    description:
      'ID of the fee payment header associated with the fee payment detail',
    example: 'fee-payment-header-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  feePaymentHeaderId!: string;

  @ApiProperty({
    description:
      'ID of the fee component associated with the fee payment detail',
    example: 'fee-component-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  feeComponentId!: string;

  @ApiProperty({
    description:
      'Name of the fee component associated with the fee payment detail',
    example: 'Tuition Fee',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  nameSnapshot!: string;

  @ApiProperty({
    description: 'Original amount of the fee component before any discounts',
    example: 1000.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  originalAmount!: number;

  @ApiProperty({
    description: 'Discount amount of the fee component before any discounts',
    example: 100.0,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber()
  discountAmount!: number;

  @ApiProperty({
    description: 'Discount applicable of the fee component',
    type: Boolean,
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  discountApplicable!: boolean;

  @ApiProperty({
    description: 'Is mandate from the fee component',
    example: false,
    type: Boolean,
  })
  @IsNotEmpty()
  @IsBoolean()
  isMandatory!: boolean;

  @ApiProperty({
    description: 'Total Payment Amount againist this component',
    example: 1000,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber()
  amountPaid!: number;

  @ApiProperty({
    description: 'last payment date',
    type: Date,
    example: '10-02-2001',
  })
  @IsNotEmpty()
  @IsDate()
  paymentDate!: Date;
}

export class CreateFeePaymentHeaderDto {
  @ApiProperty({
    description: 'ID of the admission associated with the fee payment',
    example: 'admission-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  admissionId!: string;

  @ApiProperty({
    description: 'ID of the student associated with the fee payment',
    example: 'student-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @ApiProperty({
    description: 'ID of the academic year associated with the fee payment',
    example: '2023-24',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({
    description: 'ID of the academic year associated with the fee payment',
    example: '2023-24',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  programId!: string;

  @ApiProperty({
    description: 'ID of the academic year associated with the fee payment',
    example: '2023-24',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @ApiProperty({
    description:
      'ID of the fee payment master id associated with the fee payment',
    example: 'fee-payment-master-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  feeStructureId!: string;

  @ApiProperty({
    description: 'Gross amount of the fee payment',
    example: 1000.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  grossAmount!: number;

  @ApiProperty({
    description: 'Discount amount applied to the fee payment',
    example: 100.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  discountAmount!: number;

  @ApiProperty({
    description: 'Net amount after discount for the fee payment',
    example: 900.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  netAmount!: number;

  @ApiProperty({
    description: 'Total amount paid for the fee payment',
    example: 900.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  totalPaidAmount!: number;

  @ApiProperty({
    description: 'Total amount due for the fee payment',
    example: 100.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  totalDueAmount!: number;

  @ApiProperty({
    description: 'Total fee amount for the fee payment',
    example: 1000.0,
    type: Number,
  })
  @IsNumber()
  @IsNotEmpty()
  totalFeeAmount!: number;

  @ApiProperty({
    description: 'List of fee payment details associated with the fee payment',
    example: '[]',
    type: () => [CreateFeePaymentDetailsDto],
  })
  @IsNotEmpty()
  @IsObject()
  feePaymentDetails!: CreateFeePaymentDetailsDto[];
}

export class CreateAdmissionDto {
  @ApiProperty({
    description: 'Admission number, e.g., "ADM-2023-001"',
    example: 'ADM-2023-001',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  admissionNumber?: string;

  @ApiProperty({
    description:
      'Admission sequence number, e.g., 1 for the first admission of the year',
    example: 1,
    type: Number,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  admissionSequence?: number;

  @ApiProperty({
    description: 'ID of the academic year for the admission',
    example: '2023-24',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiProperty({
    description: 'ID of the academic year for the admission',
    example: '2023-24',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @ApiProperty({
    description: 'ID of the program for the admission',
    example: 'Day Care',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  programId!: string;

  @ApiProperty({
    description: 'ID of the class for the admission',
    example: 'class-12th',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @ApiProperty({
    description: 'ID of the section for the admission',
    example: 'section-uuid',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @ApiProperty({
    description: 'Name of the student for the admission',
    example: 'John Doe',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  studentName!: string;

  @ApiProperty({
    description: 'Gender of the student',
    example: 'Male',
    enum: Gender,
    type: String,
  })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({
    description: 'Date of birth of the student',
    example: '2010-05-15',
    type: Date,
  })
  @Type(() => Date)
  @IsDate()
  dateOfBirth: Date;

  @ApiProperty({
    description: 'Name of the parent or guardian',
    example: 'Jane Doe',
    type: String,
  })
  @IsString()
  parentName: string;

  @ApiProperty({
    description: 'Relation of the parent or guardian to the student',
    example: 'Mother',
    enum: Relation,
    type: String,
  })
  @IsEnum(Relation)
  parentRelation: Relation;

  @ApiProperty({
    description: 'Phone number of the parent or guardian',
    example: '+1-234-567-8901',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @ApiProperty({
    description: 'Alternate phone number of the parent or guardian',
    example: '+1-234-567-8902',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  parentAlternatePhone: string;

  @ApiProperty({
    description: 'Email address of the parent or guardian',
    example: 'asdh@fdfh.df',
    type: String,
  })
  @IsEmail()
  parentEmail: string;

  @ApiProperty({
    description: 'Address of the student or parent/guardian',
    example: '123 Main St, Springfield, IL, USA, 62704',
    type: String,
  })
  @IsString()
  addressLine1: string;

  @ApiProperty({
    description: 'Additional address information, if any',
    example: 'Apt 4B',
    type: String,
  })
  @IsString()
  addressLine2: string;

  @ApiProperty({
    description: 'City of residence',
    example: 'Springfield',
    type: String,
  })
  @IsString()
  city: string;

  @ApiProperty({
    description: 'State of residence',
    example: 'Illinois',
    type: String,
  })
  @IsString()
  state: string;

  @ApiProperty({
    description: 'Country of residence',
    example: 'USA',
    type: String,
  })
  @IsString()
  country: string;

  @ApiProperty({
    description: 'Postal code of the residence',
    example: '627034',
    type: String,
  })
  @IsPostalCode('any')
  postalCode: string;

  @ApiProperty({
    description: 'ID of the user who created the admission record',
    example: 'user-123',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  createdById!: string;

  @ApiProperty({
    description: 'Array of Fee structure for admission record',
    type: () => [CreateFeePaymentHeaderDto],
    required: false,
  })
  @IsOptional()
  @IsObject()
  feePaymentHeaders?: CreateFeePaymentHeaderDto;
}

export class CreateStudentDto {
  @ApiProperty({
    description: 'Admission number, e.g., "ADM-2023-001"',
    example: 'ADM-2023-001',
  })
  @IsString()
  @IsNotEmpty()
  admissionId!: string;

  @ApiProperty({
    description: 'Admission number, e.g., "ADM-2023-001"',
    example: 'ADM-2023-001',
  })
  studentNumber!: string;

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
}
