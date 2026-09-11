import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateSectionDto {
    @ApiProperty({
        description: 'Unique code identifying the Section',
        example: 'A1',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'ID of the Class to which the Section belongs',
        example: 'class-123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    classId: string;
}