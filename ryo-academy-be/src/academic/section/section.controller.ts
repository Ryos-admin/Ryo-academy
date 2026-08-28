import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBadGatewayResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SectionService } from "./section.service.js";
import { CreateSectionDto } from "./dto/create-section.dto.js";
import { UpdateSectionDto } from "./dto/update-section.dto.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";

@ApiTags('Sections')
@Controller('sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CLASS_READ)
  @ApiOperation({ summary: 'List all sections' })
  @ApiOkResponse({ description: 'List of sections ordered by name asc' })
  async findAllSections() {
    return await this.sectionService.findAllSections();
  }

  @Get(':classId')
  @RequirePermissions(PERMISSIONS.CLASS_READ)
  @ApiOperation({ summary: 'List all sections for a specific class' })
  @ApiOkResponse({ description: 'List of sections for the specified class ordered by name asc' })
  async findSectionsByClassId(@Param('classId') classId: string) {
    return await this.sectionService.findSectionByClassId(classId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CLASS_CREATE)
  @ApiOperation({ summary: 'Create a new section for a specific class' })
  @ApiBody({ type: CreateSectionDto })
  @ApiCreatedResponse({ description: 'Section created successfully' })
  @ApiConflictResponse({ description: 'Section with same name already exists for the class' })
  @ApiBadGatewayResponse({ description: 'Class not found' })
  async createSectionByClassId(@Body() createSectionDto: CreateSectionDto) {
    return await this.sectionService.createSectionByClassId(createSectionDto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLASS_UPDATE)
  @ApiOperation({ summary: 'Update an existing section' })
  @ApiBody({ type: UpdateSectionDto })
  @ApiOkResponse({ description: 'Section updated successfully' })
  @ApiConflictResponse({ description: 'Section with same name already exists for the class' })
  @ApiBadGatewayResponse({ description: 'Class not found' })
  async updateSection(@Param('id') id: string, @Body() updateSectionDto: UpdateSectionDto) {
    return await this.sectionService.updateSectionById(id, updateSectionDto);
  }

}