import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateClassDto } from "./dto/create-class.dto.js";
import { DatabaseService } from "../../database/database.service.js";
import { UpdateClassDto } from "./dto/update-class.dto.js";

@Injectable()
export class ClassService {
    constructor(private readonly databaseService: DatabaseService) {}

    async createClass(dto: CreateClassDto) {
        try {
            const program = await this.databaseService.program.findUnique({
                where: { id: dto.programId },
                select: { id: true, name: true },
            });

            const isClassExists = await this.databaseService.class.findUnique({
                where: {
                    programId_name: {
                        name: dto.name,
                        programId: dto.programId,
                    },
                },
            });

            if (!program) {
                throw new NotFoundException(`Program with id "${dto.programId}" not found`);
            }
            if (isClassExists) {
                throw new NotFoundException(`Class with name "${dto.name}" already exists for program "${dto.programId}".`);
            }
            return await this.databaseService.$transaction(async (tx) => {
                const newClass = await tx.class.create({
                    data: {
                        name: dto.name,
                        programId: dto.programId,
                    },
                });

                await tx.section.create({
                    data: {
                        name: 'Section 1',
                        classId: newClass.id,
                    },
                });
                return newClass;
            });
        } catch (error) {
            if (error?.code === 'P2002') {
                throw new NotFoundException(`Class with name "${dto.name}" already exists for program "${dto.programId}".`);
            }
            throw error;
        }
    }

    async findAllClasses() {
        try {
            return await this.databaseService.class.findMany({
                orderBy: [{ name: 'asc' }],
            });
        } catch (error) {
            throw error;
        }
    }

    async findClassById(id: string) {
        try {
            const classData = await this.databaseService.class.findUnique({
                where: { id },
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
            const classData = await this.databaseService.class.findUnique({
                where: { id },
            });

            if (!classData) {
                throw new NotFoundException(`Class with id "${id}" not found`);
            }

            return await this.databaseService.class.update({
                where: { id },
                data: {
                    name: dto.name,
                },
            });
        } catch (error) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Class with name "${dto.name}" already exists for program.`);
            }
            throw error;
        }
    }


}