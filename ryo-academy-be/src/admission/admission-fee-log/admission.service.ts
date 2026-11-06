import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import {
  CreateAdmissionDto,
  ApplicableFeeConfigurationQueryDto,
} from "./dto/create-admission.dto.js";
import { UpdateAdmissionDto, UpdateAdmissionFeeConfigurationDto } from "./dto/update-admission.dto.js";
import { AdmissionStatus } from "../../../generated/prisma/enums.js";
import { AdmissionRepository } from "./admission.repository.js";
import "../../common/money/decimal-precision.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { DiscountCalculator } from "../fee-concession/discount-calculator.js";
import { AdmissionInstallmentScheduleService } from "../installment/admission-installment-schedule.service.js";
import { ScheduleCalculatorService } from "../installment/schedule-calculator.service.js";
import { InstallmentTemplateService } from "../installment/installment-template.service.js";
import { parseMoney, serializeMoney } from "../../common/money/money.util.js";

@Injectable()
export class AdmissionService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly admissionRepository: AdmissionRepository,
    private readonly scheduleService?: AdmissionInstallmentScheduleService,
  ) {}

  private getScheduleService(): AdmissionInstallmentScheduleService {
    if (this.scheduleService) {
      return this.scheduleService;
    }
    return new AdmissionInstallmentScheduleService(
      this.databaseService,
      new ScheduleCalculatorService(),
      new InstallmentTemplateService(this.databaseService),
    );
  }

  async findAll() {
    return this.databaseService.admission.findMany({ where: { isActive: true, deletedAt: null } });
  }

  async findById(id: string) {
    const admission = await this.databaseService.admission.findUnique({
      where: { id, isActive: true, deletedAt: null },
      include: {
        student: {
          select: {
            id: true,
            studentNumber: true,
            studentName: true,
          },
        },
      },
    });

    if (!admission) {
      throw new NotFoundException(`Admission with id "${id}" not found`);
    }

    return admission;
  }

  async getApplicableFeeConfiguration(query: ApplicableFeeConfigurationQueryDto) {
    const master = this.requireUniqueFeeMaster(
      await this.admissionRepository.findActiveFeeStructures(query),
    );
    if (master.feeComponents.length === 0) {
      throw new NotFoundException('The matching fee structure has no active fee components.');
    }
    return this.toFeeConfigurationPreview(master);
  }

  async create(dto: CreateAdmissionDto) {
    this.validateSelectedComponentIds(dto.selectedFeeComponentIds);
    await this.validateSection(dto.classId, dto.sectionId);

    const { academicSeq, classCount, schoolCode } =
      await this.admissionRepository.generateSequenceNumber(
        dto.schoolId ?? "",
        dto.academicYearId,
        dto.programId,
        dto.classId,
      );

    dto.admissionNumber = academicSeq;
    dto.admissionSequence = classCount;
    dto.schoolId = schoolCode ?? dto.schoolId ?? "";

    return await this.databaseService.$transaction(async (tx) => {
      const feeStructure = this.requireUniqueFeeMaster(
        await this.admissionRepository.findActiveFeeStructures(dto, tx),
      );
      const feeComponents = feeStructure.feeComponents;
      if (feeComponents.length === 0) {
        throw new BadRequestException(
          "An active Fee Structure with at least one active Fee Component is required.",
        );
      }

      const activeComponentIds = new Set(feeComponents.map(({ id }) => id));
      for (const selectedId of dto.selectedFeeComponentIds) {
        if (!activeComponentIds.has(selectedId)) {
          throw new BadRequestException(
            `Selected fee component "${selectedId}" is not active in the applicable fee structure.`,
          );
        }
      }
      const selectedIds = new Set(dto.selectedFeeComponentIds);
      const missingMandatory = feeComponents.find(
        (component) => component.isMandatory && !selectedIds.has(component.id),
      );
      if (missingMandatory) {
        throw new BadRequestException(
          `Mandatory fee component "${missingMandatory.id}" must be selected.`,
        );
      }

      const grossAmount = feeComponents.reduce(
        (sum, component) =>
          selectedIds.has(component.id)
            ? sum.plus(new Prisma.Decimal(component.amount.toString()))
            : sum,
        new Prisma.Decimal(0),
      );

      const admissionDetails = await tx.admission.create({
        data: {
          admissionNumber: dto.admissionNumber ?? "",
          schoolId: dto.schoolId ?? "",
          academicYearId: dto.academicYearId,
          programId: dto.programId,
          classId: dto.classId,
          sectionId: dto.sectionId,
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
          admissionSequence: dto.admissionSequence ?? 0,
          createdById: dto.createdById,
        },
      });

      const feePaymentHeader = await tx.feePaymentHeader.create({
        data: {
          admissionId: admissionDetails.id,
          academicYearId: admissionDetails.academicYearId,
          feeStructureId: feeStructure.id,
          discountAmount: new Prisma.Decimal(0),
          grossAmount,
          netAmount: grossAmount,
          totalPaidAmount: new Prisma.Decimal(0),
          totalDueAmount: grossAmount,
          totalFeeAmount: grossAmount,
        },
      });

      const createdAt = new Date();
      await tx.feePaymentDetails.createMany({
        data: feeComponents.map((feeComponent) => {
          const originalAmount = new Prisma.Decimal(feeComponent.amount.toString());
          return {
            feePaymentHeaderId: feePaymentHeader.id,
            feeComponentId: feeComponent.id,
            nameSnapshot: feeComponent.name,
            isActive: true,
            isIncluded: selectedIds.has(feeComponent.id),
            originalAmount,
            discountApplicable: feeComponent.discountApplicable,
            isMandatory: feeComponent.isMandatory,
            discountAmount: new Prisma.Decimal(0),
            finalAmount: originalAmount,
            totalAmountToBePaid: originalAmount,
            amountPaid: new Prisma.Decimal(0),
            paymentDate: createdAt,
          };
        }),
      });

      const savedAdmission = await tx.admission.findUniqueOrThrow({
        where: { id: admissionDetails.id },
        include: {
          feePaymentHeaders: {
            where: { id: feePaymentHeader.id },
            include: { feePaymentDetails: { orderBy: { nameSnapshot: 'asc' } } },
          },
        },
      });
      const header = savedAdmission.feePaymentHeaders[0];
      if (!header) throw new Error('Created fee header could not be reloaded.');
      return {
        ...admissionDetails,
        feeConfiguration: {
          feePaymentHeaderId: feePaymentHeader.id,
          feeStructureId: feeStructure.id,
          grossAmount: serializeMoney(grossAmount),
          components: header.feePaymentDetails.map((detail) => ({
            feePaymentDetailsId: detail.id,
            feeComponentId: detail.feeComponentId,
            nameSnapshot: detail.nameSnapshot,
            originalAmount: serializeMoney(detail.originalAmount),
            isDiscountApplicable: detail.discountApplicable,
            isMandatory: detail.isMandatory,
            included: detail.isIncluded,
            discountAmount: serializeMoney(detail.discountAmount),
            payableAmount: serializeMoney(detail.totalAmountToBePaid),
            amountPaid: serializeMoney(detail.amountPaid),
          })),
        },
      };
    });
  }

  private requireUniqueFeeMaster<T extends { feeComponents: unknown[] }>(masters: T[]): T {
    if (masters.length === 0) {
      throw new NotFoundException('No active fee structure matches the selected academic year, program, and class.');
    }
    if (masters.length > 1) {
      throw new ConflictException('More than one active fee structure matches the selected academic year, program, and class.');
    }
    return masters[0];
  }

  private validateSelectedComponentIds(selectedIds: unknown): asserts selectedIds is string[] {
    if (
      !Array.isArray(selectedIds) ||
      selectedIds.length === 0 ||
      selectedIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(selectedIds).size !== selectedIds.length
    ) {
      throw new BadRequestException('selectedFeeComponentIds must be a non-empty array of unique component IDs.');
    }
  }

  private toFeeConfigurationPreview(master: {
    id: string;
    name: string;
    description: string | null;
    totalAmount: Prisma.Decimal;
    academicYearId: string;
    programId: string;
    classId: string;
    feeComponents: Array<{
      id: string;
      name: string;
      description: string | null;
      amount: Prisma.Decimal;
      discountApplicable: boolean;
      isMandatory: boolean;
    }>;
  }) {
    return {
      feeStructure: {
        id: master.id,
        name: master.name,
        totalAmount: serializeMoney(master.totalAmount),
        academicYearId: master.academicYearId,
        programId: master.programId,
        classId: master.classId,
        description: master.description,
      },
      components: master.feeComponents.map((component) => ({
        id: component.id,
        name: component.name,
        originalAmount: serializeMoney(component.amount),
        isDiscountApplicable: component.discountApplicable,
        isMandatory: component.isMandatory,
        description: component.description,
        initiallySelected: true,
        locked: component.isMandatory,
      })),
    };
  }

  async updateById(id: string, dto: UpdateAdmissionDto) {
    const existingAdmission = await this.databaseService.admission.findUnique({
      where: { id, isActive: true },
    });
    if (!existingAdmission) throw new BadRequestException(`Admission with id "${id}" not found`);
    if (dto.feePaymentHeaders && existingAdmission.admissionStatus === "CONFIRMED") {
      throw new BadRequestException("Fee structure and obligations cannot be modified after admission confirmation.");
    }
    if (dto.feePaymentHeaders) {
      throw new BadRequestException("Fee configuration must be changed through /admission/:id/fee-configuration.");
    }

    const classIdChanged = dto.classId !== undefined && existingAdmission.classId !== dto.classId;
    const sectionIdChanged =
      dto.sectionId !== undefined && existingAdmission.sectionId !== dto.sectionId;

    if (existingAdmission.admissionStatus === "CONFIRMED" && (classIdChanged || sectionIdChanged)) {
      throw new BadRequestException(
        "Class or section cannot be changed after admission confirmation",
      );
    }

    // The section still has to belong to the class it is finally paired with,
    // which for a partial update is the stored class when none is supplied.
    if (dto.classId !== undefined || dto.sectionId !== undefined) {
      await this.validateSection(
        dto.classId ?? existingAdmission.classId,
        dto.sectionId ?? existingAdmission.sectionId,
      );
    }

    const admissionUpdate = {
      ...(dto.studentName !== undefined && { studentName: dto.studentName }),
      ...(dto.programId !== undefined && { programId: dto.programId }),
      ...(dto.classId !== undefined && { classId: dto.classId }),
      ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
      ...(dto.gender !== undefined && { gender: dto.gender }),
      ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth }),
      ...(dto.parentName !== undefined && { parentName: dto.parentName }),
      ...(dto.parentRelation !== undefined && {
        parentRelation: dto.parentRelation,
      }),
      ...(dto.parentPhone !== undefined && { parentPhone: dto.parentPhone }),
      ...(dto.parentAlternatePhone !== undefined && {
        parentAlternatePhone: dto.parentAlternatePhone,
      }),
      ...(dto.parentEmail !== undefined && { parentEmail: dto.parentEmail }),
      ...(dto.addressLine1 !== undefined && {
        addressLine1: dto.addressLine1,
      }),
      ...(dto.addressLine2 !== undefined && {
        addressLine2: dto.addressLine2,
      }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.postalCode !== undefined && { pincode: dto.postalCode }),
    };

    if (Object.keys(admissionUpdate).length === 0 && !dto.feePaymentHeaders) {
      throw new BadRequestException("No updatable admission fields were provided.");
    }

    if (existingAdmission.admissionStatus === "CONFIRMED" && dto.feePaymentHeaders) {
      throw new BadRequestException("Fee structure and obligations cannot be modified after admission confirmation.");
    }

    const admission =
      Object.keys(admissionUpdate).length > 0
        ? await this.databaseService.admission.update({
            where: { id },
            data: admissionUpdate,
          })
        : existingAdmission;

    if (!dto.feePaymentHeaders) return admission;

    const existingFeeData = await this.admissionRepository.getFeePaymentByAdmissionId(
      dto.admissionId ?? id,
    );

    const feeStructureId =
      (existingFeeData as { feeStructureId?: string } | null | undefined)?.feeStructureId ?? "";
    const feePaymentHeader = await this.admissionRepository.updateFeePaymentDet(
      dto.feePaymentHeaders,
      feeStructureId,
    );

    return { ...admission, feePaymentHeaders: { ...feePaymentHeader } };
  }

  async getFeeConfiguration(id: string) {
    const admission = await this.databaseService.admission.findUnique({
      where: { id, isActive: true, deletedAt: null },
      include: { feePaymentHeaders: { where: { isActive: true }, include: { feePaymentDetails: { where: { isActive: true }, include: { concession: true } } } } },
    }) as any;
    if (!admission) throw new NotFoundException(`Admission with id "${id}" not found`);
    return this.feeConfigurationResult(admission, this.requireFeeHeader(admission.feePaymentHeaders));
  }

  async updateFeeConfiguration(id: string, dto: UpdateAdmissionFeeConfigurationDto) {
    if (new Set(dto.selectedFeeComponentIds).size !== dto.selectedFeeComponentIds.length) {
      throw new BadRequestException('selectedFeeComponentIds must not contain duplicates.');
    }
    return this.databaseService.$transaction(async (tx) => {
      await this.lockAdmission(tx, id);
      const admission = await tx.admission.findUnique({
        where: { id, isActive: true, deletedAt: null },
        include: { feePaymentHeaders: { where: { isActive: true }, include: { feePaymentDetails: { where: { isActive: true }, include: { concession: true } } } } },
      }) as any;
      if (!admission) throw new NotFoundException(`Admission with id "${id}" not found`);
      if (admission.admissionStatus !== AdmissionStatus.DRAFT) throw new ConflictException('Fee configuration can only be changed while the admission is DRAFT.');
      const header = this.requireFeeHeader(admission.feePaymentHeaders);
      const details = header.feePaymentDetails as any[];
      const allDetails = await tx.feePaymentDetails.findMany({
        where: { feePaymentHeaderId: header.id },
        select: { amountPaid: true },
      });
      await this.assertNoFeeActivity(tx, header, allDetails);
      this.assertFeeSnapshotConsistency(header, details);
      const byId = new Map(details.map((detail) => [detail.id, detail]));
      const selected = new Set(dto.selectedFeeComponentIds);
      for (const id of selected) {
        const detail = byId.get(id);
        if (!detail) throw new BadRequestException(`Fee component snapshot "${id}" is not active for this admission.`);
      }
      for (const detail of details) if (detail.isMandatory && !selected.has(detail.id)) throw new BadRequestException(`Mandatory fee component "${detail.id}" must remain selected.`);
      for (const detail of details) {
        const nextIncluded = selected.has(detail.id);
        if (nextIncluded === detail.isIncluded) continue;
        const original = new Prisma.Decimal(detail.originalAmount.toString());
        const data: any = { isIncluded: nextIncluded };
        if (nextIncluded) {
          data.discountAmount = new Prisma.Decimal(0);
          data.finalAmount = original;
          data.totalAmountToBePaid = original;
          if (detail.concession) await tx.admissionFeeConcession.update({ where: { id: detail.concession.id }, data: { requiresReview: true } });
        }
        await tx.feePaymentDetails.update({ where: { id: detail.id }, data });
      }
      await this.recomputeFeeHeader(tx, header.id);
      const refreshed = await tx.admission.findUnique({ where: { id }, include: { feePaymentHeaders: { where: { id: header.id }, include: { feePaymentDetails: { where: { isActive: true }, include: { concession: true } } } } } }) as any;
      return this.feeConfigurationResult(refreshed, this.requireFeeHeader(refreshed.feePaymentHeaders));
    });
  }

  private requireFeeHeader(headers: any[]) {
    if (!headers?.length) throw new NotFoundException('Active fee payment header not found for admission.');
    if (headers.length !== 1) throw new ConflictException('Admission has multiple active fee payment headers.');
    return headers[0];
  }

  private feeConfigurationResult(admission: any, header: any) {
    return { admissionId: admission.id, feePaymentHeader: { id: header.id, grossAmount: serializeMoney(header.grossAmount), discountAmount: serializeMoney(header.discountAmount), netAmount: serializeMoney(header.netAmount), totalFeeAmount: serializeMoney(header.totalFeeAmount), totalPaidAmount: serializeMoney(header.totalPaidAmount), totalDueAmount: serializeMoney(header.totalDueAmount), feePaymentDetails: header.feePaymentDetails.map((detail: any) => ({ id: detail.id, feeComponentId: detail.feeComponentId, name: detail.name, originalAmount: serializeMoney(detail.originalAmount), discountAmount: serializeMoney(detail.discountAmount), finalAmount: serializeMoney(detail.finalAmount), totalAmountToBePaid: serializeMoney(detail.totalAmountToBePaid), amountPaid: serializeMoney(detail.amountPaid), isMandatory: detail.isMandatory, discountApplicable: detail.discountApplicable, isActive: detail.isActive, isIncluded: detail.isIncluded, concession: detail.concession ? { id: detail.concession.id, requiresReview: detail.concession.requiresReview, calculationMode: detail.concession.calculationMode } : null })) } };
  }

  private assertFeeSnapshotConsistency(header: any, details: any[]) {
    const applicable = details.filter((detail) => detail.isIncluded);
    let gross = new Prisma.Decimal(0), discount = new Prisma.Decimal(0), net = new Prisma.Decimal(0);
    for (const detail of applicable) {
      const original = new Prisma.Decimal(detail.originalAmount.toString());
      const discounted = new Prisma.Decimal(detail.discountAmount.toString());
      const payable = new Prisma.Decimal(detail.totalAmountToBePaid.toString());
      if (original.minus(discounted).equals(payable) && new Prisma.Decimal(detail.finalAmount.toString()).equals(payable)) { gross = gross.plus(original); discount = discount.plus(discounted); net = net.plus(payable); } else throw this.financialSnapshotError(detail.id);
    }
    if (!new Prisma.Decimal(header.grossAmount.toString()).equals(gross) || !new Prisma.Decimal(header.discountAmount.toString()).equals(discount) || !new Prisma.Decimal(header.netAmount.toString()).equals(net) || !new Prisma.Decimal(header.totalFeeAmount.toString()).equals(net) || !new Prisma.Decimal(header.totalDueAmount.toString()).equals(net.minus(new Prisma.Decimal(header.totalPaidAmount.toString())))) throw this.financialSnapshotError();
  }

  private async assertNoFeeActivity(tx: any, header: any, details: any[]) {
    const [payments, allocations, reversals] = await Promise.all([
      tx.feePayment.count({ where: { feePaymentHeaderId: header.id } }),
      tx.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: header.id } }),
      tx.paymentReversalEvent.count({ where: { feePayment: { feePaymentHeaderId: header.id } } }),
    ]);
    if (payments || allocations || reversals || details.some((detail) => !new Prisma.Decimal(detail.amountPaid.toString()).isZero()) || !new Prisma.Decimal(header.totalPaidAmount.toString()).isZero()) throw new ConflictException('Fee configuration cannot be changed after financial activity.');
  }

  private async recomputeFeeHeader(tx: any, headerId: string) {
    const header = await tx.feePaymentHeader.findUnique({ where: { id: headerId } });
    const details = await tx.feePaymentDetails.findMany({ where: { feePaymentHeaderId: headerId, isActive: true, isIncluded: true } });
    let gross = new Prisma.Decimal(0), discount = new Prisma.Decimal(0), net = new Prisma.Decimal(0);
    for (const detail of details) { gross = gross.plus(detail.originalAmount); discount = discount.plus(detail.discountAmount); net = net.plus(detail.totalAmountToBePaid); }
    const paid = new Prisma.Decimal(header.totalPaidAmount.toString());
    await tx.feePaymentHeader.update({ where: { id: headerId }, data: { grossAmount: gross, discountAmount: discount, netAmount: net, totalFeeAmount: net, totalPaidAmount: paid, totalDueAmount: net.minus(paid) } });
  }

  private async validateSection(classId: string, sectionId: string) {
    const section = await this.databaseService.section.findUnique({
      where: { id: sectionId },
      select: { id: true, classId: true },
    });
    if (!section) throw new BadRequestException(`Section with id "${sectionId}" not found`);
    if (section.classId !== classId)
      throw new BadRequestException("Section does not belong to the selected class");
  }

  async updateStatusById(id: string, user: object, status: string) {
    if (status !== "CONFIRMED" && status !== "CANCELLED") {
      throw new BadRequestException(`Unsupported admission status "${status}"`);
    }

    return this.databaseService.$transaction(async (tx) => {
      await this.lockAdmission(tx, id);

      const existingAdmission = await tx.admission.findUnique({
        where: { id },
      });

      if (!existingAdmission) {
        throw new NotFoundException(`Admission with id "${id}" not found`);
      }

      if (status === "CONFIRMED") {
        if (existingAdmission.admissionStatus !== "DRAFT") {
          throw new ConflictException(
            `Admission with id "${id}" cannot be confirmed from status ${existingAdmission.admissionStatus}`,
          );
        }

        const existingStudent = await tx.student.findUnique({
          where: { admissionId: existingAdmission.id },
          select: { id: true },
        });

        if (existingStudent) {
          throw new ConflictException(`Admission with id "${id}" already has a Student`);
        }

        const actorId = (user as any)?.userId ?? (user as any)?.id;

        // Validate the active, included fee snapshots before confirmation writes.
        const headers = await tx.feePaymentHeader.findMany({
          where: { admissionId: existingAdmission.id, isActive: true },
          orderBy: { id: "asc" },
          include: {
            feePaymentDetails: { include: { concession: true } },
            payments: { include: { reversalEvent: true } },
            installmentAllocations: true,
          },
        });

        const zero = new Prisma.Decimal(0);
        const totals = new Map<string, Prisma.Decimal>();
        const includedCount = headers.reduce(
          (count, header) => count + header.feePaymentDetails.filter(
            (detail) => detail.isActive && detail.isIncluded,
          ).length,
          0,
        );
        if (includedCount === 0) {
          throw new ConflictException({
            code: "NO_INCLUDED_FEE_DETAILS",
            message: "Admission has no active included fee details.",
          });
        }

        for (const header of headers) {
          const applicable = header.feePaymentDetails.filter(
            (detail) => detail.isActive && detail.isIncluded,
          );
          let gross = zero;
          let discount = zero;
          let net = zero;

          for (const detail of applicable) {
            const original = new Prisma.Decimal(detail.originalAmount.toString());
            const payable = new Prisma.Decimal(detail.totalAmountToBePaid.toString());
            const detailDiscount = new Prisma.Decimal(detail.discountAmount.toString());
            const finalAmount = new Prisma.Decimal(detail.finalAmount.toString());
            let expectedDiscount: Prisma.Decimal;

            if (original.lt(zero)) throw this.financialSnapshotError(detail.id);

            if (detail.concession?.requiresReview) {
              throw new ConflictException({
                code: "DISCOUNT_REVIEW_REQUIRED",
                message: `Fee detail "${detail.id}" requires concession review.`,
              });
            }

            if (!detail.concession) {
              expectedDiscount = zero;
              if (!payable.equals(original) || !detailDiscount.isZero() || !finalAmount.equals(original)) {
                throw this.financialSnapshotError(detail.id);
              }
            } else if (detail.concession.calculationMode === "PAYABLE") {
              expectedDiscount = original.minus(payable);
              if (
                payable.lt(zero) || payable.gt(original) ||
                !detailDiscount.equals(expectedDiscount) ||
                !finalAmount.equals(payable) ||
                !new Prisma.Decimal(detail.concession.calculatedDiscountAmount.toString()).equals(expectedDiscount)
              ) {
                throw this.financialSnapshotError(detail.id);
              }
            } else if (
              (detail.concession.calculationMode === "LEGACY_PERCENTAGE" && detail.concession.discountType === "PERCENTAGE") ||
              (detail.concession.calculationMode === "LEGACY_FIXED" && detail.concession.discountType === "FIXED")
            ) {
              if (detail.concession.discountValue == null) throw this.financialSnapshotError(detail.id);
              let calc: ReturnType<typeof DiscountCalculator.calculate>;
              try {
                calc = DiscountCalculator.calculate(
                  original,
                  detail.concession.discountType,
                  detail.concession.discountValue,
                  detail.discountApplicable,
                  detail.nameSnapshot,
                );
              } catch {
                throw this.financialSnapshotError(detail.id);
              }
              expectedDiscount = calc.calculatedDiscountAmount;
              if (
                !detailDiscount.equals(expectedDiscount) ||
                !new Prisma.Decimal(detail.concession.calculatedDiscountAmount.toString()).equals(expectedDiscount) ||
                !finalAmount.equals(calc.finalAmount) ||
                !payable.equals(calc.totalAmountToBePaid)
              ) {
                throw this.financialSnapshotError(detail.id);
              }
            } else {
              throw this.financialSnapshotError(detail.id);
            }

            gross = gross.plus(original);
            discount = discount.plus(expectedDiscount);
            net = net.plus(payable);
          }

          if (!net.equals(gross.minus(discount))) throw this.financialSnapshotError();

          const headerPaid = new Prisma.Decimal(header.totalPaidAmount.toString());
          const detailPaid = header.feePaymentDetails.reduce(
            (sum, detail) => sum.plus(new Prisma.Decimal(detail.amountPaid.toString())), zero,
          );
          const hasPaymentEvidence = header.payments.length > 0 || header.installmentAllocations.length > 0 ||
            header.feePaymentDetails.some((detail) => !new Prisma.Decimal(detail.amountPaid.toString()).isZero()) ||
            !headerPaid.isZero();
          if (hasPaymentEvidence || !detailPaid.isZero()) throw this.financialSnapshotError();

          if (
            !new Prisma.Decimal(header.grossAmount.toString()).equals(gross) ||
            !new Prisma.Decimal(header.discountAmount.toString()).equals(discount) ||
            !new Prisma.Decimal(header.netAmount.toString()).equals(net) ||
            !new Prisma.Decimal(header.totalFeeAmount.toString()).equals(net) ||
            !headerPaid.isZero() ||
            !new Prisma.Decimal(header.totalDueAmount.toString()).equals(net)
          ) {
            throw this.financialSnapshotError();
          }
          totals.set(header.id, net);
        }

        // Validate schedules only after all fee snapshots and headers pass consistency checks.
        const schedService = this.getScheduleService();
        await schedService.confirmAdmissionSchedules(tx, existingAdmission.id, actorId, totals);

        const admission = await tx.admission.update({
          where: { id },
          data: {
            admissionStatus: AdmissionStatus.CONFIRMED,
            confirmedById: actorId,
            confirmedAt: new Date(),
          },
        });

        await tx.student.create({
          data: {
            admissionId: admission.id,
            studentName: admission.studentName,
            studentNumber: admission.admissionNumber || admission.admissionSequence.toString(),
            studentSequence: admission.admissionSequence,
            dateOfBirth: admission.dateOfBirth,
            gender: admission.gender,
          },
        });

        return tx.admission.findUniqueOrThrow({
          where: { id: admission.id },
          include: {
            student: {
              select: {
                id: true,
                studentNumber: true,
                studentName: true,
              },
            },
          },
        });
      }

      return tx.admission.update({
        where: { id },
        data: {
          admissionStatus: AdmissionStatus.CANCELLED,
          cancelledById: (user as any).id,
          cancelledAt: new Date(),
        },
      });
    });
  }

  async deleteById(id: string, user: any) {
    const existingAdmission = await this.databaseService.admission.findUnique({
      where: { id, isActive: true, deletedAt: null },
    });
    if (!existingAdmission) throw new NotFoundException(`Admission with id "${id}" not found`);

    return this.databaseService.admission.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  protected async lockAdmission(tx: any, admissionId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
    }
  }

  private financialSnapshotError(detailId?: string): ConflictException {
    return new ConflictException({
      code: "FINANCIAL_SNAPSHOT_INCONSISTENT",
      message: "Admission fee financial snapshot is inconsistent.",
      ...(detailId ? { feePaymentDetailsId: detailId } : {}),
    });
  }
}
