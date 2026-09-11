import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsEmail, IsNotEmpty, IsPhoneNumber, IsString } from "class-validator";

export class UpdateStaffDto {
    @ApiProperty({
        description: 'Unique code identifying the Staff',
        example: 'STAFF-001',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    staffCode!: string;

    @ApiProperty({
        description: 'First name of the Staff',
        example: 'John',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    firstName!: string;

    @ApiProperty({
        description: 'Last name of the Staff',
        example: 'Doe',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    lastName!: string;

    @ApiProperty({
        description: 'Email address of the Staff',
        example: 'dfdf@jh.dd',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    @IsEmail() 
    email!: string;

    @ApiProperty({
        description: 'Phone number of the Staff',
        example: '+1234567890',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    @IsPhoneNumber()
    phoneNumber!: string;

    @ApiProperty({
        description: 'Date of birth of the Staff',
        example: '1990-01-01',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    @IsDateString()
    dateOfBirth!: string;
}

export class UpdateTeachingAssignmentDto {
    @ApiProperty({
        description: 'ID of the subject',
        example: 'subject-id-456',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    subjectId?: string;

    @ApiProperty({
        description: 'ID of the Class',
        example: 'class-id-456',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    classId?: string;

    @ApiProperty({
        description: 'ID of the section assigned to teach',
        example: 'section-id-123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()  
    sectionId?: string;
}

export class UpdateStaffStatusDto {
    @ApiProperty({ example: true, type: Boolean })
    @IsBoolean()
    status!: boolean;
}
