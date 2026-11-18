import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { UpdateSchoolConfigurationDto } from './dto/update-school-configuration.dto.js';
import { SchoolConfigurationResponseDto } from './dto/school-configuration-response.dto.js';

@Injectable()
export class SchoolsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Canonical tenant resolution: verifies user and school existence and active states.
   * Throws ForbiddenException if actor is inactive, soft-deleted, missing a school, or if school is inactive.
   */
  async resolveActiveSchool(actorUserId: string): Promise<string> {
    const actor = await this.db.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, schoolId: true, isActive: true, deletedAt: true },
    });

    if (!actor || !actor.isActive || actor.deletedAt !== null) {
      throw new ForbiddenException('User is inactive or deleted');
    }

    if (!actor.schoolId) {
      throw new ForbiddenException('A school-scoped user is required');
    }

    const school = await this.db.school.findUnique({
      where: { id: actor.schoolId },
      select: { id: true, isActive: true },
    });

    if (!school || !school.isActive) {
      throw new ForbiddenException('School is inactive or not found');
    }

    return school.id;
  }

  /**
   * Returns current school configuration including the active academic year summary.
   */
  async getConfiguration(schoolId: string): Promise<SchoolConfigurationResponseDto> {
    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      include: {
        activeAcademicYear: true,
      },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const isInvalid = Boolean(
      school.activeAcademicYear &&
      (school.activeAcademicYear.deletedAt !== null || !school.activeAcademicYear.isActive),
    );

    const isConfigured = Boolean(school.activeAcademicYearId && !isInvalid);

    return {
      schoolId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      activeAcademicYearId: isConfigured ? school.activeAcademicYearId : null,
      activeAcademicYear: isConfigured && school.activeAcademicYear
        ? {
            id: school.activeAcademicYear.id,
            name: school.activeAcademicYear.name,
            startDate: school.activeAcademicYear.startDate,
            endDate: school.activeAcademicYear.endDate,
            isActive: school.activeAcademicYear.isActive,
          }
        : null,
      isConfigured,
      isInvalid,
    };
  }

  /**
   * Updates the school's configured active academic year.
   * Validates same-school ownership and active/non-deleted state.
   * Never mutates AcademicYear entity state.
   */
  async updateConfiguration(
    schoolId: string,
    dto: UpdateSchoolConfigurationDto,
  ): Promise<SchoolConfigurationResponseDto> {
    const academicYear = await this.db.academicYear.findUnique({
      where: { id: dto.activeAcademicYearId },
    });

    console.log('Academic Year fetched:', academicYear, schoolId);

    if (!academicYear) {
      throw new NotFoundException('Academic year not found');
    }

    // Invariant: Cross-school rejection
    if (academicYear.schoolId !== schoolId) {
      throw new BadRequestException('Academic year does not belong to this school');
    }

    // Invariant: Soft-deleted or inactive rejection
    if (academicYear.deletedAt !== null || !academicYear.isActive) {
      throw new BadRequestException('Cannot configure a soft-deleted or inactive academic year');
    }

    // Update School entity without mutating AcademicYear
    await this.db.school.update({
      where: { id: schoolId },
      data: { activeAcademicYearId: dto.activeAcademicYearId },
    });

    return this.getConfiguration(schoolId);
  }
}
