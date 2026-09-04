import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsEmail, IsNotEmpty, IsPhoneNumber, IsString } from "class-validator";

export class CreateStaffDto {
    @ApiProperty({
        description: 'Unique code identifying the Staff',
        example: 'Staff-1A',
    })
    @IsString()
    @IsNotEmpty()   
    staffCode!: string;

    @ApiProperty({
        description: 'First name of the Staff',
        example: 'John',
    })
    @IsString()
    @IsNotEmpty()   
    firstName!: string;

    @ApiProperty({
        description: 'Last name of the Staff',
        example: 'Doe',
    })
    @IsString()
    @IsNotEmpty()   
    lastName!: string;

    @ApiProperty({
        description: 'Email of the Staff',
        example: 'dfjsd@sdfsd.df'
    })
    @IsString()
    @IsNotEmpty()  
    @IsEmail() 
    email!: string;

    @ApiProperty({
        description: 'Phone number of the Staff',
        example: '+1234567890',
    })
    @IsString()
    @IsNotEmpty()   
    @IsPhoneNumber()
    phoneNumber!: string;

    @ApiProperty({
        description: 'Date of birth of the Staff',
        example: '1990-01-01',
    })
    @IsString()
    @IsNotEmpty()   
    @IsDateString()
    dateOfBirth!: string;

}

export class createTeachingAssignmentDto {
    @ApiProperty({
        description: 'ID of the Staff assigned to teach',
        example: 'staff-id-123',
    })
    @IsString()
    @IsNotEmpty()   
    staffId!: string;

    @ApiProperty({
        description: 'ID of the Subject assigned to the Staff',
        example: 'subject-id-123',
    })
    @IsString()
    @IsNotEmpty()   
    subjectId!: string;

    @ApiProperty({
        description: 'ID of the Class to which the Staff is assigned',
        example: 'class-id-123',
    })
    @IsString()
    @IsNotEmpty()   
    classId!: string;

    @ApiProperty({
        description: 'ID of the Program to which the Class belongs',
        example: 'program-id-123',
    })
    @IsString()
    @IsNotEmpty()   
    sectionId!: string;
}
