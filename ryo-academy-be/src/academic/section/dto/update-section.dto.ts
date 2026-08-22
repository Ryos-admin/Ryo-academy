import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateSectionDto {
    @ApiProperty({
        description: 'Unique code identifying the Section',
        example: 'A',
    })
    @IsString()
    @IsNotEmpty()
    name: string;


}