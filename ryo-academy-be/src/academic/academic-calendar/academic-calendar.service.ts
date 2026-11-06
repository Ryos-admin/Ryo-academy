import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateAcademicCalendarDto } from "./dto/create-academic-calendar.dto.js";
import { QueryAcademicCalendarDto } from "./dto/query-academic-calendar.dto.js";
import { UpdateAcademicCalendarDto } from "./dto/update-academic-calendar.dto.js";
import { SeedAcademicCalendarDto, WeekdayDto } from "./dto/seed-academic-calendar.dto.js";
import { BulkUpdateAcademicCalendarDto } from "./dto/bulk-update-academic-calendar.dto.js";
import { DayType } from "../../../generated/prisma/enums.js";

@Injectable()
export class AcademicCalendarService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(dto: CreateAcademicCalendarDto) {
    const date = this.toDate(dto.date, "date");
    const academicYear = await this.findAcademicYear(dto.academicYearId);
    this.validateDateInAcademicYear(date, academicYear.startDate, academicYear.endDate);

    try {
      return await this.databaseService.academicCalendar.create({
        data: { ...dto, date },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          "A calendar record already exists for this academic year and date.",
        );
      }
      throw error;
    }
  }

  generateCalendarRecords(params: {
    academicYearId: string;
    startDate: Date | string;
    endDate: Date | string;
    weeklyOffDays: WeekdayDto[];
  }) {
    const start = this.normalizeDate(params.startDate, "startDate");
    const end = this.normalizeDate(params.endDate, "endDate");
    if (start > end) {
      throw new BadRequestException("Academic year startDate must be before or equal to endDate");
    }

    const dates: Date[] = [];
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dates.push(new Date(cursor));
    }
    const offDays = new Set(params.weeklyOffDays);
    return dates.map((date) => {
      const weekday = this.weekday(date);
      const isWeekend = offDays.has(weekday);

      return {
        academicYearId: params.academicYearId,
        date,
        dayType: isWeekend ? DayType.WEEKEND : DayType.WORKING_DAY,
        title: isWeekend ? "Weekend" : "Working Day",
        isWorkingDay: !isWeekend,
      };
    });
  }

  async seed(dto: SeedAcademicCalendarDto) {
    let startDate = dto.startDate;
    let endDate = dto.endDate;

    if (!startDate || !endDate) {
      const academicYear = await this.findAcademicYear(dto.academicYearId);
      startDate = startDate ?? academicYear.startDate;
      endDate = endDate ?? academicYear.endDate;
    }

    const records = this.generateCalendarRecords({
      academicYearId: dto.academicYearId,
      startDate,
      endDate,
      weeklyOffDays: dto.weeklyOffDays,
    });

    const result = await this.databaseService.academicCalendar.createMany({
      data: records,
      skipDuplicates: true,
    });

    const start = this.normalizeDate(startDate, "startDate");
    const end = this.normalizeDate(endDate, "endDate");

    return {
      academicYearId: dto.academicYearId,
      startDate: this.formatDate(start),
      endDate: this.formatDate(end),
      created: result.count,
      existing: records.length - result.count,
    };
  }

  async bulkUpdate(dto: BulkUpdateAcademicCalendarDto) {
    const academicYear = await this.findAcademicYear(dto.academicYearId);
    const dates = dto.dates.map((value) => this.toDate(value, "dates"));
    dates.forEach((date) =>
      this.validateDateInAcademicYear(date, academicYear.startDate, academicYear.endDate),
    );

    return this.databaseService.$transaction(async (tx) => {
      let updated = 0;
      let created = 0;
      for (const date of dates) {
        const existing = await tx.academicCalendar.findFirst({
          where: { academicYearId: dto.academicYearId, date, isActive: true },
          select: { id: true },
        });
        const data = {
          dayType: dto.dayType,
          title: dto.title,
          description: dto.description,
          isWorkingDay: dto.isWorkingDay,
        };
        if (existing) {
          await tx.academicCalendar.update({
            where: { id: existing.id },
            data,
          });
          updated += 1;
        } else {
          await tx.academicCalendar.create({
            data: { academicYearId: dto.academicYearId, date, ...data },
          });
          created += 1;
        }
      }
      return { academicYearId: dto.academicYearId, created, updated };
    });
  }

  async findAll(query: QueryAcademicCalendarDto) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException("from must be before or equal to to");
    }

    return this.databaseService.academicCalendar.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(query.academicYearId && { academicYearId: query.academicYearId }),
        ...(query.dayType && { dayType: query.dayType }),
        ...(query.isWorkingDay !== undefined && {
          isWorkingDay: query.isWorkingDay === "true",
        }),
        ...((query.from || query.to) && {
          date: {
            ...(query.from && { gte: this.toDate(query.from, "from") }),
            ...(query.to && { lte: this.toDate(query.to, "to") }),
          },
        }),
      },
      orderBy: { date: "asc" },
    });
  }

  async findOne(id: string) {
    const record = await this.databaseService.academicCalendar.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!record) throw new NotFoundException(`Academic calendar record with id "${id}" not found`);
    return record;
  }

  async update(id: string, dto: UpdateAcademicCalendarDto) {
    const existing = await this.findOne(id);
    const date = dto.date === undefined ? existing.date : this.toDate(dto.date, "date");
    const academicYear = await this.findAcademicYear(existing.academicYearId);
    this.validateDateInAcademicYear(date, academicYear.startDate, academicYear.endDate);

    try {
      return await this.databaseService.academicCalendar.update({
        where: { id },
        data: {
          ...(dto.date !== undefined && { date }),
          ...(dto.dayType !== undefined && {
            dayType: dto.dayType,
          }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.isWorkingDay !== undefined && {
            isWorkingDay: dto.isWorkingDay,
          }),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          "A calendar record already exists for this academic year and date.",
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.databaseService.academicCalendar.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private async findAcademicYear(id: string) {
    const academicYear = await this.databaseService.academicYear.findUnique({
      where: { id },
    });
    if (!academicYear) throw new NotFoundException(`Academic year with id "${id}" not found`);
    return academicYear;
  }

  private toDate(value: string, field: string) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${field} must be a valid calendar date`);
    }
    return date;
  }

  private dateOnly(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private weekday(value: Date): WeekdayDto {
    return [
      WeekdayDto.SUNDAY,
      WeekdayDto.MONDAY,
      WeekdayDto.TUESDAY,
      WeekdayDto.WEDNESDAY,
      WeekdayDto.THURSDAY,
      WeekdayDto.FRIDAY,
      WeekdayDto.SATURDAY,
    ][value.getUTCDay()];
  }

  private validateDateInAcademicYear(date: Date, startDate: Date, endDate: Date) {
    const dateValue = date.getTime();
    const startValue = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    );
    const endValue = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    );
    if (dateValue < startValue || dateValue > endValue) {
      throw new BadRequestException("date must be within the academic year date range");
    }
  }

  private normalizeDate(value: Date | string, field: string): Date {
    if (value instanceof Date) {
      return this.dateOnly(value);
    }
    if (typeof value === "string") {
      const datePart = value.includes("T") ? value.split("T")[0] : value;
      return this.toDate(datePart, field);
    }
    throw new BadRequestException(`${field} must be a valid calendar date`);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private async findAcademicYearById(id: string) {
    const academicYear = await this.databaseService.academicYear.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!academicYear) throw new NotFoundException(`Academic year with id "${id}" not found`);
    return academicYear;
  }
}
