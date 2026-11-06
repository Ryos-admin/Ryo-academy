import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateInstallmentTemplateDto } from "./dto/create-installment-template.dto.js";
import { InstallmentCalculationType, Prisma } from "../../../generated/prisma/client.js";
import { parseMoney } from "../../common/money/money.util.js";

const Decimal = Prisma.Decimal;

@Injectable()
export class InstallmentTemplateService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Resolves the authoritative school ID from the authenticated user token.
   * Strictly prevents cross-school tenant access.
   */
  private async resolveSchoolId(actorUserId?: string, requestedSchoolId?: string): Promise<string> {
    if (actorUserId) {
      const actor = await this.databaseService.user.findUnique({
        where: { id: actorUserId },
        select: { schoolId: true },
      });
      if (actor?.schoolId) {
        if (requestedSchoolId && requestedSchoolId !== actor.schoolId) {
          throw new ForbiddenException("Cannot access installment templates outside your assigned school");
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

    const defaultSchool = await this.databaseService.school.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!defaultSchool) {
      throw new BadRequestException("No active school found");
    }
    return defaultSchool.id;
  }

  /**
   * Creates an immutable installment template and its ordered items.
   * Enforces:
   * - Strict school isolation.
   * - Case-insensitive uniqueness within the school using transactional advisory lock serialization.
   * - Complete item sequence and percentage/fixed-amount validation.
   */
  async create(dto: CreateInstallmentTemplateDto, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId, dto.schoolId);
    const normalizedName = dto.name.trim();

    if (!normalizedName) {
      throw new BadRequestException("Template name cannot be empty.");
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("Template must contain at least one installment item.");
    }

    if (dto.items.length !== dto.installmentCount) {
      throw new BadRequestException(
        `Number of items provided (${dto.items.length}) does not match installmentCount (${dto.installmentCount}).`,
      );
    }

    // Sort items by sequence
    const sortedItems = [...dto.items].sort((a, b) => a.sequence - b.sequence);

    // Verify sequences (1, 2, ... N)
    for (let i = 0; i < sortedItems.length; i++) {
      if (sortedItems[i].sequence !== i + 1) {
        throw new BadRequestException(
          `Installment items must have contiguous sequences starting from 1. Found sequence ${sortedItems[i].sequence} at index ${i}.`,
        );
      }
      const intervalDays =
        sortedItems[i].intervalDaysAfterPrevious ?? sortedItems[i].dueDaysAfterAdmission ?? 0;
      if (intervalDays < 0) {
        throw new BadRequestException(
          `Item sequence ${sortedItems[i].sequence} cannot have negative interval (${intervalDays}).`,
        );
      }
    }

    // Type-specific validations
    if (dto.calculationType === InstallmentCalculationType.PERCENTAGE) {
      let sumPct = new Decimal(0);
      for (const item of sortedItems) {
        if (item.percentage === undefined || item.percentage === null) {
          throw new BadRequestException(
            `Item sequence ${item.sequence} requires a percentage for PERCENTAGE calculation type.`,
          );
        }
        const pct = new Decimal(item.percentage);
        if (pct.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Item sequence ${item.sequence} percentage must be strictly positive.`,
          );
        }
        sumPct = sumPct.plus(pct);
      }
      if (!sumPct.equals(100)) {
        throw new BadRequestException(
          `Total percentage across installment items must equal exactly 100.00%. Current sum: ${sumPct.toFixed(2)}%.`,
        );
      }
    } else if (dto.calculationType === InstallmentCalculationType.CUSTOM_AMOUNT) {
      for (const item of sortedItems) {
        if (item.fixedAmount === undefined || item.fixedAmount === null) {
          throw new BadRequestException(
            `Item sequence ${item.sequence} requires fixedAmount for CUSTOM_AMOUNT calculation type.`,
          );
        }
        const amt = parseMoney(item.fixedAmount, 'fixedAmount');
        if (amt.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Item sequence ${item.sequence} fixedAmount must be strictly positive.`,
          );
        }
      }
    }

    // Execute atomic creation under transactional advisory lock for race-free case-insensitive uniqueness
    return this.databaseService.$transaction(async (tx) => {
      // Advisory xact lock on hash(schoolId + lowercase name)
      const lockKey = `${resolvedSchoolId}:${normalizedName.toLowerCase()}`;
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", lockKey);

      // Check case-insensitive existence (including inactive templates)
      const existing = await tx.installmentTemplate.findFirst({
        where: {
          schoolId: resolvedSchoolId,
          name: { equals: normalizedName, mode: "insensitive" },
        },
      });

      if (existing) {
        throw new ConflictException(
          `An installment template with name "${normalizedName}" already exists for this school.`,
        );
      }

      return tx.installmentTemplate.create({
        data: {
          schoolId: resolvedSchoolId,
          name: normalizedName,
          description: dto.description?.trim() || null,
          calculationType: dto.calculationType,
          installmentCount: dto.installmentCount,
          isActive: true,
          items: {
            create: sortedItems.map((item) => ({
              sequence: item.sequence,
              label: item.label.trim(),
              percentage: item.percentage !== undefined && item.percentage !== null ? new Decimal(item.percentage) : null,
              fixedAmount: item.fixedAmount !== undefined && item.fixedAmount !== null ? parseMoney(item.fixedAmount, 'fixedAmount') : null,
              dueDaysAfterAdmission: item.intervalDaysAfterPrevious ?? item.dueDaysAfterAdmission ?? 0,
            })),
          },
        },
        include: {
          items: {
            orderBy: { sequence: "asc" },
          },
        },
      });
    });
  }

  /**
   * Lists installment templates for the authenticated school.
   */
  async findAll(actorUserId?: string, includeInactive = false) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    return this.databaseService.installmentTemplate.findMany({
      where: {
        schoolId: resolvedSchoolId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        items: {
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Retrieves a single installment template by ID within the authenticated school.
   */
  async findById(id: string, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    const template = await this.databaseService.installmentTemplate.findFirst({
      where: {
        id,
        schoolId: resolvedSchoolId,
      },
      include: {
        items: {
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Installment template with id "${id}" not found`);
    }

    return template;
  }

  /**
   * Soft-deactivates an installment template.
   * Templates are immutable after creation; deactivation sets isActive = false without mutating items or historical schedules.
   */
  async deactivate(id: string, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    const existing = await this.findById(id, actorUserId);

    if (!existing.isActive) {
      return existing; // Already inactive
    }

    return this.databaseService.installmentTemplate.update({
      where: { id: existing.id },
      data: {
        isActive: false,
      },
      include: {
        items: {
          orderBy: { sequence: "asc" },
        },
      },
    });
  }
}
