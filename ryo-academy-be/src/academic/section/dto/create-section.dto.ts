import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateSectionDto {
    @ApiProperty({
        description: 'Unique code identifying the Section',
        example: 'A1',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'ID of the Class to which the Section belongs',
        example: 'class-123',
    })
    @IsString()
    @IsNotEmpty()
    classId: string;
}