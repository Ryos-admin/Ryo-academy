import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateClassDto {
    @ApiProperty({
        description: 'Unique code identifying the Class',
        example: 'Class-1A',
        type: String,
    })
    @IsString()
    @IsNotEmpty()   
    name: string;
}