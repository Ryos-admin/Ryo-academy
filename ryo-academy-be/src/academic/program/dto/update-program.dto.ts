import { ApiProperty } from "@nestjs/swagger"
import { IsArray, IsBoolean, IsNotEmpty, IsString } from "class-validator"

export class UpdateProgramDto {

    @ApiProperty({
        description: 'Unique code identifying the Program/shift',
        example: 'Day-Care',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Indicates if the program is primary',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    @IsNotEmpty()
    isPrimary: boolean;

    @ApiProperty({
        description: 'Days of the week when the program is offered',
        example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        type: [String],
    })
    @IsArray()
    @IsNotEmpty()
    daysOfWeek: string[];

    @ApiProperty({
        description: 'Start time of the program',
        example: '08:00',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    startTime: string;

    @ApiProperty({
        description: 'End time of the program',
        example: '17:00',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    endTime: string;
}
