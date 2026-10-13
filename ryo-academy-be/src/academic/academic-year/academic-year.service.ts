import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto.js";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto.js";

var schoolDtls: string = "";
@Injectable()
export class AcademicYearService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(dto: CreateAcademicYearDto) {
    this.validateDateRange(dto.startDate, dto.endDate);
    try {
      return await this.databaseService.academicYear.create({
        data: {
          schoolId: dto.schoolId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
        },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          `Academic year with name "${dto.name}" already exists for school.`,
        );
      }
      throw error;
    }
  }

  async findAll() {
    const academicYrs = await this.databaseService.academicYear.findMany({
      where: { isActive: true },
      include: {
        school: {
          select: {
            name: true,
            schoolCode: true,
          },
        },
      },
      orderBy: [{ schoolId: "asc" }, { startDate: "desc" }],
    });

    schoolDtls = `${academicYrs[0]?.school ? `${academicYrs[0]?.school.name} (${academicYrs[0]?.school.schoolCode})` : ""}`;

    return academicYrs.map((academicYear) => ({
      id: academicYear.id,
      schoolId: schoolDtls,
      name: academicYear.name,
      startDate: academicYear.startDate,
      endDate: academicYear.endDate,
    }));
  }

  async findOne(id: string) {
    const academicYear = await this.databaseService.academicYear.findUnique({
      where: { id, isActive: true, deletedAt: null },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year with id "${id}" not found`);
    }
    Object.assign(academicYear, { schoolId: schoolDtls });
    return academicYear;
  }

  async update(id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.findOne(id);

    if (dto.startDate && dto.endDate) {
      this.validateDateRange(dto.startDate, dto.endDate);
    } else if (dto.startDate || dto.endDate) {
      const start = dto.startDate ?? existing.startDate;
      const end = dto.endDate ?? existing.endDate;
      this.validateDateRange(start, end);
    }

    try {
      return await this.databaseService.academicYear.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
        },
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictException(`Academic year name already exists for this school.`);
      }
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    const actor = await this.databaseService.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    if (!actor?.schoolId) throw new ForbiddenException('A school-scoped user is required');
    const academicYear = await this.databaseService.academicYear.findFirst({
      where: { id, schoolId: actor.schoolId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!academicYear || !academicYear.isActive || academicYear.deletedAt) {
      throw new NotFoundException(`Academic year with id "${id}" not found`);
    }

    const activeEnrollment = await this.databaseService.admission.findFirst({
      where: {
        academicYearId: id,
        isActive: true,
        deletedAt: null,
        admissionStatus: 'CONFIRMED',
        student: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    });
    if (activeEnrollment) {
      throw new ConflictException(
        'Academic year cannot be deleted while active student enrollments exist.',
      );
    }

    const deletedAt = new Date();
    return this.databaseService.$transaction(async (tx) => {
      const programs = await tx.program.findMany({
        where: { academicYearId: id },
        select: { id: true },
      });
      const programIds = programs.map(({ id: programId }) => programId);
      const classes = await tx.class.findMany({
        where: { programId: { in: programIds } },
        select: { id: true },
      });
      const classIds = classes.map(({ id: classId }) => classId);

      if (classIds.length) {
        await tx.teachingAssignment.updateMany({
          where: { classId: { in: classIds }, deletedAt: null },
          data: { isActive: false, deletedAt, deletedById: actorUserId },
        });
      }
      await tx.academicCalendar.updateMany({
        where: { academicYearId: id, deletedAt: null },
        data: { isActive: false, deletedAt, deletedById: actorUserId },
      });
      if (classIds.length) {
        await tx.section.updateMany({
          where: { classId: { in: classIds }, deletedAt: null },
          data: { isActive: false, deletedAt, deletedById: actorUserId },
        });
        await tx.class.updateMany({
          where: { id: { in: classIds }, deletedAt: null },
          data: { isActive: false, deletedAt, deletedById: actorUserId },
        });
      }
      if (programIds.length) {
        await tx.program.updateMany({
          where: { id: { in: programIds }, deletedAt: null },
          data: { isActive: false, deletedAt, deletedById: actorUserId },
        });
      }
      return tx.academicYear.update({
        where: { id },
        data: { isActive: false, deletedAt, deletedById: actorUserId },
      });
    });
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException("startDate must be before endDate");
    }
  }
}
