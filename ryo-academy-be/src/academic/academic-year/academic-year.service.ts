import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto.js';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto.js';

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
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `Academic year with name "${dto.name}" already exists for school.`,
        );
      }
      throw error;
    }
  }

  async findAll() {
    return this.databaseService.academicYear.findMany({
      orderBy: [{ schoolId: 'asc' }, { startDate: 'desc' }],
    });
  }

  async findOne(id: string) {
    const academicYear = await this.databaseService.academicYear.findUnique({
      where: { id },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year with id "${id}" not found`);
    }
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
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `Academic year name already exists for this school.`,
        );
      }
      throw error;
    }
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }
}
