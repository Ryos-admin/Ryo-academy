import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";
import { FeeConcessionCategoryService } from "./fee-concession-category.service.js";
import { CreateFeeConcessionCategoryDto } from "./dto/create-fee-concession-category.dto.js";
import { UpdateFeeConcessionCategoryDto } from "./dto/update-fee-concession-category.dto.js";

@ApiTags("Fee Concession Categories")
@Controller(["fee-concessions", "fee-concession"])
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeConcessionCategoryController {
  constructor(
    private readonly categoryService: FeeConcessionCategoryService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: "List fee concession categories for the school" })
  @ApiOkResponse({ description: "Categories returned successfully" })
  async findAll(
    @Req() req: any,
    @Query("schoolId") schoolId?: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.categoryService.findAll(
      req.user?.userId,
      schoolId,
      includeInactive === "true",
    );
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.FEES_READ)
  @ApiOperation({ summary: "Get fee concession category by ID" })
  @ApiOkResponse({ description: "Category returned successfully" })
  async findById(
    @Param("id") id: string,
    @Req() req: any,
    @Query("schoolId") schoolId?: string,
  ) {
    return this.categoryService.findById(id, req.user?.userId, schoolId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FEES_CREATE)
  @ApiOperation({ summary: "Create a new fee concession category" })
  @ApiCreatedResponse({ description: "Category created successfully" })
  async create(
    @Body() dto: CreateFeeConcessionCategoryDto,
    @Req() req: any,
  ) {
    return this.categoryService.create(dto, req.user?.userId);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.FEES_UPDATE)
  @ApiOperation({ summary: "Update fee concession category" })
  @ApiOkResponse({ description: "Category updated successfully" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateFeeConcessionCategoryDto,
    @Req() req: any,
  ) {
    return this.categoryService.update(id, dto, req.user?.userId);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.FEES_UPDATE)
  @ApiOperation({ summary: "Soft-deactivate fee concession category" })
  @ApiOkResponse({ description: "Category deactivated successfully" })
  async delete(@Param("id") id: string, @Req() req: any) {
    return this.categoryService.delete(id, req.user?.userId);
  }
}
