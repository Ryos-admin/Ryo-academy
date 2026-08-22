import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateClassDto {
    @ApiProperty({
        description: 'Unique code identifying the Class',
        example: 'Class-1A',
    })
    @IsString()
    @IsNotEmpty()   
    name: string;

    @ApiProperty({
        description: 'ID of the program to which the class belongs',
        example: 'Day-Care(id)',
    })
    @IsString()
    @IsNotEmpty()
    programId: string;

}