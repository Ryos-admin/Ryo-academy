import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import {
  CreateAdmissionConcessionDto,
  UpdateAdmissionConcessionDto,
} from "./dto/create-admission-concession.dto.js";
import {
  AdmissionStatus,
  CalculationMode,
  FeePricingVersion,
} from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { parseMoney } from "../../common/money/money.util.js";

@Injectable()
export class AdmissionConcessionService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getConcessionsForAdmission(admissionId: string) {
    const admission: any = await this.databaseService.admission.findUnique({
      where: { id: admissionId },
      include: {
        feePaymentHeaders: {
          where: { isActive: true },
          include: {
            feePaymentDetails: {
              where: { isActive: true },
              include: { concession: { include: { concessionCategory: true } } },
            },
          },
        },
      },
    });
    if (!admission) throw new NotFoundException(`Admission with id "${admissionId}" not found`);
    const activeHeader = admission.feePaymentHeaders[0];
    const details = activeHeader?.feePaymentDetails || [];
    const grossAmount =
      activeHeader?.grossAmount != null
        ? new Prisma.Decimal(activeHeader.grossAmount.toString())
        : details.reduce(
            (sum: Prisma.Decimal, d: any) => sum.plus(new Prisma.Decimal(d.originalAmount.toString())),
            new Prisma.Decimal(0),
          );
    const totalDiscountAmount =
      activeHeader?.discountAmount != null
        ? new Prisma.Decimal(activeHeader.discountAmount.toString())
        : details.reduce(
            (sum: Prisma.Decimal, d: any) => sum.plus(new Prisma.Decimal(d.discountAmount.toString())),
            new Prisma.Decimal(0),
          );
    const netAmount =
      activeHeader?.netAmount != null
        ? new Prisma.Decimal(activeHeader.netAmount.toString())
        : grossAmount.minus(totalDiscountAmount);
    return {
      admissionId: admission.id,
      admissionStatus: admission.admissionStatus,
      headerId: activeHeader?.id,
      grossAmount,
      discountAmount: totalDiscountAmount,
      netAmount,
      components: details.map((d: any) => ({
        id: d.id,
        componentId: d.feeComponentId,
        nameSnapshot: d.nameSnapshot,
        originalAmount: d.originalAmount,
        discountApplicable: d.discountApplicable,
        isMandatory: d.isMandatory,
        discountAmount: d.discountAmount,
        taxableAmount: d.taxableAmount,
        gstAmount: d.gstAmount,
        gstPercentage: d.gstPercentage,
        finalAmount: d.finalAmount,
        totalAmountToBePaid: d.totalAmountToBePaid,
        concession: d.concession
          ? {
              id: d.concession.id,
              categoryId: d.concession.concessionCategoryId,
              categoryName: d.concession.concessionCategory?.name ?? null,
              categoryCode: d.concession.concessionCategory?.code ?? null,
              discountType: d.concession.discountType,
              discountValue: d.concession.discountValue,
              calculatedDiscountAmount: d.concession.calculatedDiscountAmount,
              justification: d.concession.justification,
              appliedAt: d.concession.appliedAt,
              calculationMode: d.concession.calculationMode,
              requiresReview: d.concession.requiresReview,
            }
          : null,
      })),
    };
  }

  async assignConcession(
    admissionId: string,
    dto: CreateAdmissionConcessionDto,
    actorUserId: string,
  ) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const { admission, header, detail } = await this.target(
        tx,
        admissionId,
        dto.feePaymentDetailsId,
      );
      await this.activityGuard(tx, header, detail);
      await this.validateState(tx, header);
      const actorId = await this.resolveActor(tx, actorUserId, admission.createdById);
      if (detail.concession)
        throw new ConflictException("A concession is already assigned to this fee detail.");
      const payable = parseMoney(dto.payableAmount, "payableAmount");
      const discount = this.validatePayable(detail, payable);
      if (discount.gt(0))
        await tx.admissionFeeConcession.create({
          data: {
            schoolId: admission.schoolId,
            admissionId,
            feePaymentDetailsId: detail.id,
            calculatedDiscountAmount: discount,
            calculationMode: CalculationMode.PAYABLE,
            requiresReview: false,
            appliedById: actorId,
          },
        });
      return this.applyDetailMutation(tx, header, detail, discount, payable);
    }, { timeout: 10000, maxWait: 5000 });
  }

  async updateConcession(
    admissionId: string,
    concessionId: string,
    dto: UpdateAdmissionConcessionDto,
    actorUserId: string,
  ) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const concession: any = await tx.admissionFeeConcession.findUnique({
        where: { id: concessionId },
      });
      if (!concession || concession.admissionId !== admissionId)
        throw new NotFoundException("Concession not found on this admission.");
      const { admission, header, detail } = await this.target(
        tx,
        admissionId,
        concession.feePaymentDetailsId,
      );
      await this.activityGuard(tx, header, detail);
      await this.validateState(tx, header);
      const actorId = await this.resolveActor(tx, actorUserId, admission.createdById);
      const payable = parseMoney(dto.payableAmount, "payableAmount");
      const discount = this.validatePayable(detail, payable);
      await tx.admissionFeeConcessionRevision.create({
        data: {
          sourceConcessionId: concession.id,
          calculationMode: concession.calculationMode,
          discountType: concession.discountType,
          discountValue: concession.discountValue,
          concessionCategoryId: concession.concessionCategoryId,
          previousPayableAmount:
            concession.calculationMode === CalculationMode.PAYABLE
              ? detail.totalAmountToBePaid
              : null,
          calculatedDiscountAmount: concession.calculatedDiscountAmount,
          actorId,
        },
      });
      if (discount.eq(0)) await tx.admissionFeeConcession.delete({ where: { id: concession.id } });
      else
        await tx.admissionFeeConcession.update({
          where: { id: concession.id },
          data: {
            calculationMode: CalculationMode.PAYABLE,
            discountType: null,
            discountValue: null,
            concessionCategoryId: null,
            calculatedDiscountAmount: discount,
            requiresReview: false,
            appliedById: actorId,
          },
        });
      return this.applyDetailMutation(tx, header, detail, discount, payable);
    }, { timeout: 10000, maxWait: 5000 });
  }

  private async target(tx: any, admissionId: string, detailId: string) {
    const admission: any = await tx.admission.findUnique({
      where: { id: admissionId },
      include: {
        feePaymentHeaders: {
          where: { isActive: true },
          include: {
            feePaymentDetails: { where: { isActive: true }, include: { concession: true } },
          },
        },
      },
    });
    if (!admission) throw new NotFoundException("Admission not found");
    if (admission.admissionStatus !== AdmissionStatus.DRAFT)
      throw new ConflictException("Concessions can only be changed while the admission is DRAFT.");
    if (admission.feePaymentHeaders.length !== 1)
      throw new ConflictException("Admission must have exactly one active fee header.");
    const header = admission.feePaymentHeaders[0];
    const detail = header.feePaymentDetails.find((d: any) => d.id === detailId);
    if (!detail) throw new NotFoundException("Fee component detail not found on this admission.");
    if (!detail.isIncluded)
      throw new BadRequestException("Excluded fee details cannot receive concessions.");
    return { admission, header, detail };
  }

  private async applyDetailMutation(
    tx: any,
    header: any,
    detail: any,
    discount: Prisma.Decimal,
    payable: Prisma.Decimal,
  ) {
    if (header.pricingVersion === FeePricingVersion.V0_SNAPSHOTTED) {
      const original = new Prisma.Decimal(detail.originalAmount.toString());
      const discountPercentage = original.gt(0)
        ? discount.mul(100).div(original).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);
      const taxableAmount = original.minus(discount);
      const gstPercentage = new Prisma.Decimal((detail.gstPercentage ?? "0.00").toString());
      const rawGst = taxableAmount.mul(gstPercentage).div(100);
      const gstAmount = rawGst.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const totalAmountToBePaid = taxableAmount.plus(gstAmount);
      const finalAmount = totalAmountToBePaid;

      await tx.feePaymentDetails.update({
        where: { id: detail.id },
        data: {
          discountPercentage,
          discountAmount: discount,
          taxableAmount,
          gstAmount,
          finalAmount,
          totalAmountToBePaid,
        },
      });
      return this.recomputeV0(tx, header.id);
    } else {
      await tx.feePaymentDetails.update({
        where: { id: detail.id },
        data: { discountAmount: discount, finalAmount: payable, totalAmountToBePaid: payable },
      });
      return this.recompute(tx, header.id);
    }
  }

  private validatePayable(detail: any, payable: Prisma.Decimal) {
    const original = new Prisma.Decimal(detail.originalAmount);
    if (payable.lt(0) || payable.gt(original))
      throw new BadRequestException("payableAmount must be between zero and the original amount.");
    const discount = original.minus(payable);
    if (discount.gt(0) && !detail.discountApplicable)
      throw new BadRequestException("This component is not eligible for discounts.");
    return discount;
  }

  private assertSnapshot(detail: any) {
    const original = new Prisma.Decimal(detail.originalAmount);
    const discount = new Prisma.Decimal(detail.discountAmount);
    const payable = new Prisma.Decimal(detail.totalAmountToBePaid);
    if (
      original.lt(0) ||
      payable.lt(0) ||
      payable.gt(original) ||
      !original.minus(discount).eq(payable) ||
      !new Prisma.Decimal(detail.finalAmount).eq(payable)
    )
      throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
    if (!detail.concession && !discount.eq(0))
      throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
    if (
      detail.concession &&
      !new Prisma.Decimal(detail.concession.calculatedDiscountAmount).eq(discount)
    )
      throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
  }

  private assertV0FeeSnapshotConsistency(header: any, details: any[]) {
    const applicable = details.filter((detail: any) => detail.isIncluded);
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
        throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
      }
      if (!detailTaxable.plus(detailGst).equals(payable)) {
        throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
      }
      if (!finalAmt.equals(payable)) {
        throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
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
      throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
    }
  }

  private async validateState(tx: any, header: any) {
    if (header.pricingVersion === FeePricingVersion.V0_SNAPSHOTTED) {
      const details = await tx.feePaymentDetails.findMany({
        where: { feePaymentHeaderId: header.id, isActive: true },
        include: { concession: true },
      });
      this.assertV0FeeSnapshotConsistency(header, details);
      return;
    }
    const details: any[] = await tx.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: header.id, isActive: true, isIncluded: true },
      include: { concession: true },
    });
    const gross = details.reduce((s, d) => s.plus(d.originalAmount), new Prisma.Decimal(0));
    const discount = details.reduce((s, d) => s.plus(d.discountAmount), new Prisma.Decimal(0));
    const net = details.reduce((s, d) => s.plus(d.totalAmountToBePaid), new Prisma.Decimal(0));
    for (const d of details) this.assertSnapshot(d);
    if (
      !new Prisma.Decimal(header.grossAmount).eq(gross) ||
      !new Prisma.Decimal(header.discountAmount).eq(discount) ||
      !new Prisma.Decimal(header.netAmount).eq(net) ||
      !new Prisma.Decimal(header.totalDueAmount).eq(
        new Prisma.Decimal(header.netAmount).minus(header.totalPaidAmount),
      )
    )
      throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
  }

  private async activityGuard(tx: any, header: any, detail?: any) {
    const [payments, allocations, reversals] = await Promise.all([
      tx.feePayment.count({ where: { feePaymentHeaderId: header.id } }),
      tx.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: header.id } }),
      tx.paymentReversalEvent.count({ where: { feePayment: { feePaymentHeaderId: header.id } } }),
    ]);
    const allDetails = await tx.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: header.id },
      select: { amountPaid: true },
    });
    if (
      payments ||
      allocations ||
      reversals ||
      allDetails.some((d: any) => !new Prisma.Decimal(d.amountPaid.toString()).isZero()) ||
      !new Prisma.Decimal(header.totalPaidAmount.toString()).isZero()
    )
      throw new ConflictException("Fee configuration cannot be changed after financial activity.");
  }

  private async resolveActor(
    tx: any,
    actorUserId: string | undefined,
    creatorId: string | undefined,
  ): Promise<string> {
    const candidate = actorUserId || creatorId;
    if (!candidate)
      throw new BadRequestException("A valid acting user is required for concession changes.");
    const user = await tx.user.findUnique({ where: { id: candidate }, select: { id: true } });
    if (!user) throw new BadRequestException("The acting user could not be verified.");
    return user.id;
  }

  private async recompute(tx: any, headerId: string) {
    const details: any[] = await tx.feePaymentDetails.findMany({
      where: { feePaymentHeaderId: headerId, isActive: true, isIncluded: true },
    });
    const gross = details.reduce((s, d) => s.plus(d.originalAmount), new Prisma.Decimal(0));
    const discount = details.reduce((s, d) => s.plus(d.discountAmount), new Prisma.Decimal(0));
    const net = gross.minus(discount);
    const payable = details.reduce((s, d) => s.plus(d.totalAmountToBePaid), new Prisma.Decimal(0));
    if (!payable.eq(net)) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
    const header: any = await tx.feePaymentHeader.findUnique({ where: { id: headerId } });
    const paid = new Prisma.Decimal(header.totalPaidAmount);
    return tx.feePaymentHeader.update({
      where: { id: headerId },
      data: {
        grossAmount: gross,
        discountAmount: discount,
        netAmount: net,
        totalFeeAmount: net,
        totalDueAmount: net.minus(paid),
      },
    });
  }

  public async recomputeV0(tx: any, headerId: string) {
    const header = await tx.feePaymentHeader.findUnique({ where: { id: headerId } });
    if (!header) {
      throw new NotFoundException(`Fee payment header with ID "${headerId}" not found.`);
    }
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
    const due = net.minus(paid);
    if (due.lt(0)) {
      throw new ConflictException({
        code: "NEGATIVE_DUE_PROHIBITED",
        message: `Calculated due amount for header "${headerId}" is negative (net ₹${net} < paid ₹${paid}). Clamping or synthetic credit is prohibited.`,
        feePaymentHeaderId: headerId,
      });
    }
    return tx.feePaymentHeader.update({
      where: { id: headerId },
      data: {
        grossAmount: gross,
        discountAmount: discount,
        taxableAmount: taxable,
        gstAmount: gst,
        netAmount: net,
        totalFeeAmount: net,
        totalPaidAmount: paid,
        totalDueAmount: due,
      },
    });
  }

  async removeConcession(admissionId: string, concessionId: string) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const c: any = await tx.admissionFeeConcession.findUnique({ where: { id: concessionId } });
      if (!c || c.admissionId !== admissionId)
        throw new NotFoundException("Concession record not found on this admission.");
      const admission: any = await tx.admission.findUnique({
        where: { id: admissionId },
        include: {
          feePaymentHeaders: {
            where: { isActive: true },
            include: {
              feePaymentDetails: { where: { isActive: true }, include: { concession: true } },
            },
          },
        },
      });
      if (!admission) throw new NotFoundException("Admission not found");
      if (admission.admissionStatus !== AdmissionStatus.DRAFT)
        throw new ConflictException("Concessions can only be changed while the admission is DRAFT.");
      const header = admission.feePaymentHeaders[0];
      if (!header) throw new NotFoundException("No active fee header found.");
      const detail = header.feePaymentDetails.find((d: any) => d.id === c.feePaymentDetailsId);
      if (!detail) throw new NotFoundException("Fee component detail not found.");
      await this.activityGuard(tx, header, detail);
      await this.validateState(tx, header);
      await tx.admissionFeeConcessionRevision.deleteMany({ where: { sourceConcessionId: c.id } });
      await tx.admissionFeeConcession.delete({ where: { id: c.id } });
      return this.applyDetailMutation(
        tx,
        header,
        detail,
        new Prisma.Decimal(0),
        new Prisma.Decimal(detail.originalAmount.toString()),
      );
    }, { timeout: 10000, maxWait: 5000 });
  }
  protected async lockAdmission(tx: any, admissionId: string) {
    if (typeof tx.$queryRaw === "function")
      await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
  }
}
