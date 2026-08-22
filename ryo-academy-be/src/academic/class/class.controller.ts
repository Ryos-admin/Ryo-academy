import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ClassService } from "./class.service.js";
import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateClassDto } from "./dto/create-class.dto.js";
import { UpdateClassDto } from "./dto/update-class.dto.js";

@ApiTags('Classes')
@Controller('classes')
export class ClassController {
    constructor(private readonly classService: ClassService) {}

    @Get()
    @ApiOperation({ summary: 'List all classes' })
    @ApiOkResponse({ description: 'List of classes ordered by name asc' })
    async findAllClasses() {
        return await this.classService.findAllClasses();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get class by ID' })
    @ApiOkResponse({ description: 'Class found' })
    @ApiBadRequestResponse({ description: 'Class not found' })
    async findClassById(@Param('id') id: string) {
        return await this.classService.findClassById(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new class' })
    @ApiBody({ type: CreateClassDto })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., class with same name already exists for the program' })
    @ApiCreatedResponse({ description: 'Class created successfully' })
    @ApiConflictResponse({ description: 'Class with same name already exists for the program' })
    async createClass(@Body() createClassDto: CreateClassDto) {
        return await this.classService.createClass(createClassDto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing class' })
    @ApiBody({ type: UpdateClassDto })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., class with same name already exists for the program' })
    @ApiOkResponse({ description: 'Class updated successfully' })
    @ApiConflictResponse({ description: 'Class with same name already exists for the program' })
    async updateClass(@Param('id') id: string, @Body() updateClassDto: UpdateClassDto) {
        return await this.classService.updateClassById(id, updateClassDto);
    }

}