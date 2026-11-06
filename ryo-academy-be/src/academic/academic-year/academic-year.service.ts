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
import { AcademicCalendarService } from "../academic-calendar/academic-calendar.service.js";
import { hasAcademicYearStarted } from "../../common/date/kolkata-business-date.js";
import {
  SeedAcademicCalendarDto,
  WeekdayDto,
  WeeklyScheduleDto,
} from "../academic-calendar/dto/seed-academic-calendar.dto.js";

var schoolDtls: string = "";
@Injectable()
export class AcademicYearService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly academicCalendarService?: AcademicCalendarService,
  ) {}

  async create(dto: CreateAcademicYearDto) {
    this.validateDateRange(dto.startDate, dto.endDate);

    const existingAcademicYear = await this.databaseService.academicYear.findFirst({
      where: {
        schoolId: dto.schoolId,
        name: dto.name,
      },
      select: { id: true, isActive: true },
    });

    if (existingAcademicYear && existingAcademicYear.isActive) {
      console.log(existingAcademicYear, "test false flow 1");

      throw new ConflictException(
        `Academic year with name "${dto.name}" already exists for school.`,
      );
    }

    try {
      return await this.databaseService.$transaction(async (tx) => {
        let academicYearData;
        if (existingAcademicYear && !existingAcademicYear.isActive) {
          console.log(existingAcademicYear, "test false flow 2");
          academicYearData = await tx.academicYear.update({
            where: {
              id: existingAcademicYear.id,
            },
            data: {
              isActive: true,
              startDate: dto.startDate,
              endDate: dto.endDate,
              deletedAt: null,
              deletedById: null,
            },
          });
        } else {
          console.log(existingAcademicYear, "test false flow 3");

          academicYearData = await tx.academicYear.create({
            data: {
              schoolId: dto.schoolId,
              name: dto.name,
              startDate: dto.startDate,
              endDate: dto.endDate,
            },
          });
        }

        if (this.academicCalendarService) {
          const calendarRecords = this.academicCalendarService.generateCalendarRecords({
            academicYearId: academicYearData.id,
            startDate: dto.startDate,
            endDate: dto.endDate,
            weeklyOffDays: dto.weeklyOffDays ?? [],
          });

          await tx.academicCalendar.updateMany({
            where: {
              date: {
                gte: new Date(dto.startDate),
                lte: new Date(dto.endDate),
              },
              deletedAt: null,
            },
            data: { isActive: false, deletedAt: new Date() },
          });

          if (calendarRecords.length > 0) {
            await tx.academicCalendar.createMany({
              data: calendarRecords,
              skipDuplicates: true,
            });
          }
        }

        return academicYearData;
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
    try {
      return await this.databaseService.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${id} FOR UPDATE`;
        const existing = await tx.academicYear.findFirst({
          where: { id, isActive: true, deletedAt: null },
        });
        if (!existing) throw new NotFoundException(`Academic year with id "${id}" not found`);

        if (dto.startDate !== undefined && dto.startDate.getTime() !== existing.startDate.getTime() && hasAcademicYearStarted(existing.startDate)) {
          throw new ConflictException('Academic-year startDate cannot be changed after the year has started.');
        }

        if (dto.startDate !== undefined || dto.endDate !== undefined) {
          this.validateDateRange(dto.startDate ?? existing.startDate, dto.endDate ?? existing.endDate);
        }

        return tx.academicYear.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.startDate !== undefined && { startDate: dto.startDate }),
            ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          },
        });
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictException(`Academic year name already exists for this school.`);
      }
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    const actor = await this.databaseService.user.findUnique({
      where: { id: actorUserId },
      select: { schoolId: true },
    });
    if (!actor?.schoolId) throw new ForbiddenException("A school-scoped user is required");
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
        admissionStatus: { in: ["CONFIRMED", "DRAFT"] },
        student: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    });
    if (activeEnrollment) {
      throw new ConflictException(
        "Academic year cannot be deleted while active student enrollments exist.",
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
      await tx.academicCalendar.deleteMany({
        where: { academicYearId: id, deletedAt: null },
        // data: { isActive: false, deletedAt, deletedById: actorUserId },
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
