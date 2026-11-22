import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { SchoolsService } from '../schools/schools.service.js';
import { QueryFeeDashboardDto } from './dto/query-fee-dashboard.dto.js';
import { FeeDashboardResponseDto } from './dto/fee-dashboard-response.dto.js';
import { AdmissionStatus } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class FeeManagementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly schoolsService: SchoolsService,
  ) {}

  async getDashboard(
    userId: string,
    query: QueryFeeDashboardDto,
  ): Promise<FeeDashboardResponseDto> {
    const schoolId = await this.schoolsService.resolveActiveSchool(userId);
    const config = await this.schoolsService.getConfiguration(schoolId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 25;

    // Unconfigured or invalid configuration: return empty state without fallback
    if (
      !config.isConfigured ||
      config.isInvalid ||
      !config.activeAcademicYearId ||
      !config.activeAcademicYear
    ) {
      return {
        configured: false,
        invalidConfiguration: config.isInvalid,
        activeAcademicYear: null,
        data: [],
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      };
    }

    const trimmedSearch = query.search?.trim();

    // Pure database-level query scoping — zero cross-school rows in memory
    const where: Prisma.AdmissionWhereInput = {
      schoolId,
      academicYearId: config.activeAcademicYearId,
      admissionStatus: AdmissionStatus.CONFIRMED,
      isActive: true,
      deletedAt: null,
      ...(trimmedSearch && trimmedSearch.length > 0 && {
        OR: [
          { studentName: { contains: trimmedSearch, mode: 'insensitive' } },
          { admissionNumber: { contains: trimmedSearch, mode: 'insensitive' } },
          { student: { studentName: { contains: trimmedSearch, mode: 'insensitive' } } },
        ],
      }),
      ...(query.classId && { classId: query.classId }),
      ...(query.programId && { programId: query.programId }),
    };

    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.db.admission.findMany({
        where,
        select: {
          id: true,
          admissionNumber: true,
          admissionSequence: true,
          admissionStatus: true,
          studentName: true,
          confirmedAt: true,
          createdAt: true,
          program: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          student: { select: { id: true, studentNumber: true, studentName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.db.admission.count({ where }),
    ]);

    return {
      configured: true,
      invalidConfiguration: false,
      activeAcademicYear: {
        id: config.activeAcademicYear.id,
        name: config.activeAcademicYear.name,
        startDate: config.activeAcademicYear.startDate,
        endDate: config.activeAcademicYear.endDate,
      },
      data: rows,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }
}
