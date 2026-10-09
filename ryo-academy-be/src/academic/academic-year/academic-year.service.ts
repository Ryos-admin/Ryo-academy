import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
      where: { id, isActive: true },
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

  async remove(id: string) {
    await this.findOne(id);
    return this.databaseService.academicYear.update({ where: { id }, data:{ isActive: false } });
  }

  private validateDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException("startDate must be before endDate");
    }
  }
}
