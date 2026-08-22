import { DatabaseService } from "../../database/database.service.js";
import { CreateProgramDto } from "./dto/create-program.dto.js";
import { DayOfWeek } from "generated/prisma/client.js";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

@Injectable()
export class ProgramService {
    constructor(private readonly databaseService: DatabaseService) {}

    async createPrgm(dto: CreateProgramDto) {
        try {
            const academicYearId = await this.databaseService.academicYear.findUnique({
                where: { id: dto.academicYear },
                select: { id: true, name: true },
            });

            if (!academicYearId) {
                throw new NotFoundException(`Academic year with id "${dto.academicYear}" not found`);
            }

            if (dto.startTime >= dto.endTime) {
                throw new BadRequestException(`Start time must be before end time`);
            }

            console.log(academicYearId);
            

            return this.databaseService.program.create({
                data: {
                    name: dto.name,
                    academicYear: { connect: { id: academicYearId.id } },
                    isPrimary: dto.isPrimary,
                    daysOfWeek: dto.daysOfWeek as DayOfWeek[],
                    startTime: dto.startTime,
                    endTime: dto.endTime
                }
            });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new BadRequestException(`Program with name "${dto.name}" already exists for academic year "${dto.academicYear}".`);
            }
            throw error;    
        }
    }

    async findAllPrgms() {
        try {
        return this.databaseService.program.findMany({
            orderBy: [{ name: 'asc' }, { academicYearId: 'desc' }, { isPrimary: 'desc' }],
        });
        }
        catch (error) {
            throw error;
        }
    }    

    async fingPrgmByName(name: string) {
        try {
            const program = await this.databaseService.program.findMany({
                where: { name },
            });
            if (!program || program.length === 0) {
                throw new NotFoundException(`Program with name "${name}" not found`);
            }
            return program;
        } catch (error) {
            throw error;
        }
    }

    async findPrgmById(id: string) {
        try {
            const program = await this.databaseService.program.findUnique({
                where: { id },
            });
            if (!program) {
                throw new NotFoundException(`Program with id "${id}" not found`);
            }
            return program;
        } catch (error) {
            throw error;
        }
    }

    async updatePrgm(id: string, dto: Partial<CreateProgramDto>) {
        try {
            const existingProgram = await this.findPrgmById(id);

            if (!existingProgram) {
                throw new NotFoundException(`Program with id "${id}" not found`);
            }

            if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
                throw new BadRequestException(`Start time must be before end time`);
            }

            return this.databaseService.program.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.academicYear !== undefined && { academicYear: { connect: { id: dto.academicYear } } }),
                    ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
                    ...(dto.daysOfWeek !== undefined && { daysOfWeek: dto.daysOfWeek as DayOfWeek[] }),
                    ...(dto.startTime !== undefined && { startTime: dto.startTime }),
                    ...(dto.endTime !== undefined && { endTime: dto.endTime }),
                },
            });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new BadRequestException(`Program with name "${dto.name}" already exists for academic year "${dto.academicYear}".`);
            }
            throw error;    
        }
    }

    
}