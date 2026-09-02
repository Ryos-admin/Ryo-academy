import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateAdmissionDto, CreateFeePaymentDetailsDto, CreateFeePaymentHeaderDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto } from "./dto/update-admission.dto.js";
import { AdmissionStatus } from "../../../generated/prisma/enums.js";
import { AdmissionRepository } from "./admission.repository.js";

@Injectable()
export class AdmissionService {
    constructor(private readonly databaseService: DatabaseService, private readonly admissionRepository: AdmissionRepository) {}

    async findAll() {
        return this.databaseService.admission.findMany();
    }

    async findById(id: string) {
        return this.databaseService.admission.findUnique({
            where: { id },
        });
    }

    async create(dto: CreateAdmissionDto) {

        const { academicSeq, classCount, schoolCode } = 
            await this.admissionRepository.generateSequenceNumber(dto.schoolId, dto.academicYearId, dto.programId, dto.classId);

        
        dto.admissionNumber = academicSeq;
        dto.admissionSequence = classCount;
        dto.schoolId = schoolCode ?? dto.schoolId;

        const completeFeeStructure = 
            await this.admissionRepository.findFeeStructurebyId(dto);

        if (completeFeeStructure?.feeComponents && completeFeeStructure?.feeComponents?.length > 0)
        {
            throw new BadRequestException('Kindly provide proper details.');
        }



        await this.databaseService.$transaction(async (tx) => {
            const admissionDetails = await tx.admission.create({
                data: {
                    admissionNumber: dto.admissionNumber,
                    schoolId: dto.schoolId,
                    academicYearId: dto.academicYearId,
                    programId: dto.programId,
                    classId: dto.classId,
                    studentName: dto.studentName,
                    gender: dto.gender,
                    dateOfBirth: dto.dateOfBirth,
                    parentName: dto.parentName,
                    parentRelation: dto.parentRelation,
                    parentPhone: dto.parentPhone,
                    parentAlternatePhone: dto.parentAlternatePhone,
                    parentEmail: dto.parentEmail,
                    addressLine1: dto.addressLine1,
                    addressLine2: dto.addressLine2,
                    city: dto.city,
                    state: dto.state,
                    country: dto.country,
                    pincode: dto.postalCode,
                    admissionSequence: dto.admissionSequence,
                    createdById: dto.createdById,
                },
            });

            const feePaymentHeader = await tx.feePaymentHeader.create({
                data:{
                    admissionId: admissionDetails.id,
                    academicYearId: admissionDetails.academicYearId,
                    feeStructureId: completeFeeStructure?.id || '',
                    discountAmount: 0,
                    grossAmount: 0,
                    netAmount: 0, 
                    totalPaidAmount: 0,
                    totalDueAmount: +(completeFeeStructure?.totalAmount ?? 0),
                    totalFeeAmount: +(completeFeeStructure?.totalAmount ?? 0),
                }
            });

            const feeComponents = completeFeeStructure?.feeComponents?.flat() ?? [];

            if (feeComponents.length) {
                await tx.feePaymentDetails.createMany({
                    data: feeComponents.map((feeComponent) => ({
                        ...feeComponent,
                        feePaymentHeaderId: feePaymentHeader.id,
                        feeComponentId: feeComponent.id,
                        nameSnapshot: feeComponent.name,
                        originalAmount: feeComponent.amount,
                        discountAmount: 0,
                        netAmount: feeComponent.amount,
                        finalAmount: feeComponent.amount,
                        totalAmountToBePaid: feeComponent.amount,
                        amountPaid: 0,
                        paymentDate: new Date(),
                        paidAmount: 0,
                        dueAmount: feeComponent.amount,
                        isActive: true,
                    })),
                });
            }

            return admissionDetails;
        })
        
        
    }

    async updateById(id: string, dto: UpdateAdmissionDto) {

        const existingFeeData = await this.admissionRepository.getFeePaymentByAdmissionId(dto.admissionId);

        const admission = await this.databaseService.admission.update({
            where: { id },
            data: {
                ...(dto.studentName !== undefined && { studentName: dto.studentName }),
                ...(dto.programId !== undefined && { programId: dto.programId }),
                ...(dto.classId !== undefined && { classId: dto.classId }),
                ...(dto.gender !== undefined && { gender: dto.gender }),
                ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth }),
                ...(dto.parentName !== undefined && { parentName: dto.parentName }),
                ...(dto.parentRelation !== undefined && { parentRelation: dto.parentRelation }),
                ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone }),
                ...(dto.parentAlternatePhone !== undefined && { parentAlternatePhone: dto.parentAlternatePhone }),
                ...(dto.parentEmail !== undefined && { parentEmail: dto.parentEmail }),
                ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1 }),
                ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2 }),
                ...(dto.city !== undefined && { city: dto.city }),
                ...(dto.state !== undefined && { state: dto.state }),
                ...(dto.country !== undefined && { country: dto.country }),
                ...(dto.postalCode !== undefined && { pincode: dto.postalCode }),
            }
        });

        const feeStructureId = (existingFeeData as { feeStructureId?: string } | null | undefined)?.feeStructureId ?? '';
        const feePaymentHeader = await this.admissionRepository.updateFeePaymentDet(dto.feePaymentHeaders, feeStructureId)

        return {...admission, feePaymentHeaders: {...feePaymentHeader}};
    }

    async updateStatusById(id: string, status: string) {
        const admission = await this.databaseService.admission.update({
            where: { id },
            data: {
                admissionStatus: status as AdmissionStatus,
            }
        });

        if (status === 'CONFIRMED') {
            await this.databaseService.student.create({
                data: {
                    admissionId: admission.id,
                    studentName: admission.studentName,
                    studentNumber: admission.admissionSequence.toString(),
                    studentSequence: admission.admissionSequence,
                    dateOfBirth: admission.dateOfBirth,
                    gender: admission.gender,

                }
            })
        }
        return admission;
    }
}