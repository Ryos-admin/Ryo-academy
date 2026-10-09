import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateSectionDto } from "./dto/create-section.dto.js";
import { UpdateSectionDto } from "./dto/update-section.dto.js";

@Injectable()
export class SectionService {
    constructor(private readonly databaseService: DatabaseService) {}

    async findAllSections() {
        try {
            return this.databaseService.section.findMany({
                where: { isActive: true },
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
                where: { classId, isActive: true },
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
                where: { id: dto.classId, isActive: true },
                select: { id: true },
            });

            if (!classExists) {
                throw new NotFoundException(`Class with id "${dto.classId}" not found`);
            }

            const sectionExists = await this.databaseService.section.findFirst({
                where: { name: dto.name, classId: dto.classId, isActive: true },
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
                where: { id, isActive: true },
            });

            if (!sectionExists) {
                throw new NotFoundException(`Section with id "${id}" not found`);
            }

            if (dto.name) {
                const duplicateSection = await this.databaseService.section.findFirst({
                    where: { name: dto.name, classId: sectionExists.classId, isActive: true },
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

    async remove(id: string) {
        const section = await this.databaseService.section.findFirst({ where: { id, isActive: true } });
        if (!section) throw new NotFoundException(`Section with id "${id}" not found`);
        return this.databaseService.section.update({ where: { id }, data: { isActive: false } });
    }

}
