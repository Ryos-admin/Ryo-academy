import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { FeeStructureSyncService } from "../fee-component/fee-structure-sync.service.js";
import { SyncFeeStructureDto } from "../fee-component/dto/sync-fee-structure.dto.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { JwtAuthGuard } from "../../security/token/jwt-auth.guard.js";
import { PERMISSIONS } from "../../auth/permissions/permission.constants.js";
import { RequirePermissions } from "../../auth/require-permissions.decorator.js";

@ApiTags("Fee Structure Synchronization")
@Controller("fee-structure")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeStructureSyncController {
  constructor(private readonly feeStructureSyncService: FeeStructureSyncService) {}

  @Post(":id/sync")
  @RequirePermissions(PERMISSIONS.FEES_UPDATE)
  @ApiOperation({
    summary: "Synchronize applicable admissions with latest fee components",
    description:
      "Explicitly synchronizes all applicable DRAFT and CONFIRMED admissions against latest master fee components.",
  })
  @ApiOkResponse({ description: "Synchronization executed successfully." })
  @ApiConflictResponse({ description: "Conflict or negative due detected during synchronization." })
  @ApiForbiddenResponse({ description: "User does not have access to this school's fee structure." })
  @ApiNotFoundResponse({ description: "Fee structure not found." })
  async sync(
    @Param("id") id: string,
    @Body() dto: SyncFeeStructureDto,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.userId;
    const callerSchoolId = req.user?.schoolId;
    return await this.feeStructureSyncService.executeSynchronization(
      id,
      dto,
      actorUserId,
      callerSchoolId,
    );
  }
}
