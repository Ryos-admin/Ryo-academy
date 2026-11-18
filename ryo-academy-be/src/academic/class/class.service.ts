import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { CreateClassDto } from "./dto/create-class.dto.js";
import { DatabaseService } from "../../database/database.service.js";
import { UpdateClassDto } from "./dto/update-class.dto.js";

@Injectable()
export class ClassService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createClass(dto: CreateClassDto) {
    try {
      return await this.databaseService.$transaction(async (tx) => {
        const program = await tx.program.findUnique({
          where: { id: dto.programId, isActive: true, deletedAt: null },
          select: { id: true, name: true, academicYearId: true },
        });

        if (!program) {
          throw new NotFoundException(`Program with id "${dto.programId}" not found`);
        }

        const ayRows = await tx.$queryRaw<
          Array<{ id: string; isActive: boolean; deletedAt: Date | null }>
        >`
          SELECT id, status, "isActive", "deletedAt"
          FROM "AcademicYear"
          WHERE id = ${program.academicYearId}
          FOR SHARE
        `;
        const ay = ayRows[0];
        if (!ay || !ay.isActive || ay.deletedAt !== null) {
          throw new ConflictException("Academic year does not exist or is inactive");
        }

        const isClassExists = await tx.class.findUnique({
          where: {
            programId_name: {
              name: dto.name,
              programId: dto.programId,
            },
          },
        });

        if (isClassExists) {
          throw new NotFoundException(
            `Class with name "${dto.name}" already exists for program "${dto.programId}".`,
          );
        }

        const newClass = await tx.class.create({
          data: {
            name: dto.name,
            programId: dto.programId,
          },
        });

        await tx.section.create({
          data: {
            name: "Section 1",
            classId: newClass.id,
          },
        });
        return newClass;
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new NotFoundException(
          `Class with name "${dto.name}" already exists for program "${dto.programId}".`,
        );
      }
      throw error;
    }
  }

  async findAllClasses() {
    try {
      return await this.databaseService.class.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ name: "asc" }],
      });
    } catch (error) {
      throw error;
    }
  }

  async findClassById(id: string) {
    try {
      const classData = await this.databaseService.class.findUnique({
        where: { id, isActive: true, deletedAt: null },
        include: {
          program: {
            select: {
              academicYearId: true,
            },
          },
        },
      });

      if (!classData) {
        throw new NotFoundException(`Class with id "${id}" not found`);
      }
      return classData;
    } catch (error) {
      throw error;
    }
  }

  async updateClassById(id: string, dto: UpdateClassDto) {
    try {
      return await this.databaseService.$transaction(async (tx) => {
        const classData = await tx.class.findUnique({
          where: { id, isActive: true, deletedAt: null },
          select: {
            id: true,
            programId: true,
            program: { select: { academicYearId: true } },
          },
        });

        if (!classData) {
          throw new NotFoundException(`Class with id "${id}" not found`);
        }

        if ((dto as any).programId !== undefined && (dto as any).programId !== classData.programId) {
          throw new BadRequestException("Class cannot be reassigned to a different Program.");
        }

        // const ayId = classData.program?.academicYearId;
        // if (ayId) {
        //   const ayRows = await tx.$queryRaw<Array<{ id: string; }>>`
        //     SELECT id, status FROM "AcademicYear" WHERE id = ${ayId} FOR SHARE
        //   `;
        //   if (ayRows.length > 0 ) {
        //     throw new ConflictException(
        //       "Class cannot be modified when Academic Year is not in DRAFT status",
        //     );
        //   }
        // }

        return await tx.class.update({
          where: { id },
          data: {
            name: dto.name,
          },
        });
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ConflictException(`Class with name "${dto.name}" already exists for program.`);
      }
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    const runInTx = async (tx: any) => {
      // Verify actor and school ownership
      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { schoolId: true },
      });
      if (!actor?.schoolId) throw new ForbiddenException("A school-scoped user is required");

      // Load class with its school via program → academicYear
      const classWithSchool = await tx.class.findUnique({
        where: { id },
        select: {
          id: true,
          programId: true,
          isActive: true,
          deletedAt: true,
          program: {
            select: {
              academicYear: { select: { id: true, schoolId: true } },
            },
          },
        },
      });
      if (!classWithSchool || classWithSchool.isActive === false || classWithSchool.deletedAt) {
        throw new NotFoundException(`Class with id "${id}" not found`);
      }
      const classSchoolId = classWithSchool.program?.academicYear?.schoolId;
      if (classSchoolId !== actor.schoolId)
        throw new ForbiddenException("Cross-school deletion not allowed");

      // const ayId = classWithSchool.program?.academicYear?.id;
      // if (ayId) {
      //   const ayRows =
      //     typeof tx.$queryRaw === "function"
      //       ? await tx.$queryRaw<Array<{ id: string; status: AcademicYearStatus }>>`
      //           SELECT id, status FROM "AcademicYear" WHERE id = ${ayId} FOR SHARE
      //         `
      //       : [];
      //   if (ayRows.length > 0 && ayRows[0].status !== AcademicYearStatus.DRAFT) {
      //     throw new ConflictException(
      //       "Class cannot be deleted when Academic Year is not in DRAFT status",
      //     );
      //   }
      // }

      // Guard: active DRAFT or CONFIRMED admissions
      const blockingAdmission = await tx.admission.findFirst({
        where: {
          classId: id,
          isActive: true,
          deletedAt: null,
          admissionStatus: { in: ["DRAFT", "CONFIRMED"] },
        },
        select: { id: true },
      });
      if (blockingAdmission) {
        throw new ConflictException("Class cannot be deleted while active admissions exist.");
      }

      // Guard: submitted attendance logs
      const blockingAttendance = await tx.attendanceLogMaster.findFirst({
        where: {
          classId: id,
          isActive: true,
          deletedAt: null,
          status: "SUBMITTED",
        },
        select: { id: true },
      });
      if (blockingAttendance) {
        throw new ConflictException(
          "Class cannot be deleted while submitted attendance records exist.",
        );
      }

      // Soft-delete with actor attribution
      return tx.class.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), deletedById: actorUserId },
      });
    };

    if (typeof this.databaseService.$transaction === "function") {
      return await this.databaseService.$transaction(runInTx);
    }
    return await runInTx(this.databaseService);
  }
}
