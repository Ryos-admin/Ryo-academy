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
                where: { classId },
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
                where: { id: dto.classId },
                select: { id: true },
            });

            if (!classExists) {
                throw new NotFoundException(`Class with id "${dto.classId}" not found`);
            }

            const sectionExists = await this.databaseService.section.findFirst({
                where: { name: dto.name, classId: dto.classId },
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
                where: { id },
            });

            if (!sectionExists) {
                throw new NotFoundException(`Section with id "${id}" not found`);
            }

            if (dto.name) {
                const duplicateSection = await this.databaseService.section.findFirst({
                    where: { name: dto.name, classId: sectionExists.classId },
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

}