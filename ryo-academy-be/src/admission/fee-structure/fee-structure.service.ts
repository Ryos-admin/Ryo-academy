import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FeeStructureDto } from "./dto/fee-structure.dto.js";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class FeeStructureService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: FeeStructureDto) {

        if (await this.validateFeeComponents(dto)) return;

        try{

            return await this.databaseService.$transaction(async (tx) => {
                const newFeeStructure = await tx.feeStructure.create({
                    data: {
                        name: dto.name,
                        description: dto.description,
                        academicYearId: dto.academicYearId,
                        programId: dto.programId,
                        classId: dto.classId,
                        totalAmount: +dto.totalAmount,
                    },
                });

                await tx.feeComponent.createMany({
                    data: dto.feeComponents.map((item: any) => ({
                        name: item.name,
                        description: item.description,
                        amount: +item.amount,
                        feeStructureId: newFeeStructure.id,
                        discountApplicable: item.discountApplicable,
                    })),
                });

                return {errorMessage: "Fee structure created successfully"};
            })
        }
        catch (error: any) {
            if (error?.code === 'P2002') {
                throw new BadRequestException(`Program with name "${dto.name}" already exists for academic year.`);
            }
            throw error;            
        }
    }

    async find() {
        try{
            let feeStructure = await this.databaseService.feeStructure.findMany({
                orderBy: [{academicYearId: 'asc', name: 'asc', }]
            });

            return feeStructure;
        }
        catch(error) {
            throw error;
        }
    }

    async findById(id: string) {
        try{
            let feeStructure = await this.databaseService.feeStructure.findUnique({
                where: { id },
            });
            return feeStructure;
        }
        catch(error) {
            throw error;
        }
    }

    async update(id: string, dto: FeeStructureDto) {
        try{
            if (await this.validateFeeComponents(dto)) return;

            return await this.databaseService.feeStructure.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description }),
                    ...(dto.academicYearId !== undefined && { academicYearId: dto.academicYearId }),
                    ...(dto.programId !== undefined && { programId: dto.programId }),
                    ...(dto.classId !== undefined && { classId: dto.classId }),
                    ...(dto.totalAmount !== undefined && { totalAmount: +dto.totalAmount }),
                },
            });
        }
        catch(error: any) {
            if (error?.code === 'P2002') {
                throw new ConflictException(`Fee structure with name "${dto.name}" already exists for academic year.`);
            }
            throw error;
        }
    }

    async delete(id: string) {
        try{
            return await this.databaseService.feeStructure.update({
                where: { id },
                data: {
                    isActive: true,
                },
            });
        }
        catch(error) {
            throw error;
        }
    }

    
    async validateFeeComponents ( feeStructure: FeeStructureDto) {
        let validate = true;



        if (!(+feeStructure?.totalAmount < 1)) {
            throw new BadRequestException("Total amount must be a positive number");
        }

        let total = 0;

        feeStructure.feeComponents && feeStructure.feeComponents.forEach((item: any ) => {
            if (!(+item.amount <1)) {
                throw new BadRequestException(total + `Fee component "${item.name}" must have a positive amount. `);
            }

            total += +item.amount;

            if (total < 1) {
                throw new BadRequestException(total + `Total amount of fee components must be a positive number. `);
            }
            
        });

        try {
            const academicYear = await this.databaseService.academicYear.findUnique({
                where: { id: feeStructure.academicYearId },
                select: { id: true, name: true },
            });

            if (!academicYear) {
                validate = false;
                throw new Error(`Academic year with id "${feeStructure.academicYearId}" not found`);
            }

            const program = await this.databaseService.program.findUnique({
                where: { id: feeStructure.programId, academicYearId: feeStructure.academicYearId },
                select: { id: true, name: true },
            });

            if (!program) {
                validate = false;
                throw new Error(`Program with id "${feeStructure.programId}" not found`);
            }

            const classEntity = await this.databaseService.class.findUnique({
                where: { id: feeStructure.classId, programId: feeStructure.programId },
                select: { id: true, name: true },
            });

            if (!classEntity) {
                validate = false;
                throw new Error(`Class with id "${feeStructure.classId}" not found`);
            }

            return validate;
        }
        catch (err: Object | any) {
            throw new NotFoundException(err.message);
        }
    }

}

