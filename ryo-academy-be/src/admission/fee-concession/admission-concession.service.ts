import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { CreateAdmissionConcessionDto, UpdateAdmissionConcessionDto } from "./dto/create-admission-concession.dto.js";
import { AdmissionStatus, CalculationMode } from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { parseMoney } from "../../common/money/money.util.js";

@Injectable()
export class AdmissionConcessionService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getConcessionsForAdmission(admissionId: string) {
    const admission: any = await this.databaseService.admission.findUnique({
      where: { id: admissionId },
      include: { feePaymentHeaders: { where: { isActive: true }, include: { feePaymentDetails: { where: { isActive: true }, include: { concession: { include: { concessionCategory: true } } } } } } },
    });
    if (!admission) throw new NotFoundException(`Admission with id "${admissionId}" not found`);
    const activeHeader = admission.feePaymentHeaders[0];
    const details = activeHeader?.feePaymentDetails || [];
    const grossAmount = details.reduce((sum: Prisma.Decimal, d: any) => sum.plus(new Prisma.Decimal(d.originalAmount.toString())), new Prisma.Decimal(0));
    const totalDiscountAmount = details.reduce((sum: Prisma.Decimal, d: any) => sum.plus(new Prisma.Decimal(d.discountAmount.toString())), new Prisma.Decimal(0));
    const netAmount = grossAmount.minus(totalDiscountAmount);
    return {
      admissionId: admission.id,
      admissionStatus: admission.admissionStatus,
      headerId: activeHeader?.id,
      grossAmount,
      discountAmount: totalDiscountAmount,
      netAmount,
      components: details.map((d: any) => ({
        id: d.id, componentId: d.feeComponentId, nameSnapshot: d.nameSnapshot, originalAmount: d.originalAmount,
        discountApplicable: d.discountApplicable, isMandatory: d.isMandatory, discountAmount: d.discountAmount,
        finalAmount: d.finalAmount, totalAmountToBePaid: d.totalAmountToBePaid,
        concession: d.concession ? { id: d.concession.id, categoryId: d.concession.concessionCategoryId, categoryName: d.concession.concessionCategory?.name ?? null, categoryCode: d.concession.concessionCategory?.code ?? null, discountType: d.concession.discountType, discountValue: d.concession.discountValue, calculatedDiscountAmount: d.concession.calculatedDiscountAmount, justification: d.concession.justification, appliedAt: d.concession.appliedAt, calculationMode: d.concession.calculationMode, requiresReview: d.concession.requiresReview } : null,
      })),
    };
  }

  async assignConcession(admissionId: string, dto: CreateAdmissionConcessionDto, actorUserId: string) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const { admission, header, detail } = await this.target(tx, admissionId, dto.feePaymentDetailsId);
      await this.activityGuard(tx, header, detail); await this.validateState(tx, header);
      const actorId = await this.resolveActor(tx, actorUserId, admission.createdById);
      if (detail.concession) throw new ConflictException("A concession is already assigned to this fee detail.");
      const payable = parseMoney(dto.payableAmount, "payableAmount"); const discount = this.validatePayable(detail, payable);
      if (discount.gt(0)) await tx.admissionFeeConcession.create({ data: { schoolId: admission.schoolId, admissionId, feePaymentDetailsId: detail.id, calculatedDiscountAmount: discount, calculationMode: CalculationMode.PAYABLE, requiresReview: false, appliedById: actorId } });
      await tx.feePaymentDetails.update({ where: { id: detail.id }, data: { discountAmount: discount, finalAmount: payable, totalAmountToBePaid: payable } });
      return this.recompute(tx, header.id);
    });
  }

  async updateConcession(admissionId: string, concessionId: string, dto: UpdateAdmissionConcessionDto, actorUserId: string) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const concession: any = await tx.admissionFeeConcession.findUnique({ where: { id: concessionId } });
      if (!concession || concession.admissionId !== admissionId) throw new NotFoundException("Concession not found on this admission.");
      const { admission, header, detail } = await this.target(tx, admissionId, concession.feePaymentDetailsId);
      await this.activityGuard(tx, header, detail); await this.validateState(tx, header);
      const actorId = await this.resolveActor(tx, actorUserId, admission.createdById);
      const payable = parseMoney(dto.payableAmount, "payableAmount"); const discount = this.validatePayable(detail, payable);
      await tx.admissionFeeConcessionRevision.create({ data: { sourceConcessionId: concession.id, calculationMode: concession.calculationMode, discountType: concession.discountType, discountValue: concession.discountValue, concessionCategoryId: concession.concessionCategoryId, previousPayableAmount: concession.calculationMode === CalculationMode.PAYABLE ? detail.totalAmountToBePaid : null, calculatedDiscountAmount: concession.calculatedDiscountAmount, actorId } });
      if (discount.eq(0)) await tx.admissionFeeConcession.delete({ where: { id: concession.id } });
      else await tx.admissionFeeConcession.update({ where: { id: concession.id }, data: { calculationMode: CalculationMode.PAYABLE, discountType: null, discountValue: null, concessionCategoryId: null, calculatedDiscountAmount: discount, requiresReview: false, appliedById: actorId } });
      await tx.feePaymentDetails.update({ where: { id: detail.id }, data: { discountAmount: discount, finalAmount: payable, totalAmountToBePaid: payable } });
      return this.recompute(tx, header.id);
    });
  }

  private async target(tx: any, admissionId: string, detailId: string) { const admission: any = await tx.admission.findUnique({ where: { id: admissionId }, include: { feePaymentHeaders: { where: { isActive: true }, include: { feePaymentDetails: { where: { isActive: true }, include: { concession: true } } } } } }); if (!admission) throw new NotFoundException("Admission not found"); if (admission.admissionStatus !== AdmissionStatus.DRAFT) throw new BadRequestException("Concessions cannot be modified on this admission."); if (admission.feePaymentHeaders.length !== 1) throw new ConflictException("Admission must have exactly one active fee header."); const header = admission.feePaymentHeaders[0]; const detail = header.feePaymentDetails.find((d: any) => d.id === detailId); if (!detail) throw new NotFoundException("Fee component detail not found on this admission."); if (!detail.isIncluded) throw new BadRequestException("Excluded fee details cannot receive concessions."); return { admission, header, detail }; }
  private validatePayable(detail: any, payable: Prisma.Decimal) { const original = new Prisma.Decimal(detail.originalAmount); if (payable.lt(0) || payable.gt(original)) throw new BadRequestException("payableAmount must be between zero and the original amount."); const discount = original.minus(payable); if (discount.gt(0) && !detail.discountApplicable) throw new BadRequestException("This component is not eligible for discounts."); return discount; }
  private assertSnapshot(detail: any) { const original = new Prisma.Decimal(detail.originalAmount); const discount = new Prisma.Decimal(detail.discountAmount); const payable = new Prisma.Decimal(detail.totalAmountToBePaid); if (original.lt(0) || payable.lt(0) || payable.gt(original) || !original.minus(discount).eq(payable) || !new Prisma.Decimal(detail.finalAmount).eq(payable)) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT"); if (!detail.concession && !discount.eq(0)) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT"); if (detail.concession && !new Prisma.Decimal(detail.concession.calculatedDiscountAmount).eq(discount)) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT"); }
  private async validateState(tx: any, header: any) { const details: any[] = await tx.feePaymentDetails.findMany({ where: { feePaymentHeaderId: header.id, isActive: true, isIncluded: true }, include: { concession: true } }); const gross = details.reduce((s, d) => s.plus(d.originalAmount), new Prisma.Decimal(0)); const discount = details.reduce((s, d) => s.plus(d.discountAmount), new Prisma.Decimal(0)); const net = details.reduce((s, d) => s.plus(d.totalAmountToBePaid), new Prisma.Decimal(0)); for (const d of details) this.assertSnapshot(d); if (!new Prisma.Decimal(header.grossAmount).eq(gross) || !new Prisma.Decimal(header.discountAmount).eq(discount) || !new Prisma.Decimal(header.netAmount).eq(net) || !new Prisma.Decimal(header.totalDueAmount).eq(new Prisma.Decimal(header.netAmount).minus(header.totalPaidAmount))) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT"); }
  private async activityGuard(tx: any, header: any, detail: any) { const [payments, allocations, reversals] = await Promise.all([tx.feePayment.count({ where: { feePaymentHeaderId: header.id } }), tx.feePaymentInstallmentAllocation.count({ where: { feePaymentHeaderId: header.id } }), tx.paymentReversalEvent.count({ where: { feePayment: { feePaymentHeaderId: header.id } } })]); if (payments || allocations || reversals || new Prisma.Decimal(detail.amountPaid).gt(0) || new Prisma.Decimal(header.totalPaidAmount).gt(0)) throw new ConflictException("Fee financial activity prevents concession changes."); }
  private async resolveActor(tx: any, actorUserId: string | undefined, creatorId: string | undefined): Promise<string> { const candidate = actorUserId || creatorId; if (!candidate) throw new BadRequestException("A valid acting user is required for concession changes."); const user = await tx.user.findUnique({ where: { id: candidate }, select: { id: true } }); if (!user) throw new BadRequestException("The acting user could not be verified."); return user.id; }
  private async recompute(tx: any, headerId: string) { const details: any[] = await tx.feePaymentDetails.findMany({ where: { feePaymentHeaderId: headerId, isActive: true, isIncluded: true } }); const gross = details.reduce((s, d) => s.plus(d.originalAmount), new Prisma.Decimal(0)); const discount = details.reduce((s, d) => s.plus(d.discountAmount), new Prisma.Decimal(0)); const net = gross.minus(discount); const payable = details.reduce((s, d) => s.plus(d.totalAmountToBePaid), new Prisma.Decimal(0)); if (!payable.eq(net)) throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT"); const header: any = await tx.feePaymentHeader.findUnique({ where: { id: headerId } }); const paid = new Prisma.Decimal(header.totalPaidAmount); return tx.feePaymentHeader.update({ where: { id: headerId }, data: { grossAmount: gross, discountAmount: discount, netAmount: net, totalFeeAmount: net, totalDueAmount: net.minus(paid) } }); }
  async removeConcession(admissionId: string, concessionId: string) {
    return this.databaseService.$transaction(async (tx: any) => {
      await this.lockAdmission(tx, admissionId);
      const c: any = await tx.admissionFeeConcession.findUnique({ where: { id: concessionId } });
      if (!c || c.admissionId !== admissionId) throw new NotFoundException("Concession record not found on this admission.");
      const admission: any = await tx.admission.findUnique({ where: { id: admissionId }, include: { feePaymentHeaders: { where: { isActive: true }, include: { feePaymentDetails: true } } } });
      if (!admission) throw new NotFoundException("Admission not found");
      if (admission.admissionStatus !== AdmissionStatus.DRAFT) throw new BadRequestException("Concessions cannot be modified on this admission.");
      const header = admission.feePaymentHeaders[0]; if (!header) throw new NotFoundException("No active fee header found.");
      const detail = header.feePaymentDetails.find((d: any) => d.id === c.feePaymentDetailsId); if (!detail) throw new NotFoundException("Fee component detail not found.");
      await tx.admissionFeeConcessionRevision.deleteMany({ where: { sourceConcessionId: c.id } });
      await tx.admissionFeeConcession.delete({ where: { id: c.id } });
      await tx.feePaymentDetails.update({ where: { id: detail.id }, data: { discountAmount: 0, finalAmount: detail.originalAmount, totalAmountToBePaid: detail.originalAmount } });
      return this.recompute(tx, header.id);
    });
  }
  protected async lockAdmission(tx: any, admissionId: string) { if (typeof tx.$queryRaw === "function") await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`; }
}
