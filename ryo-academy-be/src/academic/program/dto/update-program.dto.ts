import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DayOfWeek } from "../../../../generated/prisma/client.js";

export class UpdateProgramDto {

    @ApiProperty({
        description: 'Unique code identifying the Program/shift',
        example: 'Day-Care',
        type: String,
        required: false,
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({
        description: 'Indicates if the program is primary',
        example: true,
        type: Boolean,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    isPrimary?: boolean;

    @ApiProperty({
        description: 'Days of the week when the program is offered',
        example: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        enum: DayOfWeek,
        isArray: true,
        required: false,
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(DayOfWeek, { each: true })
    @IsOptional()
    daysOfWeek?: DayOfWeek[];

    @ApiProperty({
        description: 'Start time of the program',
        example: '08:00',
        type: String,
        required: false,
    })
    @IsString()
    @IsOptional()
    startTime?: string;

    @ApiProperty({
        description: 'End time of the program',
        example: '17:00',
        type: String,
        required: false,
    })
    @IsString()
    @IsOptional()
    endTime?: string;
}
