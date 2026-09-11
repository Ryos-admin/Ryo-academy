import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateAttendanceDto } from './dto/create-attendance.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import { UpdateAttendanceDto } from './dto/update-attendance.dto.js';
import { AttendanceMasterStatus } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, dto: CreateAttendanceDto) {
    const staff = await this.staffForUser(userId);
    const date = this.date(dto.date);
    const [year, cls, section, calendar] = await Promise.all([
      this.db.academicYear.findUnique({ where: { id: dto.academicYearId } }),
      this.db.class.findUnique({
        where: { id: dto.classId },
        include: { program: true },
      }),
      this.db.section.findUnique({ where: { id: dto.sectionId } }),
      this.db.academicCalendar.findFirst({
        where: { academicYearId: dto.academicYearId, date, deletedAt: null },
      }),
    ]);
    if (!year) throw new NotFoundException('Academic year not found');
    if (!cls) throw new NotFoundException('Class not found');
    if (!section) throw new NotFoundException('Section not found');
    if (section.classId !== dto.classId)
      throw new BadRequestException(
        'Section does not belong to the specified class',
      );
    this.validateDate(date, year.startDate, year.endDate);
    if (!calendar)
      throw new BadRequestException(
        'No academic calendar record exists for this date',
      );
    if (!calendar.isWorkingDay)
      throw new BadRequestException(
        'Attendance cannot be taken on a non-working day',
      );
    const assignment = await this.db.teachingAssignment.findFirst({
      where: {
        staffId: staff.id,
        classId: dto.classId,
        sectionId: dto.sectionId,
        class: { program: { academicYearId: dto.academicYearId } },
      },
    });
    if (!assignment)
      throw new ForbiddenException(
        'You are not assigned to this class and section',
      );
    const students = await this.db.student.findMany({
      where: {
        admission: {
          academicYearId: dto.academicYearId,
          classId: dto.classId,
          sectionId: dto.sectionId,
          admissionStatus: 'CONFIRMED',
          section: { classId: dto.classId },
        },
      },
      select: { id: true },
    });
    this.validateEntries(
      dto.entries,
      students.map((s) => s.id),
    );
    try {
      return await this.db.$transaction(async (tx) => {
        const master = await tx.attendanceLogMaster.create({
          data: {
            academicYearId: dto.academicYearId,
            classId: dto.classId,
            sectionId: dto.sectionId,
            date,
            takenBy: staff.id,
            status: AttendanceMasterStatus.DRAFT,
          },
        });
        await tx.attendanceLogChild.createMany({
          data: dto.entries.map((entry) => ({
            attendanceMasterId: master.id,
            studentId: entry.studentId,
            status: entry.status,
            remarks: entry.remarks,
          })),
        });
        return tx.attendanceLogMaster.findUnique({
          where: { id: master.id },
          include: { children: true },
        });
      });
    } catch (error) {
      if (this.uniqueError(error))
        throw new ConflictException(
          'Attendance already exists for this academic year, class, section, and date',
        );
      throw error;
    }
  }

  async findAll(userId: string, query: QueryAttendanceDto) {
    const staff = await this.staffForUser(userId);
    const where: Prisma.AttendanceLogMasterWhereInput = {
      deletedAt: null,
      ...(query.academicYearId && { academicYearId: query.academicYearId }),
      ...(query.classId && { classId: query.classId }),
      ...(query.sectionId && { sectionId: query.sectionId }),
      ...this.range(query),
    };
    if (staff) {
      const assignments = await this.db.teachingAssignment.findMany({
        where: { staffId: staff.id },
        select: {
          classId: true,
          sectionId: true,
          class: { select: { program: { select: { academicYearId: true } } } },
        },
      });
      where.OR = assignments.map((a) => ({
        academicYearId: a.class.program.academicYearId,
        classId: a.classId,
        sectionId: a.sectionId,
      }));
    }
    return this.db.attendanceLogMaster.findMany({
      where,
      include: { children: true },
      orderBy: { date: 'desc' },
    });
  }
  async findOne(userId: string, id: string) {
    const staff = await this.staffForUser(userId);
    const record = await this.db.attendanceLogMaster.findFirst({
      where: { id, deletedAt: null },
      include: { children: true },
    });
    if (!record) throw new NotFoundException('Attendance not found');
    await this.authorizeRead(
      staff.id,
      record.academicYearId,
      record.classId,
      record.sectionId,
    );
    return record;
  }
  findMy(userId: string, query: QueryAttendanceDto) {
    return this.findMyAttendance(userId, query);
  }

  private async findMyAttendance(userId: string, query: QueryAttendanceDto) {
    const staff = await this.staffForUser(userId);
    const where: Prisma.AttendanceLogMasterWhereInput = {
      deletedAt: null,
      takenBy: staff.id,
      ...(query.academicYearId && { academicYearId: query.academicYearId }),
      ...(query.classId && { classId: query.classId }),
      ...(query.sectionId && { sectionId: query.sectionId }),
      ...this.range(query),
    };
    return this.db.attendanceLogMaster.findMany({
      where,
      include: { children: true },
      orderBy: { date: 'desc' },
    });
  }
  async update(userId: string, id: string, dto: UpdateAttendanceDto) {
    const currentStaff = await this.staffForUser(userId);
    const record = await this.db.attendanceLogMaster.findFirst({
      where: { id, deletedAt: null },
      include: { children: true },
    });
    if (!record) throw new NotFoundException('Attendance not found');
    if (record.status !== AttendanceMasterStatus.DRAFT)
      throw new ConflictException('Submitted attendance cannot be modified');
    if (record.takenBy !== currentStaff.id)
      throw new ForbiddenException(
        'You are not allowed to update this attendance',
      );
    if (dto.entries) {
      const valid = await this.db.student.findMany({
        where: {
          admission: {
            academicYearId: record.academicYearId,
            classId: record.classId,
            sectionId: record.sectionId,
            admissionStatus: 'CONFIRMED',
            section: { classId: record.classId },
          },
        },
        select: { id: true },
      });
      this.validateEntries(
        dto.entries,
        valid.map((s) => s.id),
      );
      return this.db.$transaction(async (tx) => {
        await tx.attendanceLogChild.deleteMany({
          where: { attendanceMasterId: id },
        });
        await tx.attendanceLogChild.createMany({
          data: dto.entries!.map((e) => ({
            attendanceMasterId: id,
            studentId: e.studentId,
            status: e.status,
            remarks: e.remarks,
          })),
        });
        return tx.attendanceLogMaster.findUnique({
          where: { id },
          include: { children: true },
        });
      });
    }
    return record;
  }
  async submit(userId: string, id: string) {
    const currentStaff = await this.staffForUser(userId);
    const record = await this.db.attendanceLogMaster.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) throw new NotFoundException('Attendance not found');
    if (record.takenBy !== currentStaff.id)
      throw new ForbiddenException(
        'You are not allowed to submit this attendance',
      );
    if (record.status !== AttendanceMasterStatus.DRAFT)
      throw new ConflictException('Attendance has already been submitted');
    return this.db.attendanceLogMaster.update({
      where: { id },
      data: {
        status: AttendanceMasterStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: { children: true },
    });
  }
  async remove(userId: string, id: string) {
    const currentStaff = await this.staffForUser(userId);
    const record = await this.db.attendanceLogMaster.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) throw new NotFoundException('Attendance not found');
    if (record.takenBy !== currentStaff.id)
      throw new ForbiddenException(
        'You are not allowed to delete this attendance',
      );
    if (record.status !== AttendanceMasterStatus.DRAFT)
      throw new ConflictException(
        'Submitted attendance cannot be deleted',
      );
    return this.db.attendanceLogMaster.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
  private async staffForUser(userId: string) {
    const staff = await this.db.staff.findUnique({ where: { userId } });
    if (!staff || !staff.status)
      throw new ForbiddenException('Active staff profile required');
    return staff;
  }
  private async authorizeRead(
    staffId: string,
    academicYearId: string,
    classId: string,
    sectionId: string,
  ) {
    if (
      !(await this.db.teachingAssignment.findFirst({
        where: {
          staffId,
          classId,
          sectionId,
          class: { program: { academicYearId } },
        },
      }))
    )
      throw new ForbiddenException(
        'You are not assigned to this class and section',
      );
  }
  private validateEntries(entries: { studentId: string }[], valid: string[]) {
    const validSet = new Set(valid);
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.studentId))
        throw new BadRequestException(
          'Duplicate student entries are not allowed',
        );
      if (!validSet.has(entry.studentId))
        throw new BadRequestException('Attendance contains an invalid student');
      seen.add(entry.studentId);
    }
    if (seen.size !== validSet.size)
      throw new BadRequestException(
        'Every valid student must appear exactly once',
      );
  }
  private date(value: string) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    )
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    return date;
  }
  private validateDate(date: Date, start: Date, end: Date) {
    const d = date.getTime();
    if (
      d <
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
        ) ||
      d > Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
    )
      throw new BadRequestException(
        'date must be within the academic year date range',
      );
  }
  private range(query: QueryAttendanceDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('from must be before or equal to to');
    return {
      ...(query.date && { date: this.date(query.date) }),
      ...((query.from || query.to) && {
        date: {
          ...(query.from && { gte: this.date(query.from) }),
          ...(query.to && { lte: this.date(query.to) }),
        },
      }),
    };
  }
  private uniqueError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
