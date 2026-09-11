import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FeeStructureDto } from "./dto/fee-structure.dto.js";
import { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class FeeStructureService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: FeeStructureDto) {
        await this.validateFeeStructure(dto);

        try{

            return await this.databaseService.$transaction(async (tx) => {
                const newFeeStructure = await tx.feeStructure.create({
                    data: {
                        name: dto.name,
                        description: dto.description,
                        academicYearId: dto.academicYearId,
                        programId: dto.programId,
                        classId: dto.classId,
                        totalAmount: dto.totalAmount,
                    },
                });

                await tx.feeComponent.createMany({
                    data: dto.feeComponents.map((item: any) => ({
                        name: item.name,
                        description: item.description,
                        amount: item.amount,
                        feeStructureId: newFeeStructure.id,
                        discountApplicable: item.discountApplicable ?? false,
                        isMandatory: item.isMandatory ?? true,
                    })),
                });

                return tx.feeStructure.findUniqueOrThrow({
                    where: { id: newFeeStructure.id },
                    include: { feeComponents: true },
                });
            })
        }
        catch (error: any) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Fee structure already exists for the selected academic year, program, and class.`);
            }
            throw error;            
        }
    }

    async find() {
        return this.databaseService.feeStructure.findMany({
            where: { isActive: true },
            orderBy: [{ academicYearId: 'asc' }, { name: 'asc' }],
            include: this.readRelations(true),
        });
    }

    async findById(id: string) {
        const feeStructure = await this.databaseService.feeStructure.findUnique({
            where: { id },
            include: this.readRelations(false),
        });
        if (!feeStructure) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
        return feeStructure;
    }

    async update(id: string, dto: UpdateFeeStructureDto) {
        try{
            const existing = await this.databaseService.feeStructure.findUnique({ where: { id } });
            if (!existing) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
            if (dto.totalAmount !== undefined && dto.totalAmount <= 0) {
                throw new BadRequestException('Total amount must be greater than zero.');
            }

            return await this.databaseService.feeStructure.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.totalAmount !== undefined && { totalAmount: dto.totalAmount }),
                    ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                },
                include: this.readRelations(false),
            });
        }
        catch(error: any) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Fee structure already exists for the selected academic year, program, and class.`);
            }
            throw error;
        }
    }

    async delete(id: string) {
        const existing = await this.databaseService.feeStructure.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
        return this.databaseService.feeStructure.update({
            where: { id },
            data: { isActive: false },
            include: this.readRelations(false),
        });
    }

    private async validateFeeStructure(dto: FeeStructureDto) {
        if (dto.totalAmount <= 0) throw new BadRequestException('Total amount must be greater than zero.');
        if (dto.feeComponents.some((item) => item.amount <= 0)) {
            throw new BadRequestException('Every fee component amount must be greater than zero.');
        }
        const academicYear = await this.databaseService.academicYear.findUnique({ where: { id: dto.academicYearId } });
        if (!academicYear) throw new NotFoundException(`Academic year with ID "${dto.academicYearId}" does not exist.`);
        const program = await this.databaseService.program.findFirst({ where: { id: dto.programId, academicYearId: dto.academicYearId } });
        if (!program) throw new NotFoundException(`Program with ID "${dto.programId}" does not belong to the selected academic year.`);
        const classEntity = await this.databaseService.class.findFirst({ where: { id: dto.classId, programId: dto.programId } });
        if (!classEntity) throw new NotFoundException(`Class with ID "${dto.classId}" does not belong to the selected program.`);
    }

    private readRelations(activeComponents: boolean) {
        return {
            academicYear: { select: { id: true, name: true } },
            program: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
            feeComponents: {
                ...(activeComponents ? { where: { isActive: true } } : {}),
                orderBy: { name: 'asc' as const },
            },
        };
    }

}

