import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateFeePaymentHeaderDto } from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto, UpdateFeePaymentHeaderDto } from "./dto/update-admission.dto.js";
import { isNotEmpty } from "class-validator";
import { error } from "console";
import { parseMoney } from "../../common/money/money.util.js";

@Injectable()
export class AdmissionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findActiveFeeStructures(
    scope: { academicYearId: string; programId: string; classId: string },
    client: Pick<DatabaseService, 'feeStructure'> = this.databaseService,
  ) {
    return client.feeStructure.findMany({
      where: {
        academicYearId: scope.academicYearId,
        programId: scope.programId,
        classId: scope.classId,
        isActive: true,
      },
      include: {
        feeComponents: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  async generateSequenceNumber(
    schoolId: string,
    academicYearId: string,
    programId: string,
    classId: string,
  ) {
    let schoolDet: { id: string; schoolCode: string } | null = null;

    if (schoolId.includes("(") && schoolId.includes(")")) {
      const match = schoolId.match(/\(([^)]+)\)/);
      if (match) {
        schoolDet = await this.databaseService.school.findUnique({
          where: { schoolCode: match[1] },
          select: { id: true, schoolCode: true },
        });
      }
    }

    if (!schoolDet && schoolId) {
      schoolDet = await this.databaseService.school.findUnique({
        where: { id: schoolId },
        select: { id: true, schoolCode: true },
      });
    }

    if (!schoolDet && schoolId) {
      schoolDet = await this.databaseService.school.findUnique({
        where: { schoolCode: schoolId },
        select: { id: true, schoolCode: true },
      });
    }
    const academicYear = await this.databaseService.academicYear.findFirst({
      where: { id: academicYearId, schoolId: schoolDet?.id },
      select: { id: true, name: true, schoolId: true },
    });

    // Resolve without throwing: a missing or mis-parented reference must fall
    // through to the controlled check below rather than escaping as a Prisma
    // P2025 (HTTP 500). The guard is the intended failure path.
    const program = await this.databaseService.program.findFirst({
      where: { id: programId, academicYearId: academicYearId },
      select: { id: true, name: true },
    });

    const classEntity = await this.databaseService.class.findFirst({
      where: { id: classId, programId: programId },
      select: { id: true, name: true },
    });

    if (!schoolDet || !academicYear || !program || !classEntity) {
      throw new BadRequestException(
        "Kindly check given school / academic year / Program / Classes.",
      );
    }

    const academicYrCount = await this.databaseService.admission.count({
      where: { academicYearId },
    });

    const classCount = await this.databaseService.admission.count({
      where: { academicYearId, programId, classId },
    });

    const academicSeq = this.generateAdmissionSeries(
      academicYear.id,
      schoolDet.schoolCode,
      academicYrCount,
    );

    return { academicSeq, classCount, schoolCode: academicYear.schoolId };
  }

  async getFeePaymentByAdmissionId(admissionId: string) {
    const feePaymentHeader = await this.databaseService.feePaymentHeader.findFirst({
      where: { admissionId },
      orderBy: { createdAt: "desc" },
      include: {
        feePaymentDetails: true,
      },
    });

    return feePaymentHeader;
  }

  // async getFeeMasterByAcademicDet ( dto: UpdateAdmissionDto ) {
  //     const existingFeeDet = await this.getFeePaymentByAdmissionId(dto.admissionId);
  //
  //     if (existingFeeDet != null && isNotEmpty(existingFeeDet))
  //     if (existingFeeDet?.totalPaidAmount || existingFeeDet?.totalPaidAmount > 0) {
  //         throw new BadRequestException("For this Admission, Fee is already paid, Kindly cancel and create again if needed");
  //     }
  // }

  async updateFeePaymentDet(dto: UpdateFeePaymentHeaderDto, feeStructureId: string) {
    return this.databaseService.$transaction(async (tx) => {
      let feePaymentHeader;

      if (dto.id && feeStructureId && feeStructureId === dto.feeStructureId) {
        feePaymentHeader = await tx.feePaymentHeader.update({
          where: { id: dto.id, feeStructureId: dto.feeStructureId },
          data: {
            ...(dto.grossAmount !== undefined && { grossAmount: parseMoney(dto.grossAmount, 'grossAmount') }),
            ...(dto.discountAmount !== undefined && { discountAmount: parseMoney(dto.discountAmount, 'discountAmount') }),
            ...(dto.netAmount !== undefined && { netAmount: parseMoney(dto.netAmount, 'netAmount') }),
            ...(dto.totalPaidAmount !== undefined && { totalPaidAmount: parseMoney(dto.totalPaidAmount, 'totalPaidAmount') }),
            ...(dto.totalDueAmount !== undefined && { totalDueAmount: parseMoney(dto.totalDueAmount, 'totalDueAmount') }),
            ...(dto.totalFeeAmount !== undefined && { totalFeeAmount: parseMoney(dto.totalFeeAmount, 'totalFeeAmount') }),
          },
        });
      } else {
        feePaymentHeader = await tx.feePaymentHeader.create({
          data: {
            admissionId: dto.admissionId,
            academicYearId: dto.academicYearId || "",
            feeStructureId: dto?.feeStructureId || "",
            discountAmount: parseMoney(dto?.discountAmount ?? '0', 'discountAmount'),
            grossAmount: parseMoney(dto?.grossAmount ?? '0', 'grossAmount'),
            netAmount: parseMoney(dto?.netAmount ?? '0', 'netAmount'),
            totalPaidAmount: parseMoney(dto?.totalPaidAmount ?? '0', 'totalPaidAmount'),
            totalDueAmount: parseMoney(dto?.totalDueAmount ?? '0', 'totalDueAmount'),
            totalFeeAmount: parseMoney(dto?.totalFeeAmount ?? '0', 'totalFeeAmount'),
          },
        });
      }

      const feePaymentDetails = dto.feePaymentDetails ?? [];

      if (feePaymentDetails.length > 0) {
        const detailUpdates = feePaymentDetails.filter((detail) => !!detail.id);
        const detailCreates = feePaymentDetails.filter((detail) => !detail.id);

        for (const { id, feePaymentHeaderId, ...detail } of detailUpdates) {
          if (!id) continue;
          await tx.feePaymentDetails.update({
            where: { id },
            data: {
              ...detail,
              originalAmount: parseMoney(detail.originalAmount, 'originalAmount'),
              discountAmount: parseMoney(detail.discountAmount, 'discountAmount'),
              amountPaid: parseMoney(detail.amountPaid, 'amountPaid'),
              feePaymentHeaderId: feePaymentHeader.id,
            },
          });
        }

        if (detailCreates.length > 0) {
          await tx.feePaymentDetails.createMany({
            data: detailCreates.map((detail) => {
              const { id, feePaymentHeaderId, ...rest } = detail as any;

              return {
                ...rest,
                feePaymentHeaderId: feePaymentHeader.id,
                nameSnapshot: rest.nameSnapshot ?? "",
                originalAmount: parseMoney(rest.originalAmount, 'originalAmount'),
                discountAmount: parseMoney(rest.discountAmount, 'discountAmount'),
                amountPaid: parseMoney(rest.amountPaid, 'amountPaid'),
                finalAmount: parseMoney(rest.finalAmount ?? rest.originalAmount, 'finalAmount'),
                totalAmountToBePaid: parseMoney(rest.totalAmountToBePaid ?? rest.originalAmount, 'totalAmountToBePaid'),
              };
            }),
          });
        }
      }

      return tx.feePaymentHeader.findUniqueOrThrow({
        where: { id: feePaymentHeader.id },
        include: { feePaymentDetails: true },
      });
    });
  }

  private generateAdmissionSeries(academicYr: string, schoolCode: string, academicSeq: number) {
    let tempAcademicYr = academicYr
      .split("-")
      .map((yr) => yr.slice(-2))
      .join();
    return `${schoolCode}-${tempAcademicYr}-${String(academicSeq).padStart(6, "0")}`;
  }
}
