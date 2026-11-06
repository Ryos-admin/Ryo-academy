import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateFeeConcessionCategoryDto } from "./dto/create-fee-concession-category.dto.js";
import { UpdateFeeConcessionCategoryDto } from "./dto/update-fee-concession-category.dto.js";

@Injectable()
export class FeeConcessionCategoryService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async resolveSchoolId(actorUserId?: string, requestedSchoolId?: string): Promise<string> {
    if (actorUserId) {
      const actor = await this.databaseService.user.findUnique({
        where: { id: actorUserId },
        select: { schoolId: true },
      });
      if (actor?.schoolId) {
        if (requestedSchoolId && requestedSchoolId !== actor.schoolId) {
          throw new ForbiddenException("Cannot access concession categories outside your assigned school");
        }
        return actor.schoolId;
      }
    }

    if (requestedSchoolId) {
      const school = await this.databaseService.school.findUnique({
        where: { id: requestedSchoolId },
        select: { id: true },
      });
      if (!school) {
        throw new NotFoundException(`School with id "${requestedSchoolId}" not found`);
      }
      return school.id;
    }

    // Default fallback to first active school if no user/school given (common in test harnesses)
    const defaultSchool = await this.databaseService.school.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!defaultSchool) {
      throw new BadRequestException("No active school found");
    }
    return defaultSchool.id;
  }

  async findAll(actorUserId?: string, schoolId?: string, includeInactive = false) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId, schoolId);
    return this.databaseService.feeConcessionCategory.findMany({
      where: {
        schoolId: resolvedSchoolId,
        ...(includeInactive ? {} : { isActive: true }),
        deletedAt: null,
      },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string, actorUserId?: string, schoolId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId, schoolId);
    const category = await this.databaseService.feeConcessionCategory.findFirst({
      where: {
        id,
        schoolId: resolvedSchoolId,
        deletedAt: null,
      },
    });

    if (!category) {
      throw new NotFoundException(`Fee concession category with id "${id}" not found`);
    }

    return category;
  }

  async create(dto: CreateFeeConcessionCategoryDto, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId, dto.schoolId);
    const code = dto.code.trim().toUpperCase();

    // Check code uniqueness within school
    const existing = await this.databaseService.feeConcessionCategory.findFirst({
      where: {
        schoolId: resolvedSchoolId,
        code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `A concession category with code "${code}" already exists for this school.`,
      );
    }

    return this.databaseService.feeConcessionCategory.create({
      data: {
        schoolId: resolvedSchoolId,
        name: dto.name.trim(),
        code,
        description: dto.description?.trim(),
        isActive: true,
      },
    });
  }

  async update(id: string, dto: UpdateFeeConcessionCategoryDto, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    const existing = await this.findById(id, actorUserId, resolvedSchoolId);

    return this.databaseService.feeConcessionCategory.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async delete(id: string, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    const existing = await this.findById(id, actorUserId, resolvedSchoolId);

    // Soft deactivation (Decision 2): preserves historical records
    return this.databaseService.feeConcessionCategory.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedById: actorUserId ?? null,
      },
    });
  }
}
