import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialFlowType,
  FinancialLogType,
  InstallmentRowStatus,
  LineageEventType,
  Prisma,
} from '../../generated/prisma/client.js';
import '../common/money/decimal-precision.js';
import { DatabaseService } from '../database/database.service.js';
import { StudentService } from './student.service.js';
import { ReverseStudentFeePaymentDto } from './dto/reverse-student-fee-payment.dto.js';

@Injectable()
export class PaymentReversalService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly studentService: StudentService,
  ) {}

  /**
   * Reverses a previously recorded fee payment in full.
   * Restores the exact original installment allocations using lineage events and transfer edges.
   * Reverses exact persisted fee-detail attribution and emits a REVERSAL financial log.
   */
  async reverseStudentFeePayment(
    studentId: string,
    paymentId: string,
    dto: ReverseStudentFeePaymentDto,
    actorUserId: string,
  ): Promise<any> {
    if (!dto.idempotencyKey || typeof dto.idempotencyKey !== 'string') {
      throw new BadRequestException('idempotencyKey is required and must be a UUID.');
    }

    const trimmedReason = (dto.reason ?? '').trim();
    if (!trimmedReason) {
      throw new BadRequestException('Reversal reason is required.');
    }

    // 1. Authenticate actor and resolve school/tenant context
    const actor = await this.databaseService.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, schoolId: true },
    });

    if (!actor?.schoolId) {
      throw new ForbiddenException('A school-scoped user is required.');
    }

    // 2. Verify requested student exists and belongs to actor's school
    const student = await this.databaseService.student.findUnique({
      where: { id: studentId },
      include: { admission: true },
    });

    if (!student || !student.admission || student.admission.schoolId !== actor.schoolId) {
      throw new NotFoundException(`Student with id "${studentId}" not found.`);
    }

    // 3. Verify requested payment exists and belongs to that student and tenant
    const targetPayment = await this.databaseService.feePayment.findUnique({
      where: { id: paymentId },
    });

    if (
      !targetPayment ||
      targetPayment.studentId !== studentId ||
      targetPayment.schoolId !== actor.schoolId
    ) {
      throw new NotFoundException(`Fee payment "${paymentId}" not found for this student.`);
    }

    // 4. Idempotency pre-check outside transaction with complete canonical comparison
    const existingReversal = await this.databaseService.paymentReversalEvent.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { feePayment: true },
    });

    if (existingReversal) {
      this.validateReversalReplay(existingReversal, {
        paymentId,
        studentId,
        schoolId: actor.schoolId,
        reason: trimmedReason,
      });
      return this.studentService.getStudentFees(studentId);
    }

    try {
      return await this.databaseService.$transaction(async (tx) => {
        const admissionId = student.admission.id;

        // Level 1 Lock: Admission
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
        }

        const freshAdmission = await tx.admission.findUnique({
          where: { id: admissionId },
        });

        if (!freshAdmission || freshAdmission.admissionStatus === 'CANCELLED') {
          throw new BadRequestException('Payment reversal is not allowed for cancelled admissions.');
        }

        // Find target payment to get header ID
        const targetPayment = await tx.feePayment.findUnique({
          where: { id: paymentId },
        });

        if (
          !targetPayment ||
          targetPayment.studentId !== studentId ||
          targetPayment.admissionId !== admissionId ||
          targetPayment.schoolId !== actor.schoolId
        ) {
          throw new NotFoundException(`Fee payment "${paymentId}" not found for this student.`);
        }

        const headerId = targetPayment.feePaymentHeaderId;

        // Level 2 Lock: FeePaymentHeader
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "FeePaymentHeader" WHERE id = ${headerId} FOR UPDATE`;
        }

        // Level 3 Lock: FeePaymentDetails
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "FeePaymentDetails" WHERE "feePaymentHeaderId" = ${headerId} ORDER BY id ASC FOR UPDATE`;
        }

        // Replay must be resolved before any schedule-dependent validation.
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "FeePayment" WHERE id = ${paymentId} FOR UPDATE`;
        }
        const inTxReversalByKey = await tx.paymentReversalEvent.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { feePayment: true },
        });
        if (inTxReversalByKey) {
          this.validateReversalReplay(inTxReversalByKey, {
            paymentId,
            studentId,
            schoolId: actor.schoolId,
            reason: trimmedReason,
          });
          return this.studentService.getStudentFees(studentId);
        }

        // Level 4 Lock: AdmissionInstallmentSchedule
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "AdmissionInstallmentSchedule" WHERE "feePaymentHeaderId" = ${headerId} FOR UPDATE`;
        }

        const schedule = await tx.admissionInstallmentSchedule.findUnique({
          where: { feePaymentHeaderId: headerId },
        });

        if (!schedule) {
          throw new NotFoundException(`Installment schedule not found for header "${headerId}".`);
        }

        // Level 5 Lock: AdmissionInstallment rows
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`
            SELECT id FROM "AdmissionInstallment"
            WHERE "scheduleId" = ${schedule.id}
            ORDER BY "dueDate" ASC, sequence ASC, "offsetAmount" ASC, id ASC
            FOR UPDATE
          `;
        }

        // Double reversal prevention (different key attempting to reverse already-reversed payment)
        const alreadyReversed = await tx.paymentReversalEvent.findUnique({
          where: { feePaymentId: paymentId },
        });

        if (alreadyReversed) {
          throw new ConflictException('Payment has already been reversed.');
        }

        // Level 7 Lock: FeePaymentInstallmentAllocation rows
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`
            SELECT id FROM "FeePaymentInstallmentAllocation"
            WHERE "feePaymentId" = ${paymentId}
            ORDER BY id ASC
            FOR UPDATE
          `;
        }

        const allocations = await tx.feePaymentInstallmentAllocation.findMany({
          where: { feePaymentId: paymentId },
          orderBy: { id: 'asc' },
        });

        if (!allocations || allocations.length === 0) {
          throw new ConflictException(`No installment allocations found for fee payment "${paymentId}".`);
        }

        const paymentAmount = new Prisma.Decimal(targetPayment.amount.toString());
        const totalAllocated = allocations.reduce(
          (sum, a) => sum.plus(new Prisma.Decimal(a.allocatedAmount.toString())),
          new Prisma.Decimal(0),
        );

        if (!totalAllocated.equals(paymentAmount)) {
          throw new ConflictException(
            `Total allocated amount (${totalAllocated.toString()}) does not match payment amount (${paymentAmount.toString()}).`,
          );
        }

        for (const alloc of allocations) {
          const revAmt = new Prisma.Decimal(alloc.reversedAmount.toString());
          if (!revAmt.isZero()) {
            throw new ConflictException(`Allocation "${alloc.id}" has already been reversed.`);
          }
        }

        // Re-read fresh header with details
        const freshHeader = await tx.feePaymentHeader.findUnique({
          where: { id: headerId },
          include: {
            feePaymentDetails: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (!freshHeader) {
          throw new NotFoundException(`Fee payment header "${headerId}" not found.`);
        }

        const attributions = await tx.feePaymentDetailAttribution.findMany({
          where: { feePaymentId: paymentId },
          orderBy: { id: 'asc' },
        });
        if (!attributions.length) {
          throw new ConflictException({
            code: 'PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE',
            message: 'Payment detail attribution is unavailable for this historical payment.',
          });
        }

        const headerTotalPaid = new Prisma.Decimal(freshHeader.totalPaidAmount.toString());
        const headerTotalFee = new Prisma.Decimal(freshHeader.totalFeeAmount.toString());

        if (paymentAmount.gt(headerTotalPaid)) {
          throw new ConflictException('Reversal amount exceeds total paid amount on the fee header.');
        }

        const detailsSumPaid = freshHeader.feePaymentDetails.reduce(
          (sum, d) => sum.plus(new Prisma.Decimal(d.amountPaid.toString())),
          new Prisma.Decimal(0),
        );

        if (!detailsSumPaid.equals(headerTotalPaid)) {
          throw new ConflictException('Fee payment details sum does not match header total paid amount.');
        }

        const zero = new Prisma.Decimal(0);
        const detailsById = new Map(freshHeader.feePaymentDetails.map((detail) => [detail.id, detail]));
        let attributionTotal = zero;
        const detailReversals: Array<{ id: string; nextPaid: Prisma.Decimal }> = [];
        for (const attribution of attributions) {
          if (attribution.feePaymentHeaderId !== headerId || attribution.feePaymentId !== paymentId) {
            throw new ConflictException('Payment detail attribution ownership is inconsistent.');
          }
          const allocated = new Prisma.Decimal(attribution.amount.toString());
          if (allocated.lte(zero) || !allocated.eq(allocated.toDecimalPlaces(2))) {
            throw new ConflictException('Payment detail attribution amount is invalid.');
          }
          const detail = detailsById.get(attribution.feePaymentDetailsId);
          if (!detail || detail.feePaymentHeaderId !== headerId) {
            throw new ConflictException('Payment detail attribution ownership is inconsistent.');
          }
          const currentPaid = new Prisma.Decimal(detail.amountPaid.toString());
          if (allocated.gt(currentPaid)) throw new ConflictException('Fee payment detail counter underflow.');
          attributionTotal = attributionTotal.plus(allocated);
          detailReversals.push({ id: detail.id, nextPaid: currentPaid.minus(allocated) });
        }
        if (!attributionTotal.equals(paymentAmount)) {
          throw new ConflictException('Payment detail attribution total does not match payment amount.');
        }

        // Validate every installment source before the first financial write.
        for (const alloc of allocations) {
          const targetInst = await tx.admissionInstallment.findUnique({ where: { id: alloc.installmentId } });
          if (!targetInst) throw new NotFoundException(`Target installment "${alloc.installmentId}" not found.`);
          if (targetInst.scheduleId !== schedule.id) throw new ConflictException(`Target installment does not belong to schedule "${schedule.id}".`);
          if (targetInst.status !== InstallmentRowStatus.PAID && targetInst.status !== InstallmentRowStatus.PAID_EARLY) {
            throw new ConflictException(`Target installment "${targetInst.id}" is not reversible.`);
          }
          if (targetInst.supersededAt !== null) throw new ConflictException(`Target installment "${targetInst.id}" has already been superseded.`);
        }

        for (const reversal of detailReversals) {
          await tx.feePaymentDetails.update({
            where: { id: reversal.id },
            data: { amountPaid: reversal.nextPaid },
          });
        }

        // Update FeePaymentHeader balances
        const nextPaidAmount = headerTotalPaid.minus(paymentAmount);
        const nextDueAmount = headerTotalFee.minus(nextPaidAmount);

        await tx.feePaymentHeader.update({
          where: { id: headerId },
          data: {
            totalPaidAmount: nextPaidAmount,
            totalDueAmount: nextDueAmount,
          },
        });

        // Level 8: Create PaymentReversalEvent
        const reversalEvent = await tx.paymentReversalEvent.create({
          data: {
            feePaymentId: paymentId,
            schoolId: actor.schoolId,
            reversalAmount: paymentAmount,
            reason: trimmedReason,
            idempotencyKey: dto.idempotencyKey,
            reversedByUserId: actorUserId,
          },
        });

        // Level 9: Process each allocation & create InstallmentAllocationReversalEvent rows
        for (const alloc of allocations) {
          const targetInst = await tx.admissionInstallment.findUnique({
            where: { id: alloc.installmentId },
          });

          if (!targetInst) {
            throw new NotFoundException(`Target installment "${alloc.installmentId}" not found.`);
          }

          if (targetInst.scheduleId !== schedule.id) {
            throw new ConflictException(`Target installment does not belong to schedule "${schedule.id}".`);
          }

          if (
            targetInst.status !== InstallmentRowStatus.PAID &&
            targetInst.status !== InstallmentRowStatus.PAID_EARLY
          ) {
            throw new ConflictException(
              `Target installment "${targetInst.id}" is in status "${targetInst.status}", expected PAID or PAID_EARLY.`,
            );
          }

          if (targetInst.supersededAt !== null) {
            throw new ConflictException(`Target installment "${targetInst.id}" has already been superseded.`);
          }

          // Update allocation counter
          await tx.feePaymentInstallmentAllocation.update({
            where: { id: alloc.id },
            data: {
              reversedAmount: alloc.allocatedAmount,
            },
          });

          // Mark target installment SUPERSEDED
          await tx.admissionInstallment.update({
            where: { id: targetInst.id },
            data: {
              status: InstallmentRowStatus.SUPERSEDED,
              supersededAt: new Date(),
            },
          });

          // Find current max subSequence for sequence
          const maxSubSeqRecord = await tx.admissionInstallment.aggregate({
            where: {
              scheduleId: schedule.id,
              sequence: targetInst.sequence,
            },
            _max: { subSequence: true },
          });
          const maxSubSeq = maxSubSeqRecord._max.subSequence ?? targetInst.subSequence;
          const nextSubSeq = maxSubSeq + 1;

          // Create restored child installment
          const restoredChild = await tx.admissionInstallment.create({
            data: {
              scheduleId: schedule.id,
              feePaymentHeaderId: headerId,
              sequence: targetInst.sequence,
              subSequence: nextSubSeq,
              offsetAmount: targetInst.offsetAmount,
              rootInstallmentId: targetInst.rootInstallmentId ?? targetInst.id,
              label: `${targetInst.label} (Restored)`,
              amount: alloc.allocatedAmount,
              dueDate: targetInst.dueDate,
              status: InstallmentRowStatus.PENDING,
              paidAt: null,
            },
          });

          // Create Lineage Event
          const lineageEvent = await tx.installmentLineageEvent.create({
            data: {
              scheduleId: schedule.id,
              feePaymentId: paymentId,
              eventType: LineageEventType.REVERSAL_RESTORE,
              description: `Reversal of payment ${paymentId}: restored installment sequence ${targetInst.sequence}.${nextSubSeq} for amount ${alloc.allocatedAmount.toString()}`,
            },
          });

          // Create Lineage Transfer Edge (1:1)
          await tx.installmentLineageTransferEdge.create({
            data: {
              eventId: lineageEvent.id,
              scheduleId: schedule.id,
              sourceInstallmentId: targetInst.id,
              resultInstallmentId: restoredChild.id,
              amount: alloc.allocatedAmount,
            },
          });

          // Record Level 9 InstallmentAllocationReversalEvent
          await tx.installmentAllocationReversalEvent.create({
            data: {
              paymentReversalEventId: reversalEvent.id,
              allocationId: alloc.id,
              feePaymentId: paymentId,
              amount: alloc.allocatedAmount,
            },
          });
        }

        // Level 10: Create FinancialLog
        await tx.financialLog.create({
          data: {
            schoolId: actor.schoolId,
            userId: actorUserId,
            type: FinancialLogType.FEE_PAYMENT_REVERSAL,
            flowType: FinancialFlowType.REVERSAL,
            amount: paymentAmount,
            occurredAt: new Date(),
            description: `Reversal of fee payment ${paymentId}: ${trimmedReason}`,
            sourceType: 'FEE_PAYMENT',
            sourceId: paymentId,
          },
        });

        // Post-Mutation Financial & Lineage Reconciliation
        await this.verifyPostReversalInvariants(tx, {
          headerId,
          scheduleId: schedule.id,
          paymentId,
          paymentAmount,
        });

        return this.studentService.getStudentFees(studentId);
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.databaseService.paymentReversalEvent.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { feePayment: true },
        });
        if (existing) {
          this.validateReversalReplay(existing, {
            paymentId,
            studentId,
            schoolId: actor.schoolId,
            reason: trimmedReason,
          });
          return this.studentService.getStudentFees(studentId);
        }
      }
      throw error;
    }
  }

  private validateReversalReplay(
    existing: {
      feePaymentId: string;
      schoolId: string;
      reason: string;
      feePayment?: { studentId: string } | null;
    },
    canonical: {
      paymentId: string;
      studentId: string;
      schoolId: string;
      reason: string;
    },
  ): void {
    const existingStudentId = existing.feePayment?.studentId;
    if (
      existing.feePaymentId !== canonical.paymentId ||
      existing.schoolId !== canonical.schoolId ||
      existing.reason !== canonical.reason ||
      (existingStudentId && existingStudentId !== canonical.studentId)
    ) {
      throw new ConflictException(
        'Idempotency key was previously used with different reversal parameters.',
      );
    }
  }

  /**
   * Post-mutation reconciliation verifying headers, installments, active leaves,
   * component counters, allocation counters, and schedule totals.
   * Throws ConflictException and rolls back the transaction if any invariant fails.
   */
  private async verifyPostReversalInvariants(
    tx: Prisma.TransactionClient,
    ctx: {
      headerId: string;
      scheduleId: string;
      paymentId: string;
      paymentAmount: Prisma.Decimal;
    },
  ): Promise<void> {
    // A. Header reconciliation
    const header = await tx.feePaymentHeader.findUnique({
      where: { id: ctx.headerId },
      include: { feePaymentDetails: true },
    });
    if (!header) {
      throw new ConflictException('Header not found during post-reversal verification.');
    }

    const totalFee = new Prisma.Decimal(header.totalFeeAmount.toString());
    const totalPaid = new Prisma.Decimal(header.totalPaidAmount.toString());
    const totalDue = new Prisma.Decimal(header.totalDueAmount.toString());
    const netAmount = new Prisma.Decimal(header.netAmount.toString());

    if (!totalDue.equals(totalFee.minus(totalPaid))) {
      throw new ConflictException(
        `Header totalDueAmount (${totalDue}) does not equal totalFeeAmount (${totalFee}) minus totalPaidAmount (${totalPaid}).`,
      );
    }

    if (!totalFee.equals(netAmount)) {
      throw new ConflictException(
        `Header totalFeeAmount (${totalFee}) does not equal netAmount (${netAmount}).`,
      );
    }

    // B. Installment & active-leaf reconciliation
    const schedule = await tx.admissionInstallmentSchedule.findUnique({
      where: { id: ctx.scheduleId },
      include: { installments: true, lineageEvents: { include: { transferEdges: true } } },
    });
    if (!schedule) {
      throw new ConflictException('Schedule not found during post-reversal verification.');
    }

    const allEdges = schedule.lineageEvents.flatMap((e) => e.transferEdges);
    let pendingLeavesSum = new Prisma.Decimal(0);
    let paidLeavesSum = new Prisma.Decimal(0);
    let allLeavesSum = new Prisma.Decimal(0);

    for (const inst of schedule.installments) {
      const isSupersededStatus = inst.status === InstallmentRowStatus.SUPERSEDED;
      const hasSupersededAt = inst.supersededAt !== null;

      if (isSupersededStatus !== hasSupersededAt) {
        throw new ConflictException(
          `Installment "${inst.id}" has inconsistent superseded status (${inst.status}) and timestamp (${inst.supersededAt}).`,
        );
      }

      const hasOutEdges = allEdges.some((e) => e.sourceInstallmentId === inst.id);
      if (hasOutEdges) {
        if (!isSupersededStatus) {
          throw new ConflictException(
            `Installment "${inst.id}" has outgoing transfer edges but is not marked SUPERSEDED.`,
          );
        }
      } else {
        if (isSupersededStatus) {
          throw new ConflictException(
            `Installment "${inst.id}" is marked SUPERSEDED but has no outgoing transfer edges.`,
          );
        }

        const validStatuses: InstallmentRowStatus[] = [
          InstallmentRowStatus.PENDING,
          InstallmentRowStatus.PAID,
          InstallmentRowStatus.PAID_EARLY,
        ];
        if (!validStatuses.includes(inst.status)) {
          throw new ConflictException(
            `Active leaf installment "${inst.id}" has invalid status "${inst.status}".`,
          );
        }

        const instAmt = new Prisma.Decimal(inst.amount.toString());
        allLeavesSum = allLeavesSum.plus(instAmt);

        if (inst.status === InstallmentRowStatus.PENDING) {
          pendingLeavesSum = pendingLeavesSum.plus(instAmt);
        } else {
          paidLeavesSum = paidLeavesSum.plus(instAmt);
        }
      }
    }

    if (!pendingLeavesSum.equals(totalDue)) {
      throw new ConflictException(
        `SUM(active PENDING installments) (${pendingLeavesSum}) does not equal header totalDueAmount (${totalDue}).`,
      );
    }

    if (!paidLeavesSum.equals(totalPaid)) {
      throw new ConflictException(
        `SUM(active PAID/PAID_EARLY installments) (${paidLeavesSum}) does not equal header totalPaidAmount (${totalPaid}).`,
      );
    }

    if (!allLeavesSum.equals(totalFee)) {
      throw new ConflictException(
        `SUM(ALL active installment leaves) (${allLeavesSum}) does not equal header totalFeeAmount (${totalFee}).`,
      );
    }

    // C. Component reconciliation
    let detailsPaidSum = new Prisma.Decimal(0);
    for (const d of header.feePaymentDetails) {
      const dPaid = new Prisma.Decimal(d.amountPaid.toString());
      const dToPay = new Prisma.Decimal(d.totalAmountToBePaid.toString());
      if (dPaid.lt(0) || dPaid.gt(dToPay)) {
        throw new ConflictException(
          `Component "${d.nameSnapshot}" amountPaid (${dPaid}) is outside allowed bounds [0, ${dToPay}].`,
        );
      }
      detailsPaidSum = detailsPaidSum.plus(dPaid);
    }

    if (!detailsPaidSum.equals(totalPaid)) {
      throw new ConflictException(
        `SUM(FeePaymentDetails.amountPaid) (${detailsPaidSum}) does not equal header totalPaidAmount (${totalPaid}).`,
      );
    }

    // D. Allocation reversal reconciliation
    const reversalEvents = await tx.installmentAllocationReversalEvent.findMany({
      where: { feePaymentId: ctx.paymentId },
    });
    const reversalEventsSum = reversalEvents.reduce(
      (sum, e) => sum.plus(new Prisma.Decimal(e.amount.toString())),
      new Prisma.Decimal(0),
    );
    if (!reversalEventsSum.equals(ctx.paymentAmount)) {
      throw new ConflictException(
        `SUM(InstallmentAllocationReversalEvent.amount) (${reversalEventsSum}) does not equal payment amount (${ctx.paymentAmount}).`,
      );
    }

    const originalAllocs = await tx.feePaymentInstallmentAllocation.findMany({
      where: { feePaymentId: ctx.paymentId },
    });
    for (const a of originalAllocs) {
      const reversedAmt = new Prisma.Decimal(a.reversedAmount.toString());
      const allocatedAmt = new Prisma.Decimal(a.allocatedAmount.toString());
      if (!reversedAmt.equals(allocatedAmt)) {
        throw new ConflictException(
          `Allocation "${a.id}" reversedAmount (${reversedAmt}) does not equal allocatedAmount (${allocatedAmt}).`,
        );
      }
    }

    // E. Schedule reconciliation
    const scheduleTotal = new Prisma.Decimal(schedule.totalAmount.toString());
    const sequenceRoots = schedule.installments.filter(
      (i) => i.rootInstallmentId === null || i.subSequence === 0,
    );
    const rootAmountsSum = sequenceRoots.reduce(
      (sum, r) => sum.plus(new Prisma.Decimal(r.amount.toString())),
      new Prisma.Decimal(0),
    );

    if (!rootAmountsSum.equals(scheduleTotal)) {
      throw new ConflictException(
        `SUM(sequence root amounts) (${rootAmountsSum}) does not equal schedule totalAmount (${scheduleTotal}).`,
      );
    }

    if (!scheduleTotal.equals(netAmount)) {
      throw new ConflictException(
        `Schedule totalAmount (${scheduleTotal}) does not equal header netAmount (${netAmount}).`,
      );
    }
  }
}
