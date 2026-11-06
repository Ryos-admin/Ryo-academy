import { ConflictException, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateSectionDto } from "./dto/create-section.dto.js";
import { UpdateSectionDto } from "./dto/update-section.dto.js";

@Injectable()
export class SectionService {
    constructor(private readonly databaseService: DatabaseService) {}

    async findAllSections() {
        try {
            return this.databaseService.section.findMany({
                where: { isActive: true, deletedAt: null },
                orderBy: [{ name: 'asc' }],
            });
        }
        catch (error) {
            throw error;
        }
    }

    async findSectionByClassId(classId: string) {
        try {
            const sections = await this.databaseService.section.findMany({
                where: { classId, isActive: true, deletedAt: null },
            });
            if (!sections || sections.length === 0) {
                throw new NotFoundException(`No sections found for class with id "${classId}"`);
            }
            return sections;
        }
        catch (error) {
            throw error;
        }
    }

    async createSectionByClassId(dto: CreateSectionDto) {
        try {
            const classExists = await this.databaseService.class.findUnique({
                where: { id: dto.classId, isActive: true, deletedAt: null },
                select: { id: true },
            });

            if (!classExists) {
                throw new NotFoundException(`Class with id "${dto.classId}" not found`);
            }

            const sectionExists = await this.databaseService.section.findFirst({
                where: { name: dto.name, classId: dto.classId, isActive: true, deletedAt: null },
            });

            if (sectionExists) {
                throw new ConflictException(`Section with name "${dto.name}" already exists for class with id "${dto.classId}"`);
            }

            await this.databaseService.section.create({
                data: {
                    name: dto.name,
                    classId: dto.classId,
                },
            });
        }
        catch (error) {
            throw error;
        }
    }

    async updateSectionById(id: string, dto: UpdateSectionDto) {
        try {
            const sectionExists = await this.databaseService.section.findUnique({
                where: { id, isActive: true, deletedAt: null },
            });

            if (!sectionExists) {
                throw new NotFoundException(`Section with id "${id}" not found`);
            }

            if (dto.name) {
                const duplicateSection = await this.databaseService.section.findFirst({
                    where: { name: dto.name, classId: sectionExists.classId, isActive: true, deletedAt: null },
                });

                if (duplicateSection && duplicateSection.id !== id) {
                    throw new ConflictException(`Section with name "${dto.name}" already exists for class with id "${sectionExists.classId}"`);
                }
            }

            return await this.databaseService.section.update({
                where: { id },
                data: dto,
            });
        }
        catch (error) {
            throw error;
        }
    }

    async remove(id: string, actorUserId: string) {
    // Verify actor and school ownership
    const actor = await this.databaseService.user.findUnique({
      where: { id: actorUserId },
      select: { schoolId: true },
    });
    if (!actor?.schoolId) throw new ForbiddenException('A school-scoped user is required');

    // Load section with its class -> program -> academicYear to get school
    const sectionWithSchool = await this.databaseService.section.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        isActive: true,
        deletedAt: true,
        class: {
          select: {
            program: {
              select: {
                academicYear: { select: { schoolId: true } },
              },
            },
          },
        },
      },
    });
    if (!sectionWithSchool || sectionWithSchool.isActive === false || sectionWithSchool.deletedAt) {
      throw new NotFoundException(`Section with id "${id}" not found`);
    }
    const sectionSchoolId = sectionWithSchool.class?.program?.academicYear?.schoolId;
    if (sectionSchoolId !== actor.schoolId) throw new ForbiddenException('Cross-school deletion not allowed');

    // Guard: active DRAFT or CONFIRMED admissions
    const blockingAdmission = await this.databaseService.admission.findFirst({
      where: {
        sectionId: id,
        isActive: true,
        deletedAt: null,
        admissionStatus: { in: ['DRAFT', 'CONFIRMED'] },
      },
      select: { id: true },
    });
    if (blockingAdmission) {
      throw new ConflictException('Section cannot be deleted while active admissions exist.');
    }

    // Guard: submitted attendance logs
    const blockingAttendance = await this.databaseService.attendanceLogMaster.findFirst({
      where: {
        sectionId: id,
        isActive: true,
        deletedAt: null,
        status: 'SUBMITTED',
      },
      select: { id: true },
    });
    if (blockingAttendance) {
      throw new ConflictException('Section cannot be deleted while submitted attendance records exist.');
    }

    // Soft-delete with actor attribution
    return this.databaseService.section.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date(), deletedById: actorUserId },
    });
  }

}


