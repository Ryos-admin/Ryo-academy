import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateFeeComponentDto } from "./dto/create-fee-component.dto.js";
import { UpdateFeeComponentDto } from "./dto/update-fee-component.dto.js";

@Injectable()
export class FeeComponentService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: CreateFeeComponentDto) {
        try {

            const feeStructure = await this.databaseService.feeStructure.findUnique({
                where: { id: dto.feeStructureId },
            });

            if (!feeStructure) {
                throw new NotFoundException(`Fee structure with ID does not exist.`);
            }

            const existingFeeComponent = await this.databaseService.feeComponent.findFirst({
                where: {
                    name: dto.name,
                    feeStructureId: dto.feeStructureId,
                },
            });

            if (existingFeeComponent) {
                throw new ConflictException(`Fee component with name "${dto.name}" already exists for fee structure.`);
            }

            return await this.databaseService.feeComponent.create({
                data: {
                    name: dto.name,
                    description: dto.description,
                    amount: +dto.amount,
                    feeStructureId: dto.feeStructureId,
                    discountApplicable: dto.discountApplicable,
                    isMandatory: dto.isMandatory,
                },
            });

        }catch (error) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Fee component with name "${dto.name}" already exists for fee structure ".`);
            }
            throw error;
        }
    }

    async update(id: string, dto: UpdateFeeComponentDto) {
        try {

            const existingFeeComponent = await this.databaseService.feeComponent.findFirst({
                where: { id },
            });

            if (!existingFeeComponent) {
                throw new NotFoundException(`Fee component with name "${dto.name}" does not exists for fee structure.`);
            }

            return await this.databaseService.feeComponent.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.amount !== undefined && { amount: +dto.amount }),
                    ...(dto.discountApplicable !== undefined && { discountApplicable: dto.discountApplicable }),
                    ...(dto.isMandatory !== undefined && { isMandatory: dto.isMandatory }),
                },
            });

        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Fee component with name "${dto.name}" already exists for fee structure.`);
            }
            throw error;
        }
    }

    async delete(id: string) {
        try {
            const existingFeeComponent = await this.databaseService.feeComponent.findFirst({
                where: { id },
            });

            if (!existingFeeComponent) {
                throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
            }

            return await this.databaseService.feeComponent.delete({
                where: { id },
            });
        }
        catch (error) {
            throw error;
        }
    }

    async findAll() {
        try {
            return await this.databaseService.feeComponent.findMany();
        }
        catch (error) {
            throw error;
        }
    }

    async findById(id: string) {
        try {
            const feeComponent = await this.databaseService.feeComponent.findUnique({
                where: { id },
            });

            if (!feeComponent) {
                throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
            }

            return feeComponent;
        }
        catch (error) {
            throw error;
        }
    }
}