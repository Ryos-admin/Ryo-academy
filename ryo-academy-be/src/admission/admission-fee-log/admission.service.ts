import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import {
  CreateAdmissionDto,
  ApplicableFeeConfigurationQueryDto,
} from "./dto/create-admission.dto.js";
import {
  UpdateAdmissionDto,
  UpdateAdmissionFeeConfigurationDto,
} from "./dto/update-admission.dto.js";
import { AdmissionStatus, FeePricingVersion } from "../../../generated/prisma/enums.js";
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
      throw new NotFoundException("The matching fee structure has no active fee components.");
    }
    return this.toFeeConfigurationPreview(master);
  }

  private resolveComponentSelections(dto: CreateAdmissionDto): {
    selectedIds: Set<string>;
    discountPercentages: Map<string, Prisma.Decimal>;
  } {
    const hasComponents = dto.components !== undefined;
    const hasSelectedIds = dto.selectedFeeComponentIds !== undefined;

    if (!hasComponents && !hasSelectedIds) {
      throw new BadRequestException("At least one fee component selection must be provided.");
    }

    let componentIdsFromComponents: string[] | null = null;
    const discountPercentages = new Map<string, Prisma.Decimal>();

    if (hasComponents) {
      if (!Array.isArray(dto.components) || dto.components.length === 0) {
        throw new BadRequestException("components must be a non-empty array when provided.");
      }
      const seenIds = new Set<string>();
      for (const item of dto.components) {
        if (
          !item ||
          typeof item.feeComponentId !== "string" ||
          item.feeComponentId.trim().length === 0
        ) {
          throw new BadRequestException(
            "Every item in components must have a valid feeComponentId.",
          );
        }
        if (seenIds.has(item.feeComponentId)) {
          throw new BadRequestException(
            `Duplicate feeComponentId "${item.feeComponentId}" found in components.`,
          );
        }
        seenIds.add(item.feeComponentId);

        if (item.discountPercentage === null) {
          throw new BadRequestException(
            `discountPercentage cannot be null for feeComponentId "${item.feeComponentId}". Omit the field to default to 0.00%.`,
          );
        }

        let dpDecimal = new Prisma.Decimal(0);
        if (item.discountPercentage !== undefined) {
          dpDecimal = parseMoney(item.discountPercentage, "discountPercentage");
          if (dpDecimal.lt(0) || dpDecimal.gt(100)) {
            throw new BadRequestException("Discount percentage must be between 0.00 and 100.00.");
          }
        }
        discountPercentages.set(item.feeComponentId, dpDecimal);
      }
      componentIdsFromComponents = Array.from(seenIds);
    }

    let componentIdsFromSelected: string[] | null = null;
    if (hasSelectedIds) {
      if (!Array.isArray(dto.selectedFeeComponentIds) || dto.selectedFeeComponentIds.length === 0) {
        throw new BadRequestException(
          "selectedFeeComponentIds must be a non-empty array when provided.",
        );
      }
      const seenIds = new Set<string>();
      for (const id of dto.selectedFeeComponentIds) {
        if (typeof id !== "string" || id.trim().length === 0) {
          throw new BadRequestException(
            "Every ID in selectedFeeComponentIds must be a non-empty string.",
          );
        }
        if (seenIds.has(id)) {
          throw new BadRequestException(
            `Duplicate feeComponentId "${id}" found in selectedFeeComponentIds.`,
          );
        }
        seenIds.add(id);
      }
      componentIdsFromSelected = Array.from(seenIds);
    }

    if (componentIdsFromComponents && componentIdsFromSelected) {
      const setA = new Set(componentIdsFromComponents);
      const setB = new Set(componentIdsFromSelected);
      if (setA.size !== setB.size || ![...setA].every((id) => setB.has(id))) {
        throw new BadRequestException(
          "components and selectedFeeComponentIds must contain the identical component IDs.",
        );
      }
      return {
        selectedIds: setA,
        discountPercentages,
      };
    }

    if (componentIdsFromComponents) {
      return {
        selectedIds: new Set(componentIdsFromComponents),
        discountPercentages,
      };
    }

    const set = new Set(componentIdsFromSelected!);
    for (const id of set) {
      discountPercentages.set(id, new Prisma.Decimal(0));
    }
    return {
      selectedIds: set,
      discountPercentages,
    };
  }

  async create(dto: CreateAdmissionDto) {
    const { selectedIds, discountPercentages } = this.resolveComponentSelections(dto);
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
      // 0. Acquire lock on target AcademicYear inside transaction
      if (typeof tx.$queryRaw === "function") {
        const ayRows = await tx.$queryRaw<
          Array<{ id: string; isActive: boolean; deletedAt: Date | null }>
        >`
          SELECT "id", "isActive", "deletedAt" FROM "AcademicYear" WHERE "id" = ${dto.academicYearId} FOR SHARE
        `;
        const ay = ayRows?.[0];
        if (
          ay &&
          (ay.isActive === false || (ay.deletedAt !== null && ay.deletedAt !== undefined))
        ) {
          throw new ConflictException("Academic year does not exist or is inactive");
        }
      }

      // 1. Resolve candidate FeeStructure ID
      const candidateMasters = await this.admissionRepository.findActiveFeeStructures(dto, tx);
      const candidate = this.requireUniqueFeeMaster(candidateMasters);

      // 2. Acquire lock on candidate FeeStructure inside transaction
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${candidate.id} FOR SHARE`;
      }

      // 3. Re-read authoritative FeeStructure and active components after lock acquisition
      const authoritativeMaster =
        typeof tx.feeStructure?.findUnique === "function"
          ? await tx.feeStructure.findUnique({
              where: { id: candidate.id },
              include: {
                academicYear: true,
                feeComponents: {
                  where: { isActive: true },
                  orderBy: { name: "asc" },
                },
              },
            })
          : candidate;

      // 4. Validate post-lock status and scope
      if (
        !authoritativeMaster ||
        authoritativeMaster.isActive === false ||
        authoritativeMaster.deletedAt
      ) {
        throw new ConflictException("Fee structure became inactive during admission processing.");
      }
      if (
        authoritativeMaster.academicYearId !== dto.academicYearId ||
        authoritativeMaster.programId !== dto.programId ||
        authoritativeMaster.classId !== dto.classId
      ) {
        throw new ConflictException("Fee structure scope changed during admission processing.");
      }

      const feeComponents = authoritativeMaster.feeComponents;
      if (feeComponents.length === 0) {
        throw new BadRequestException(
          "An active Fee Structure with at least one active Fee Component is required.",
        );
      }

      const activeComponentIds = new Set(feeComponents.map(({ id }) => id));
      for (const selectedId of selectedIds) {
        if (!activeComponentIds.has(selectedId)) {
          throw new BadRequestException(
            `Selected fee component "${selectedId}" is not active in the applicable fee structure.`,
          );
        }
      }

      const missingMandatory = feeComponents.find(
        (component) => component.isMandatory && !selectedIds.has(component.id),
      );
      if (missingMandatory) {
        throw new BadRequestException(
          `Mandatory fee component "${missingMandatory.id}" must be selected.`,
        );
      }

      const masterGstPercentage = new Prisma.Decimal(
        (authoritativeMaster.gstPercentage ?? "0.00").toString(),
      );
      if (masterGstPercentage.lt(0) || masterGstPercentage.gt(100)) {
        throw new BadRequestException(
          "Fee structure GST percentage must be between 0.00 and 100.00.",
        );
      }

      // 5. Calculate pricing exclusively from authoritativeMaster records
      const detailCalculations = feeComponents.map((feeComponent) => {
        const isIncluded = selectedIds.has(feeComponent.id);
        const originalAmount = new Prisma.Decimal(feeComponent.amount.toString());
        const discountPercentage = isIncluded
          ? (discountPercentages.get(feeComponent.id) ?? new Prisma.Decimal(0))
          : new Prisma.Decimal(0);

        if (!feeComponent.discountApplicable && discountPercentage.gt(0)) {
          throw new BadRequestException(
            `Fee component "${feeComponent.name}" is not eligible for discounts.`,
          );
        }

        // discountAmount = round(originalAmount * discountPercentage / 100, 2)
        const rawDiscount = originalAmount.mul(discountPercentage).div(100);
        const discountAmount = rawDiscount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        // taxableAmount = originalAmount - discountAmount
        const taxableAmount = originalAmount.minus(discountAmount);

        // gstAmount = round(taxableAmount * gstPercentage / 100, 2)
        const rawGst = taxableAmount.mul(masterGstPercentage).div(100);
        const gstAmount = rawGst.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        // totalAmountToBePaid = taxableAmount + gstAmount
        const totalAmountToBePaid = taxableAmount.plus(gstAmount);
        const finalAmount = totalAmountToBePaid;

        return {
          feeComponent,
          isIncluded,
          originalAmount,
          discountPercentage,
          discountAmount,
          taxableAmount,
          gstPercentage: masterGstPercentage,
          gstAmount,
          totalAmountToBePaid,
          finalAmount,
        };
      });

      // 6. Header aggregates across included components only
      const includedDetails = detailCalculations.filter((d) => d.isIncluded);
      let grossAmount = new Prisma.Decimal(0);
      let discountAmount = new Prisma.Decimal(0);
      let taxableAmount = new Prisma.Decimal(0);
      let gstAmount = new Prisma.Decimal(0);
      let netAmount = new Prisma.Decimal(0);

      for (const d of includedDetails) {
        grossAmount = grossAmount.plus(d.originalAmount);
        discountAmount = discountAmount.plus(d.discountAmount);
        taxableAmount = taxableAmount.plus(d.taxableAmount);
        gstAmount = gstAmount.plus(d.gstAmount);
        netAmount = netAmount.plus(d.totalAmountToBePaid);
      }

      if (netAmount.lte(0)) {
        throw new BadRequestException("Total payable fee amount must be greater than zero.");
      }

      // Persist Admission
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

      // Persist FeePaymentHeader
      const feePaymentHeader = await tx.feePaymentHeader.create({
        data: {
          admissionId: admissionDetails.id,
          academicYearId: admissionDetails.academicYearId,
          feeStructureId: authoritativeMaster.id,
          pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
          grossAmount,
          discountAmount,
          taxableAmount,
          gstAmount,
          netAmount,
          totalPaidAmount: new Prisma.Decimal(0),
          totalDueAmount: netAmount,
          totalFeeAmount: netAmount,
        },
      });

      // Persist FeePaymentDetails snapshots (both included and excluded)
      const createdAt = new Date();
      await tx.feePaymentDetails.createMany({
        data: detailCalculations.map((d) => ({
          feePaymentHeaderId: feePaymentHeader.id,
          feeComponentId: d.feeComponent.id,
          nameSnapshot: d.feeComponent.name,
          isActive: true,
          isIncluded: d.isIncluded,
          originalAmount: d.originalAmount,
          discountApplicable: d.feeComponent.discountApplicable,
          isMandatory: d.feeComponent.isMandatory,
          discountPercentage: d.discountPercentage,
          discountAmount: d.discountAmount,
          taxableAmount: d.taxableAmount,
          gstPercentage: d.gstPercentage,
          gstAmount: d.gstAmount,
          finalAmount: d.finalAmount,
          totalAmountToBePaid: d.totalAmountToBePaid,
          amountPaid: new Prisma.Decimal(0),
          paymentDate: createdAt,
        })),
      });

      const savedAdmission = await tx.admission.findUniqueOrThrow({
        where: { id: admissionDetails.id },
        include: {
          feePaymentHeaders: {
            where: { id: feePaymentHeader.id },
            include: { feePaymentDetails: { orderBy: { nameSnapshot: "asc" } } },
          },
        },
      });
      const header = savedAdmission.feePaymentHeaders[0];
      if (!header) throw new Error("Created fee header could not be reloaded.");
      return {
        ...admissionDetails,
        feeConfiguration: {
          feePaymentHeaderId: feePaymentHeader.id,
          feeStructureId: authoritativeMaster.id,
          pricingVersion: header.pricingVersion,
          grossAmount: serializeMoney(grossAmount),
          discountAmount: serializeMoney(discountAmount),
          taxableAmount: serializeMoney(taxableAmount),
          gstAmount: serializeMoney(gstAmount),
          netAmount: serializeMoney(netAmount),
          totalFeeAmount: serializeMoney(netAmount),
          totalPaidAmount: serializeMoney(new Prisma.Decimal(0)),
          totalDueAmount: serializeMoney(netAmount),
          components: header.feePaymentDetails.map((detail) => ({
            feePaymentDetailsId: detail.id,
            feeComponentId: detail.feeComponentId,
            nameSnapshot: detail.nameSnapshot,
            originalAmount: serializeMoney(detail.originalAmount),
            discountPercentage: serializeMoney(detail.discountPercentage),
            discountAmount: serializeMoney(detail.discountAmount),
            taxableAmount: serializeMoney(detail.taxableAmount),
            gstPercentage: serializeMoney(detail.gstPercentage),
            gstAmount: serializeMoney(detail.gstAmount),
            finalAmount: serializeMoney(detail.finalAmount),
            payableAmount: serializeMoney(detail.totalAmountToBePaid),
            amountPaid: serializeMoney(detail.amountPaid),
            isDiscountApplicable: detail.discountApplicable,
            isMandatory: detail.isMandatory,
            included: detail.isIncluded,
          })),
        },
      };
    });
  }

  private requireUniqueFeeMaster<T extends { feeComponents: unknown[] }>(masters: T[]): T {
    if (masters.length === 0) {
      throw new NotFoundException(
        "No active fee structure matches the selected academic year, program, and class.",
      );
    }
    if (masters.length > 1) {
      throw new ConflictException(
        "More than one active fee structure matches the selected academic year, program, and class.",
      );
    }
    return masters[0];
  }

  private validateSelectedComponentIds(selectedIds: unknown): asserts selectedIds is string[] {
    if (
      !Array.isArray(selectedIds) ||
      selectedIds.length === 0 ||
      selectedIds.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(selectedIds).size !== selectedIds.length
    ) {
      throw new BadRequestException(
        "selectedFeeComponentIds must be a non-empty array of unique component IDs.",
      );
    }
  }

  private toFeeConfigurationPreview(master: {
    id: string;
    name: string;
    description: string | null;
    totalAmount: Prisma.Decimal;
    gstPercentage?: Prisma.Decimal;
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
        gstPercentage: serializeMoney(master.gstPercentage ?? new Prisma.Decimal(0)),
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
    if (existingAdmission.admissionStatus === AdmissionStatus.CONFIRMED) {
      throw new BadRequestException("Ordinary admission editing is blocked after confirmation.");
    }
    if (dto.feePaymentHeaders) {
      throw new BadRequestException(
        "Fee configuration must be changed through /admission/:id/fee-configuration.",
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
    const admission = (await this.databaseService.admission.findUnique({
      where: { id, isActive: true, deletedAt: null },
      include: {
        feePaymentHeaders: {
          where: { isActive: true },
          include: {
            feePaymentDetails: { where: { isActive: true }, include: { concession: true } },
          },
        },
      },
    })) as any;
    if (!admission) throw new NotFoundException(`Admission with id "${id}" not found`);
    return this.feeConfigurationResult(
      admission,
      this.requireFeeHeader(admission.feePaymentHeaders),
    );
  }

  async updateFeeConfiguration(id: string, dto: UpdateAdmissionFeeConfigurationDto) {
    if (new Set(dto.selectedFeeComponentIds).size !== dto.selectedFeeComponentIds.length) {
      throw new BadRequestException("selectedFeeComponentIds must not contain duplicates.");
    }
    return this.databaseService.$transaction(async (tx) => {
      await this.lockAdmission(tx, id);
      const admission = (await tx.admission.findUnique({
        where: { id, isActive: true, deletedAt: null },
        include: {
          feePaymentHeaders: {
            where: { isActive: true },
            include: {
              feePaymentDetails: { where: { isActive: true }, include: { concession: true } },
            },
          },
        },
      })) as any;
      if (!admission) throw new NotFoundException(`Admission with id "${id}" not found`);
      if (admission.admissionStatus !== AdmissionStatus.DRAFT)
        throw new ConflictException(
          "Fee configuration can only be changed while the admission is DRAFT.",
        );
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
        if (!detail)
          throw new BadRequestException(
            `Fee component snapshot "${id}" is not active for this admission.`,
          );
      }
      for (const detail of details)
        if (detail.isMandatory && !selected.has(detail.id))
          throw new BadRequestException(
            `Mandatory fee component "${detail.id}" must remain selected.`,
          );
      if (header.pricingVersion === FeePricingVersion.V0_SNAPSHOTTED) {
        for (const detail of details) {
          const nextIncluded = selected.has(detail.id);
          if (nextIncluded === detail.isIncluded) continue;
          await tx.feePaymentDetails.update({
            where: { id: detail.id },
            data: { isIncluded: nextIncluded },
          });
        }
        await this.recomputeV0FeeHeader(tx, header.id);
      } else {
        for (const detail of details) {
          const nextIncluded = selected.has(detail.id);
          if (nextIncluded === detail.isIncluded) continue;
          const original = new Prisma.Decimal(detail.originalAmount.toString());
          const data: any = { isIncluded: nextIncluded };
          if (nextIncluded) {
            data.discountAmount = new Prisma.Decimal(0);
            data.finalAmount = original;
            data.totalAmountToBePaid = original;
            if (detail.concession)
              await tx.admissionFeeConcession.update({
                where: { id: detail.concession.id },
                data: { requiresReview: true },
              });
          }
          await tx.feePaymentDetails.update({ where: { id: detail.id }, data });
        }
        await this.recomputeFeeHeader(tx, header.id);
      }
      const refreshed = (await tx.admission.findUnique({
        where: { id },
        include: {
          feePaymentHeaders: {
            where: { id: header.id },
            include: {
              feePaymentDetails: { where: { isActive: true }, include: { concession: true } },
            },
          },
        },
      })) as any;
      return this.feeConfigurationResult(
        refreshed,
        this.requireFeeHeader(refreshed.feePaymentHeaders),
      );
    }, { timeout: 10000, maxWait: 5000 });
  }

  private requireFeeHeader(headers: any[]) {
    if (!headers?.length)
      throw new NotFoundException("Active fee payment header not found for admission.");
    if (headers.length !== 1)
      throw new ConflictException("Admission has multiple active fee payment headers.");
    return headers[0];
  }

  private feeConfigurationResult(admission: any, header: any) {
    return {
      admissionId: admission.id,
      feePaymentHeader: {
        id: header.id,
        pricingVersion: header.pricingVersion,
        grossAmount: serializeMoney(header.grossAmount),
        discountAmount: serializeMoney(header.discountAmount),
        taxableAmount: serializeMoney(header.taxableAmount),
        gstAmount: serializeMoney(header.gstAmount),
        netAmount: serializeMoney(header.netAmount),
        totalFeeAmount: serializeMoney(header.totalFeeAmount),
        totalPaidAmount: serializeMoney(header.totalPaidAmount),
        totalDueAmount: serializeMoney(header.totalDueAmount),
        feePaymentDetails: header.feePaymentDetails.map((detail: any) => ({
          id: detail.id,
          feeComponentId: detail.feeComponentId,
          name: detail.nameSnapshot ?? detail.name,
          originalAmount: serializeMoney(detail.originalAmount),
          discountPercentage: serializeMoney(detail.discountPercentage),
          discountAmount: serializeMoney(detail.discountAmount),
          taxableAmount: serializeMoney(detail.taxableAmount),
          gstPercentage: serializeMoney(detail.gstPercentage),
          gstAmount: serializeMoney(detail.gstAmount),
          finalAmount: serializeMoney(detail.finalAmount),
          totalAmountToBePaid: serializeMoney(detail.totalAmountToBePaid),
          amountPaid: serializeMoney(detail.amountPaid),
          isMandatory: detail.isMandatory,
          discountApplicable: detail.discountApplicable,
          isActive: detail.isActive,
          isIncluded: detail.isIncluded,
          concession: detail.concession
            ? {
                id: detail.concession.id,
                requiresReview: detail.concession.requiresReview,
                calculationMode: detail.concession.calculationMode,
              }
            : null,
        })),
      },
    };
  }

  private assertFeeSnapshotConsistency(header: any, details: any[]) {
    if (header.pricingVersion === FeePricingVersion.V0_SNAPSHOTTED) {
      this.assertV0FeeSnapshotConsistency(header, details);
      return;
    }
    const applicable = details.filter((detail) => detail.isIncluded);
    let gross = new Prisma.Decimal(0),
      discount = new Prisma.Decimal(0),
      net = new Prisma.Decimal(0);
    for (const detail of applicable) {
      const original = new Prisma.Decimal(detail.originalAmount.toString());
      const discounted = new Prisma.Decimal(detail.discountAmount.toString());
      const payable = new Prisma.Decimal(detail.totalAmountToBePaid.toString());
      if (
        original.minus(discounted).equals(payable) &&
        new Prisma.Decimal(detail.finalAmount.toString()).equals(payable)
      ) {
        gross = gross.plus(original);
        discount = discount.plus(discounted);
        net = net.plus(payable);
      } else throw this.financialSnapshotError(detail.id);
    }
    if (
      !new Prisma.Decimal(header.grossAmount.toString()).equals(gross) ||
      !new Prisma.Decimal(header.discountAmount.toString()).equals(discount) ||
      !new Prisma.Decimal(header.netAmount.toString()).equals(net) ||
      !new Prisma.Decimal(header.totalFeeAmount.toString()).equals(net) ||
      !new Prisma.Decimal(header.totalDueAmount.toString()).equals(
        net.minus(new Prisma.Decimal(header.totalPaidAmount.toString())),
      )
    )
      throw this.financialSnapshotError();
  }

  private assertV0FeeSnapshotConsistency(header: any, details: any[]) {
    const applicable = details.filter((detail) => detail.isIncluded);
    let gross = new Prisma.Decimal(0);
    let discount = new Prisma.Decimal(0);
    let taxable = new Prisma.Decimal(0);
    let gst = new Prisma.Decimal(0);
    let net = new Prisma.Decimal(0);

    for (const detail of applicable) {
      const original = new Prisma.Decimal(detail.originalAmount.toString());
      const detailDiscount = new Prisma.Decimal(detail.discountAmount.toString());
      const detailTaxable = new Prisma.Decimal(
        (detail.taxableAmount ?? original.minus(detailDiscount)).toString(),
      );
      const detailGst = new Prisma.Decimal((detail.gstAmount ?? "0").toString());
      const payable = new Prisma.Decimal(detail.totalAmountToBePaid.toString());
      const finalAmt = new Prisma.Decimal(detail.finalAmount.toString());

      if (!original.minus(detailDiscount).equals(detailTaxable)) {
        throw this.financialSnapshotError(detail.id);
      }
      if (!detailTaxable.plus(detailGst).equals(payable)) {
        throw this.financialSnapshotError(detail.id);
      }
      if (!finalAmt.equals(payable)) {
        throw this.financialSnapshotError(detail.id);
      }

      gross = gross.plus(original);
      discount = discount.plus(detailDiscount);
      taxable = taxable.plus(detailTaxable);
      gst = gst.plus(detailGst);
      net = net.plus(payable);
    }

    if (
      !new Prisma.Decimal(header.grossAmount.toString()).equals(gross) ||
      !new Prisma.Decimal(header.discountAmount.toString()).equals(discount) ||
      (header.taxableAmount !== null &&
        header.taxableAmount !== undefined &&
        !new Prisma.Decimal(header.taxableAmount.toString()).equals(taxable)) ||
      (header.gstAmount !== null &&
        header.gstAmount !== undefined &&
        !new Prisma.Decimal(header.gstAmount.toString()).equals(gst)) ||
      !new Prisma.Decimal(header.netAmount.toString()).equals(net) ||
      !new Prisma.Decimal(header.totalFeeAmount.toString()).equals(net) ||
      !new Prisma.Decimal(header.totalDueAmount.toString()).equals(
        net.minus(new Prisma.Decimal(header.totalPaidAmount.toString())),
      )
    ) {
      throw this.financialSnapshotError();
    }
  }

  private async recomputeV0FeeHeader(tx: any, headerId: string) {
    const header = await tx.feePaymentHeader.findUnique({ where: { id: headerId } });
    const details = await tx.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: headerId, isActive: true, isIncluded: true },
    });
    let gross = new Prisma.Decimal(0);
    let discount = new Prisma.Decimal(0);
    let taxable = new Prisma.Decimal(0);
    let gst = new Prisma.Decimal(0);
    let net = new Prisma.Decimal(0);
    for (const detail of details) {
      gross = gross.plus(detail.originalAmount);
      discount = discount.plus(detail.discountAmount);
      taxable = taxable.plus(
        detail.taxableAmount ?? detail.originalAmount.minus(detail.discountAmount),
      );
      gst = gst.plus(detail.gstAmount ?? new Prisma.Decimal(0));
      net = net.plus(detail.totalAmountToBePaid);
    }
    const paid = new Prisma.Decimal(header.totalPaidAmount.toString());
    await tx.feePaymentHeader.update({
      where: { id: headerId },
      data: {
        grossAmount: gross,
        discountAmount: discount,
        taxableAmount: taxable,
        gstAmount: gst,
        netAmount: net,
        totalFeeAmount: net,
        totalPaidAmount: paid,
        totalDueAmount: net.minus(paid),
      },
    });
  }

  private async assertNoFeeActivity(tx: any, header: any, details: any[]) {
    const [payments, allocations, reversals] = await Promise.all([
      tx.feePayment.count({ where: { feePaymentHeaderId: header.id } }),
      tx.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: header.id } }),
      tx.paymentReversalEvent.count({ where: { feePayment: { feePaymentHeaderId: header.id } } }),
    ]);
    if (
      payments ||
      allocations ||
      reversals ||
      details.some((detail) => !new Prisma.Decimal(detail.amountPaid.toString()).isZero()) ||
      !new Prisma.Decimal(header.totalPaidAmount.toString()).isZero()
    )
      throw new ConflictException("Fee configuration cannot be changed after financial activity.");
  }

  private async recomputeFeeHeader(tx: any, headerId: string) {
    const header = await tx.feePaymentHeader.findUnique({ where: { id: headerId } });
    const details = await tx.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: headerId, isActive: true, isIncluded: true },
    });
    let gross = new Prisma.Decimal(0),
      discount = new Prisma.Decimal(0),
      net = new Prisma.Decimal(0);
    for (const detail of details) {
      gross = gross.plus(detail.originalAmount);
      discount = discount.plus(detail.discountAmount);
      net = net.plus(detail.totalAmountToBePaid);
    }
    const paid = new Prisma.Decimal(header.totalPaidAmount.toString());
    await tx.feePaymentHeader.update({
      where: { id: headerId },
      data: {
        grossAmount: gross,
        discountAmount: discount,
        netAmount: net,
        totalFeeAmount: net,
        totalPaidAmount: paid,
        totalDueAmount: net.minus(paid),
      },
    });
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

  async confirmAdmission(id: string, actor: any) {
    const actorUserId = actor?.userId ?? actor?.id;
    if (!actorUserId) {
      throw new ForbiddenException("Authentication is required.");
    }

    const user = await this.databaseService.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, schoolId: true },
    });

    if (!user?.schoolId) {
      throw new ForbiddenException("A school-scoped user is required.");
    }

    return await this.databaseService.$transaction(async (tx) => {
      // Step 4 & 5: Mandatory Admission SELECT FOR UPDATE lock
      await this.lockAdmission(tx, id);

      // Step 6: Authoritative re-read inside the transaction
      const existingAdmission = await tx.admission.findUnique({
        where: { id },
        include: {
          student: true,
          feePaymentHeaders: {
            where: { isActive: true },
            orderBy: { id: "asc" },
            include: {
              feePaymentDetails: { include: { concession: true } },
              payments: { include: { reversalEvent: true } },
              installmentAllocations: { include: { installment: true } },
            },
          },
        },
      });

      // Step 7 & 8: Validate existence, schoolId, active/deleted state
      if (
        !existingAdmission ||
        existingAdmission.schoolId !== user.schoolId ||
        !existingAdmission.isActive ||
        existingAdmission.deletedAt !== null
      ) {
        throw new NotFoundException(`Admission with id "${id}" not found`);
      }

      // Step 9: If CONFIRMED -> Idempotent replay
      if (existingAdmission.admissionStatus === AdmissionStatus.CONFIRMED) {
        if (
          !existingAdmission.student ||
          existingAdmission.student.admissionId !== existingAdmission.id ||
          existingAdmission.studentId !== existingAdmission.student.id
        ) {
          throw new ConflictException(
            "Admission is CONFIRMED but has missing or inconsistent Student linkage.",
          );
        }
        const { feePaymentHeaders, ...cleanAdmission } = existingAdmission;
        return {
          statusCode: 200,
          isReplay: true,
          ...cleanAdmission,
          student: existingAdmission.student,
          admission: cleanAdmission,
        };
      }

      // Step 10: Reject CANCELLED and any unsupported status with 409
      if (existingAdmission.admissionStatus === AdmissionStatus.CANCELLED) {
        throw new ConflictException("Cancelled admissions cannot be confirmed.");
      }
      if (existingAdmission.admissionStatus !== AdmissionStatus.DRAFT) {
        throw new ConflictException(
          `Admission with id "${id}" cannot be confirmed from status ${existingAdmission.admissionStatus}`,
        );
      }

      if (typeof tx.$queryRaw === "function" && existingAdmission.academicYearId) {
        const ayRows = await tx.$queryRaw<
          Array<{ id: string; isActive: boolean; deletedAt: Date | null }>
        >`
          SELECT "id", "isActive", "deletedAt" FROM "AcademicYear" WHERE "id" = ${existingAdmission.academicYearId} FOR SHARE
        `;
        const ay = ayRows?.[0];
        if (!ay || !ay.isActive || ay.deletedAt !== null) {
          throw new NotFoundException(
            `Academic year with id "${existingAdmission.academicYearId}" not found`,
          );
        }
      }

      const headers =
        existingAdmission.feePaymentHeaders && existingAdmission.feePaymentHeaders.length > 0
          ? existingAdmission.feePaymentHeaders
          : typeof tx.feePaymentHeader?.findMany === "function"
            ? await tx.feePaymentHeader.findMany({
                where: { admissionId: existingAdmission.id, isActive: true },
                orderBy: { id: "asc" },
                include: {
                  feePaymentDetails: { include: { concession: true } },
                  payments: { include: { reversalEvent: true } },
                  installmentAllocations: { include: { installment: true } },
                },
              })
            : [];
      const isV0 = headers.some((h: any) => h.pricingVersion === FeePricingVersion.V0_SNAPSHOTTED);

      const totals = new Map<string, Prisma.Decimal>();
      if (!isV0 && headers.length > 0) {
        const zero = new Prisma.Decimal(0);
        const includedCount = headers.reduce(
          (count: number, header: any) =>
            count +
            header.feePaymentDetails.filter((detail: any) => detail.isActive && detail.isIncluded)
              .length,
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
            (detail: any) => detail.isActive && detail.isIncluded,
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

            const detailPaid = new Prisma.Decimal((detail.amountPaid ?? 0).toString());
            if (detailPaid.lt(zero) || detailPaid.gt(payable)) {
              throw this.financialSnapshotError(detail.id);
            }

            if (original.lt(zero)) throw this.financialSnapshotError(detail.id);

            if (detail.concession?.requiresReview) {
              throw new ConflictException({
                code: "DISCOUNT_REVIEW_REQUIRED",
                message: `Fee detail "${detail.id}" requires concession review.`,
              });
            }

            if (!detail.concession) {
              expectedDiscount = zero;
              if (
                !payable.equals(original) ||
                !detailDiscount.isZero() ||
                !finalAmount.equals(original)
              ) {
                throw this.financialSnapshotError(detail.id);
              }
            } else if (detail.concession.calculationMode === "PAYABLE") {
              expectedDiscount = original.minus(payable);
              if (
                payable.lt(zero) ||
                payable.gt(original) ||
                !detailDiscount.equals(expectedDiscount) ||
                !finalAmount.equals(payable) ||
                !new Prisma.Decimal(detail.concession.calculatedDiscountAmount.toString()).equals(
                  expectedDiscount,
                )
              ) {
                throw this.financialSnapshotError(detail.id);
              }
            } else if (
              (detail.concession.calculationMode === "LEGACY_PERCENTAGE" &&
                detail.concession.discountType === "PERCENTAGE") ||
              (detail.concession.calculationMode === "LEGACY_FIXED" &&
                detail.concession.discountType === "FIXED")
            ) {
              if (detail.concession.discountValue == null)
                throw this.financialSnapshotError(detail.id);
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
                !new Prisma.Decimal(detail.concession.calculatedDiscountAmount.toString()).equals(
                  expectedDiscount,
                ) ||
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

          for (const detail of header.feePaymentDetails) {
            if (
              (!detail.isActive || !detail.isIncluded) &&
              !new Prisma.Decimal((detail.amountPaid ?? 0).toString()).isZero()
            ) {
              throw this.financialSnapshotError(detail.id);
            }
          }

          if (Array.isArray(header.payments)) {
            for (const p of header.payments) {
              if (!p.admissionId || p.admissionId !== existingAdmission.id)
                throw this.financialSnapshotError();
              if (!p.feePaymentHeaderId || p.feePaymentHeaderId !== header.id)
                throw this.financialSnapshotError();
            }
          }
          if (Array.isArray(header.installmentAllocations)) {
            for (const alloc of header.installmentAllocations) {
              if (!alloc.feePaymentHeaderId || alloc.feePaymentHeaderId !== header.id)
                throw this.financialSnapshotError();
              if (
                !alloc.installment ||
                !alloc.installment.feePaymentHeaderId ||
                alloc.installment.feePaymentHeaderId !== header.id
              ) {
                throw this.financialSnapshotError();
              }
            }
          }

          const headerPaid = new Prisma.Decimal(header.totalPaidAmount.toString());
          if (headerPaid.lt(zero)) throw this.financialSnapshotError();

          const detailPaidSum = applicable.reduce(
            (sum: Prisma.Decimal, detail: any) =>
              sum.plus(new Prisma.Decimal((detail.amountPaid ?? 0).toString())),
            zero,
          );
          if (!headerPaid.equals(detailPaidSum)) throw this.financialSnapshotError();

          if (
            !new Prisma.Decimal(header.grossAmount.toString()).equals(gross) ||
            !new Prisma.Decimal(header.discountAmount.toString()).equals(discount) ||
            !new Prisma.Decimal(header.netAmount.toString()).equals(net) ||
            !new Prisma.Decimal(header.totalFeeAmount.toString()).equals(net)
          ) {
            throw this.financialSnapshotError();
          }

          const expectedDue = net.minus(headerPaid);
          if (expectedDue.lt(zero)) throw this.financialSnapshotError();
          if (!new Prisma.Decimal(header.totalDueAmount.toString()).equals(expectedDue)) {
            throw this.financialSnapshotError();
          }
          totals.set(header.id, net);
        }
      }

      // BE-ND1: Enforce Admission Confirmation Payment Prerequisite
      // An admission must not be confirmed unless at least one qualifying persisted payment exists
      // on one of its applicable active fee payment headers.
      const activeHeaders = headers.filter((h: any) => h.isActive !== false);
      const qualifyingPayments = activeHeaders.flatMap((header: any) =>
        (header.payments ?? []).filter((payment: any) => {
          if (
            typeof payment?.admissionId !== "string" ||
            payment.admissionId !== existingAdmission.id
          ) {
            return false;
          }

          if (
            typeof payment?.feePaymentHeaderId !== "string" ||
            payment.feePaymentHeaderId !== header.id
          ) {
            return false;
          }

          if (payment.reversalEvent !== null && payment.reversalEvent !== undefined) {
            return false;
          }

          if (payment.amount === null || payment.amount === undefined) {
            return false;
          }

          const amount = new Prisma.Decimal(payment.amount.toString());
          return amount.gt(0);
        }),
      );

      if (qualifyingPayments.length === 0) {
        throw new ConflictException({
          code: "CONFIRMATION_PAYMENT_REQUIRED",
          message:
            "At least one successful, unreversed payment greater than zero is required before confirming admission.",
        });
      }

      if (!isV0 && headers.length > 0) {
        const schedService = this.getScheduleService();
        await schedService.confirmAdmissionSchedules(tx, existingAdmission.id, user.id, totals);
      }

      // Step 11: Create Student from Admission data
      const student = await tx.student.create({
        data: {
          admissionId: existingAdmission.id,
          studentName: existingAdmission.studentName,
          studentNumber: existingAdmission.admissionNumber,
          gender: existingAdmission.gender,
          dateOfBirth: existingAdmission.dateOfBirth,
        },
      });

      // Step 12: Update Admission
      const confirmedAt = new Date();
      const updatedAdmission = await tx.admission.update({
        where: { id: existingAdmission.id },
        data: {
          admissionStatus: AdmissionStatus.CONFIRMED,
          studentId: student?.id,
          confirmedById: user.id,
          confirmedAt,
        },
      });

      // Step 13 & 14: Commit and return isReplay=false
      const { feePaymentHeaders: _, ...cleanAdmission } = updatedAdmission as any;
      return {
        statusCode: 200,
        isReplay: false,
        ...cleanAdmission,
        student,
        admission: cleanAdmission,
      };
    }, { timeout: 10000, maxWait: 5000 });
  }

  async updateStatusById(id: string, user: object, status: string) {
    if (status === "CONFIRMED") {
      return this.confirmAdmission(id, user);
    }
    if (status !== "CANCELLED") {
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

      if (existingAdmission.admissionStatus === AdmissionStatus.CONFIRMED) {
        throw new ConflictException("Confirmed admissions cannot be cancelled.");
      }
      if (existingAdmission.admissionStatus === AdmissionStatus.CANCELLED) {
        throw new ConflictException("Admission is already cancelled.");
      }
      if (existingAdmission.admissionStatus !== AdmissionStatus.DRAFT) {
        throw new ConflictException(
          `Admission with id "${id}" cannot be cancelled from status ${existingAdmission.admissionStatus}`,
        );
      }

      await this.assertSafeForCancellation(tx, id);

      const actorId = (user as any)?.userId ?? (user as any)?.id;
      const cancelledAdmission = await tx.admission.update({
        where: { id },
        data: {
          admissionStatus: AdmissionStatus.CANCELLED,
          cancelledById: actorId,
          cancelledAt: new Date(),
        },
      });

      await tx.student.updateMany({
        where: {
          admissionId: id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return cancelledAdmission;
    });
  }

  protected async assertSafeForCancellation(tx: any, admissionId: string): Promise<void> {
    const headers = await tx.feePaymentHeader.findMany({
      where: { admissionId, isActive: true },
      include: {
        feePaymentDetails: {
          select: { id: true, amountPaid: true },
        },
        payments: {
          include: { reversalEvent: true },
        },
        installmentAllocations: {
          select: { id: true, allocatedAmount: true, reversedAmount: true },
        },
      },
    });

    const directPayments = await tx.feePayment.findMany({
      where: { admissionId },
      include: { reversalEvent: true },
    });

    for (const payment of directPayments) {
      if (!payment.reversalEvent) {
        throw new ConflictException({
          code: "CANCELLATION_UNRESOLVED_PAYMENTS",
          message:
            "Admission cannot be cancelled with unreversed payments. Reverse all payments before cancelling.",
        });
      }
    }

    const directAllocations = await tx.feePaymentInstallmentAllocation.findMany({
      where: { feePayment: { admissionId } },
      select: { id: true, allocatedAmount: true, reversedAmount: true },
    });

    for (const alloc of directAllocations) {
      const allocated = new Prisma.Decimal(alloc.allocatedAmount.toString());
      const reversed = new Prisma.Decimal(alloc.reversedAmount.toString());
      if (!allocated.equals(reversed)) {
        throw new ConflictException({
          code: "CANCELLATION_UNRESOLVED_PAYMENTS",
          message:
            "Admission cannot be cancelled with unreversed installment allocations. Reverse all payments before cancelling.",
        });
      }
    }

    for (const header of headers) {
      const headerPaid = new Prisma.Decimal(header.totalPaidAmount.toString());
      if (!headerPaid.isZero()) {
        throw new ConflictException({
          code: "CANCELLATION_UNRESOLVED_PAYMENTS",
          message:
            "Admission cannot be cancelled with an outstanding paid balance. Reverse all payments before cancelling.",
        });
      }

      for (const detail of header.feePaymentDetails) {
        const detailPaid = new Prisma.Decimal(detail.amountPaid.toString());
        if (!detailPaid.isZero()) {
          throw new ConflictException({
            code: "CANCELLATION_UNRESOLVED_PAYMENTS",
            message:
              "Admission cannot be cancelled with unreversed fee component amounts. Reverse all payments before cancelling.",
          });
        }
      }

      for (const payment of header.payments) {
        if (!payment.reversalEvent) {
          throw new ConflictException({
            code: "CANCELLATION_UNRESOLVED_PAYMENTS",
            message:
              "Admission cannot be cancelled with unreversed payments. Reverse all payments before cancelling.",
          });
        }
      }

      for (const alloc of header.installmentAllocations) {
        const allocated = new Prisma.Decimal(alloc.allocatedAmount.toString());
        const reversed = new Prisma.Decimal(alloc.reversedAmount.toString());
        if (!allocated.equals(reversed)) {
          throw new ConflictException({
            code: "CANCELLATION_UNRESOLVED_PAYMENTS",
            message:
              "Admission cannot be cancelled with unreversed installment allocations. Reverse all payments before cancelling.",
          });
        }
      }
    }
  }

  protected async lockAdmission(tx: any, admissionId: string): Promise<void> {
    if (typeof tx.$queryRaw !== "function") {
      throw new Error(
        "Mandatory transaction raw locking ($queryRaw) is unavailable on transaction client.",
      );
    }
    await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
  }

  private financialSnapshotError(detailId?: string): ConflictException {
    return new ConflictException({
      code: "FINANCIAL_SNAPSHOT_INCONSISTENT",
      message: "Admission fee financial snapshot is inconsistent.",
      ...(detailId ? { feePaymentDetailsId: detailId } : {}),
    });
  }
}
