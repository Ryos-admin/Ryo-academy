import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateAdmissionDto, CreateFeePaymentHeaderDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto, UpdateFeePaymentHeaderDto } from "./dto/update-admission.dto.js";
import { isNotEmpty } from "class-validator";
import { error } from "console";

@Injectable()
export class AdmissionRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    async findFeeStructurebyId(dto: CreateAdmissionDto) {
        

        let feeStructure = await this.databaseService.feeStructure.findFirst({
            where: { academicYearId: dto.academicYearId, programId: dto.programId, classId: dto.classId, isActive: true }
        })

        let feeComponents = await this.databaseService.feeComponent.findMany({
            where: { feeStructureId: feeStructure?.id, isActive: true }

        });

        return feeComponents && feeComponents.length > 0
            ? { ...feeStructure, feeComponents: [feeComponents] }
            : null;

    }

    async generateSequenceNumber(schoolId: string, academicYearId: string, programId: string, classId: string) {

        const schoolDet = await this.databaseService.school.findUnique({
            where: {id: schoolId},
            select: { id: true, schoolCode: true }
        })
        const academicYear = await this.databaseService.academicYear.findFirst({
            where: { id: academicYearId, schoolId },
            select: { id: true, name: true, schoolId: true }
        })

        const program = await this.databaseService.program.findFirstOrThrow({
            where: { id: programId, academicYearId: academicYearId },
            select: { id: true, name: true },
        });

        const classEntity = await this.databaseService.class.findFirstOrThrow({
            where: { id: classId, programId: programId },
            select: { id: true, name: true },
        });

        if (!schoolDet || !academicYear || !program || !classEntity ){
            throw new BadRequestException("Kindly check given school / academic year / Program / Classes.")
        }

        const academicYrCount = await this.databaseService.admission.count({
            where: {academicYearId}
        });

        const classCount = await this.databaseService.admission.count({
            where: {academicYearId, programId, classId}
        });

        const academicSeq = this.generateAdmissionSeries(academicYear.id, schoolDet.schoolCode, academicYrCount);

        return {academicSeq, classCount, schoolCode: academicYear.schoolId }

    }

    async getFeePaymentByAdmissionId( admissionId: string ) {
        const feePaymentHeader = await this.databaseService.feePaymentHeader.findMany({
            where: {admissionId},
            // select: {admissionId: true, feeStructureId: true, grossAmount: true, discountAmount: true, netAmount: true, totalPaidAmount: true, totalDueAmount: true, totalFeeAmount: true}
        });

        const feePaymentDetails = await this.databaseService.feePaymentDetails.findMany({
            where: { feePaymentHeaderId: { in: feePaymentHeader.map(({ id }) => id) } }
        })

        return feePaymentDetails && feePaymentDetails.length > 0
            ? { ...feePaymentHeader, feePaymentDetails: [feePaymentDetails] }
            : null;

    }

    // async getFeeMasterByAcademicDet ( dto: UpdateAdmissionDto ) {
    //     const existingFeeDet = await this.getFeePaymentByAdmissionId(dto.admissionId);

    //     if (existingFeeDet != null && isNotEmpty(existingFeeDet))
    //     if (existingFeeDet?.totalPaidAmount || existingFeeDet?.totalPaidAmount > 0) {
    //         throw new BadRequestException("For this Admission, Fee is already paid, Kindly cancel and create again if needed");
    //     }
    // }

    async updateFeePaymentDet ( dto : UpdateFeePaymentHeaderDto, feeStructureId: string ) {
        
        let feePaymentHeader;

        if (feeStructureId === dto.feeStructureId) {
            feePaymentHeader = await this.databaseService.feePaymentHeader.update({
                where: {id: dto.id, feeStructureId: dto.feeStructureId},
                data: {
                    ...(dto.grossAmount !== undefined && { grossAmount: dto.grossAmount } ),
                    ...(dto.discountAmount !== undefined && { discountAmount: dto.discountAmount } ),
                    ...(dto.netAmount !== undefined && { netAmount: dto.netAmount } ),
                    ...(dto.totalPaidAmount !== undefined && { totalPaidAmount: dto.totalPaidAmount } ),
                    ...(dto.totalDueAmount !== undefined && { totalDueAmount: dto.totalDueAmount } ),
                    ...(dto.totalFeeAmount !== undefined && { totalFeeAmount: dto.totalFeeAmount } ),
                    ...(dto.grossAmount !== undefined && { grossAmount: dto.grossAmount } ),
                }
            });
        }
        else {
            feePaymentHeader = await this.databaseService.feePaymentHeader.create({
                data: {
                    admissionId: dto.admissionId,
                    academicYearId: dto.academicYearId || '',
                    feeStructureId: dto?.feeStructureId || '',
                    discountAmount: +(dto?.discountAmount ?? 0),
                    grossAmount: +(dto?.grossAmount ?? 0),
                    netAmount: +(dto?.netAmount ?? 0), 
                    totalPaidAmount: +(dto?.totalPaidAmount ?? 0),
                    totalDueAmount: +(dto?.totalDueAmount ?? 0),
                    totalFeeAmount: +(dto?.totalFeeAmount ?? 0),
                }
            });
        }

        const feePaymentDetails = dto.feePaymentDetails ?? [];

        if (feePaymentDetails.length > 0) {
            const detailUpdates = feePaymentDetails.filter((detail) => !!detail.id);
            const detailCreates = feePaymentDetails.filter((detail) => !detail.id);

            await Promise.all(
                detailUpdates.map(async ({ id, feePaymentHeaderId, ...detail }) => {
                    if (!id) return;

                    await this.databaseService.feePaymentDetails.update({
                        where: { id },
                        data: {
                            ...detail,
                            feePaymentHeaderId: feePaymentHeader.id,
                        },
                    });
                })
            );

            if (detailCreates.length > 0) {
                await this.databaseService.feePaymentDetails.createMany({
                    data: detailCreates.map((detail) => {
                        const { id, feePaymentHeaderId, ...rest } = detail as any;

                        return {
                            ...rest,
                            feePaymentHeaderId: feePaymentHeader.id,
                            nameSnapshot: rest.nameSnapshot ?? "",
                            finalAmount: Number(rest.finalAmount ?? rest.originalAmount ?? 0),
                            totalAmountToBePaid: Number(rest.totalAmountToBePaid ?? rest.originalAmount ?? 0),
                        };
                    }),
                });
            }
        }

        return feePaymentHeader;
    }

    private generateAdmissionSeries(academicYr: string, schoolCode: string, academicSeq: number){
        let tempAcademicYr = academicYr.split('-').map(yr => yr.slice(-2)).join();
        return `${schoolCode}-${tempAcademicYr}-${String(academicSeq).padStart(6, '0')}`;
    }
}