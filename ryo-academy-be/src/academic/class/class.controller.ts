import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ClassService } from "./class.service.js";
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CreateClassDto } from "./dto/create-class.dto.js";
import { UpdateClassDto } from "./dto/update-class.dto.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";

@ApiTags('Classes')
@Controller('classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClassController {
    constructor(private readonly classService: ClassService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.CLASS_READ)
    @ApiOperation({ summary: 'List all classes' })
    @ApiOkResponse({ description: 'List of classes ordered by name asc' })
    async findAllClasses() {
        return await this.classService.findAllClasses();
    }

    @Get(':id')
    @RequirePermissions(PERMISSIONS.CLASS_READ)
    @ApiOperation({ summary: 'Get class by ID' })
    @ApiOkResponse({ description: 'Class found' })
    @ApiBadRequestResponse({ description: 'Class not found' })
    async findClassById(@Param('id') id: string) {
        return await this.classService.findClassById(id);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.CLASS_CREATE)
    @ApiOperation({ summary: 'Create a new class' })
    @ApiBody({ type: CreateClassDto })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., class with same name already exists for the program' })
    @ApiCreatedResponse({ description: 'Class created successfully' })
    @ApiConflictResponse({ description: 'Class with same name already exists for the program' })
    async createClass(@Body() createClassDto: CreateClassDto) {
        return await this.classService.createClass(createClassDto);
    }

    @Patch(':id')
    @RequirePermissions(PERMISSIONS.CLASS_UPDATE)
    @ApiOperation({ summary: 'Update an existing class' })
    @ApiBody({ type: UpdateClassDto })
    @ApiBadRequestResponse({ description: 'Validation failed, e.g., class with same name already exists for the program' })
    @ApiOkResponse({ description: 'Class updated successfully' })
    @ApiConflictResponse({ description: 'Class with same name already exists for the program' })
    async updateClass(@Param('id') id: string, @Body() updateClassDto: UpdateClassDto) {
        return await this.classService.updateClassById(id, updateClassDto);
    }

}