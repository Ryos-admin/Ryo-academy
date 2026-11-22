import { DatabaseService } from "../../database/database.service.js";
import { CreateProgramDto } from "./dto/create-program.dto.js";
import { DayOfWeek } from "../../../generated/prisma/client.js";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

@Injectable()
export class ProgramService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createPrgm(dto: CreateProgramDto) {
    try {
      if (dto.startTime >= dto.endTime) {
        throw new BadRequestException(`Start time must be before end time`);
      }

      return await this.databaseService.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${dto.academicYear} FOR SHARE`;
        const academicYear = await tx.academicYear.findUnique({
          where: { id: dto.academicYear, isActive: true, deletedAt: null },
          select: { id: true, name: true },
        });

        if (!academicYear) {
          throw new NotFoundException(`Academic year with id "${dto.academicYear}" not found`);
        }

        return await tx.program.create({
          data: {
            name: dto.name,
            academicYear: { connect: { id: academicYear.id } },
            isPrimary: dto.isPrimary,
            daysOfWeek: dto.daysOfWeek,
            startTime: dto.startTime,
            endTime: dto.endTime,
          },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new BadRequestException(
          `Program with name "${dto.name}" already exists for academic year "${dto.academicYear}".`,
        );
      }
      throw error;
    }
  }

  async findAllPrgms() {
    try {
      return this.databaseService.program.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ name: "asc" }, { academicYearId: "desc" }, { isPrimary: "desc" }],
      });
    } catch (error) {
      throw error;
    }
  }

  async fingPrgmByName(name: string) {
    try {
      const program = await this.databaseService.program.findMany({
        where: { name, isActive: true, deletedAt: null },
      });
      if (!program || program.length === 0) {
        throw new NotFoundException(`Program with name "${name}" not found`);
      }
      return program;
    } catch (error) {
      throw error;
    }
  }

  async findPrgmById(id: string) {
    try {
      const program = await this.databaseService.program.findUnique({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!program) {
        throw new NotFoundException(`Program with id "${id}" not found`);
      }
      return program;
    } catch (error) {
      throw error;
    }
  }

  async updatePrgm(id: string, dto: Partial<CreateProgramDto>) {
    try {
      if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
        throw new BadRequestException(`Start time must be before end time`);
      }

      return await this.databaseService.$transaction(async (tx) => {
        const existingProgram = await tx.program.findUnique({
          where: { id, isActive: true, deletedAt: null },
          select: { id: true, academicYearId: true },
        });

        if (!existingProgram) {
          throw new NotFoundException(`Program with id "${id}" not found`);
        }

        const yearsToLock = Array.from(
          new Set([existingProgram.academicYearId, dto.academicYear].filter(Boolean) as string[]),
        ).sort();

        for (const yearId of yearsToLock) {
          await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${yearId} FOR SHARE`;
          const ay = await tx.academicYear.findUnique({
            where: { id: yearId, isActive: true, deletedAt: null },
            select: { id: true },
          });
          if (!ay) throw new NotFoundException(`Academic year with id "${yearId}" not found`);
        }

        return tx.program.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.academicYear !== undefined && {
              academicYear: { connect: { id: dto.academicYear } },
            }),
            ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
            ...(dto.daysOfWeek !== undefined && { daysOfWeek: dto.daysOfWeek }),
            ...(dto.startTime !== undefined && { startTime: dto.startTime }),
            ...(dto.endTime !== undefined && { endTime: dto.endTime }),
          },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new BadRequestException(
          `Program with name "${dto.name}" already exists for academic year "${dto.academicYear}".`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    return await this.databaseService.$transaction(async (tx) => {
      const existing = await tx.program.findUnique({
        where: { id, isActive: true, deletedAt: null },
        select: { id: true, academicYearId: true },
      });
      if (!existing) {
        throw new NotFoundException(`Program with id "${id}" not found`);
      }

      await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${existing.academicYearId} FOR SHARE`;
      const ay = await tx.academicYear.findUnique({
        where: { id: existing.academicYearId, isActive: true, deletedAt: null },
        select: { name: true },
      });
      if (!ay)
        throw new NotFoundException(`Academic year with id "${existing.academicYearId}" not found`);

      return tx.program.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
    });
  }
}
