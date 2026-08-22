import { ApiProperty } from "@nestjs/swagger";
import {  IsArray, IsBoolean, IsNotEmpty, IsString } from "class-validator";

export class CreateProgramDto {
    @ApiProperty({
        description: 'Unique code identifying the Program/shift',
        example: 'Day-Care',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'ID of the academic year to which the program belongs',
        example: '2025-2026',
    })
    @IsString()
    @IsNotEmpty()
    academicYear: string;

    @ApiProperty({
        description: 'Indicates if the program is primary',
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isPrimary: boolean;

    @ApiProperty({
        description: 'Days of the week when the program is offered',
        example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    })
    @IsArray()
    @IsNotEmpty()
    daysOfWeek: string[];

    @ApiProperty({
        description: 'Start time of the program',
        example: '08:00',
    })
    @IsString()
    @IsNotEmpty()
    startTime: string;

    @ApiProperty({
        description: 'End time of the program',
        example: '17:00',
    })
    @IsString()
    @IsNotEmpty()
    endTime: string;
}