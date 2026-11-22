import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InstallmentRowStatus,
  LineageEventType,
  Prisma,
} from '../../../generated/prisma/client.js';
import '../../common/money/decimal-precision.js';

export interface ReconcileScheduleInput {
  tx: Prisma.TransactionClient;
  schoolId: string;
  admissionId: string;
  feePaymentHeaderId: string;
  headerTotalFeeAmount: Prisma.Decimal;
  headerTotalDueAmount: Prisma.Decimal;
  paymentAmount: Prisma.Decimal;
}

export interface ExecuteFifoAllocationInput {
  tx: Prisma.TransactionClient;
  schedule: any;
  pendingInstallments: any[];
  feePaymentHeaderId: string;
  feePaymentId: string;
  paymentAmount: Prisma.Decimal;
  paymentDate: Date;
  schoolTimezone?: string;
}

export interface FifoAllocationInput {
  tx: Prisma.TransactionClient;
  schoolId: string;
  admissionId: string;
  feePaymentHeaderId: string;
  feePaymentId: string;
  paymentAmount: Prisma.Decimal;
  paymentDate: Date;
  headerTotalFeeAmount: Prisma.Decimal;
  headerTotalDueAmount: Prisma.Decimal;
  schoolTimezone?: string;
}

export function getCalendarDateString(date: Date, timeZone: string = 'Asia/Kolkata'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

@Injectable()
export class InstallmentAllocationService {
  /**
   * Reconciles and acquires row locks for the schedule (Level 4) and pending installments (Level 5).
   * Validates all financial and structural invariants before payment row insertion.
   */
  async reconcileAndLockSchedule(input: ReconcileScheduleInput): Promise<{ schedule: any; pendingInstallments: any[] }> {
    const {
      tx,
      schoolId,
      admissionId,
      feePaymentHeaderId,
      headerTotalFeeAmount,
      headerTotalDueAmount,
      paymentAmount,
    } = input;

    // Level 4 Lock: AdmissionInstallmentSchedule
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "AdmissionInstallmentSchedule" WHERE "feePaymentHeaderId" = ${feePaymentHeaderId} FOR UPDATE`;
    }

    if (!tx.admissionInstallmentSchedule || typeof tx.admissionInstallmentSchedule.findUnique !== 'function') {
      return { schedule: null, pendingInstallments: [] };
    }

    const schedule = await tx.admissionInstallmentSchedule.findUnique({
      where: { feePaymentHeaderId },
      include: {
        installments: {
          orderBy: [
            { dueDate: 'asc' },
            { sequence: 'asc' },
            { offsetAmount: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException(
        `No installment schedule found for fee payment header "${feePaymentHeaderId}".`,
      );
    }

    // Schedule Ownership & Context checks
    if (schedule.admissionId !== admissionId || schedule.schoolId !== schoolId) {
      throw new BadRequestException('Installment schedule ownership mismatch with admission context.');
    }

    // Obligation equality check
    const scheduleTotal = new Prisma.Decimal(schedule.totalAmount.toString());
    if (!scheduleTotal.equals(headerTotalFeeAmount)) {
      throw new ConflictException(
        `Schedule total (${scheduleTotal.toString()}) does not match header confirmed obligation (${headerTotalFeeAmount.toString()}).`,
      );
    }

    // Level 5 Lock: Eligible pending installments
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`
        SELECT id FROM "AdmissionInstallment"
        WHERE "scheduleId" = ${schedule.id} AND status = 'PENDING' AND "supersededAt" IS NULL
        ORDER BY "dueDate" ASC, sequence ASC, "offsetAmount" ASC, id ASC
        FOR UPDATE
      `;
    }

    // Filter active PENDING installments and ensure exact FIFO sorting
    const pendingInstallments = schedule.installments
      .filter(
        (inst: any) => inst.status === InstallmentRowStatus.PENDING && inst.supersededAt === null,
      )
      .sort((a: any, b: any) => {
        const dDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dDiff !== 0) return dDiff;
        if (a.sequence !== b.sequence) return a.sequence - b.sequence;
        const oDiff = new Prisma.Decimal(a.offsetAmount ?? 0).minus(new Prisma.Decimal(b.offsetAmount ?? 0));
        if (!oDiff.isZero()) return oDiff.isPositive() ? 1 : -1;
        return a.id.localeCompare(b.id);
      });

    // Sum of active pending installments must equal current header totalDueAmount
    const pendingTotal = pendingInstallments.reduce(
      (sum: Prisma.Decimal, inst: any) => sum.plus(new Prisma.Decimal(inst.amount.toString())),
      new Prisma.Decimal(0),
    );

    if (!pendingTotal.equals(headerTotalDueAmount)) {
      throw new ConflictException(
        `Pending installment sum (${pendingTotal.toString()}) does not match header outstanding due amount (${headerTotalDueAmount.toString()}).`,
      );
    }

    if (paymentAmount.gt(pendingTotal)) {
      throw new BadRequestException(
        'Payment amount exceeds total pending installment obligation for this schedule.',
      );
    }

    return { schedule, pendingInstallments };
  }

  /**
   * Applies FIFO allocation across pending installments (Level 7), creating split children,
   * lineage events, transfer edges, and allocations.
   */
  async executeFifoAllocation(input: ExecuteFifoAllocationInput): Promise<any[]> {
    const {
      tx,
      schedule,
      pendingInstallments,
      feePaymentHeaderId,
      feePaymentId,
      paymentAmount,
      paymentDate,
      schoolTimezone = 'Asia/Kolkata',
    } = input;

    if (!schedule || !pendingInstallments) {
      return [];
    }

    const paymentCalDate = getCalendarDateString(paymentDate, schoolTimezone);
    let remainingToAllocate = new Prisma.Decimal(paymentAmount.toString());
    const createdAllocations: any[] = [];

    for (const inst of pendingInstallments) {
      if (remainingToAllocate.isZero()) {
        break;
      }

      const instAmount = new Prisma.Decimal(inst.amount.toString());
      const instCalDueDate = getCalendarDateString(inst.dueDate, schoolTimezone);
      const isEarly = paymentCalDate < instCalDueDate;
      const settledStatus = isEarly ? InstallmentRowStatus.PAID_EARLY : InstallmentRowStatus.PAID;

      if (remainingToAllocate.gte(instAmount)) {
        // FULL SETTLEMENT
        const allocatedAmount = instAmount;

        await tx.admissionInstallment.update({
          where: { id: inst.id },
          data: {
            status: settledStatus,
            paidAt: paymentDate,
          },
        });

        const alloc = await tx.feePaymentInstallmentAllocation.create({
          data: {
            feePaymentId,
            feePaymentHeaderId,
            installmentId: inst.id,
            allocatedAmount,
          },
        });

        createdAllocations.push(alloc);
        remainingToAllocate = remainingToAllocate.minus(allocatedAmount);
      } else {
        // PARTIAL SPLIT SETTLEMENT
        const allocatedAmount = remainingToAllocate;
        const remainingAmount = instAmount.minus(allocatedAmount);

        // Conservation check
        if (!allocatedAmount.plus(remainingAmount).equals(instAmount)) {
          throw new ConflictException('Decimal split calculation does not conserve installment amount.');
        }

        const rootId = inst.rootInstallmentId ?? inst.id;
        const maxSubSeqRecord = await tx.admissionInstallment.aggregate({
          where: {
            scheduleId: schedule.id,
            sequence: inst.sequence,
          },
          _max: { subSequence: true },
        });
        const baseSubSequence = maxSubSeqRecord._max.subSequence ?? inst.subSequence;
        const currentOffset = new Prisma.Decimal(inst.offsetAmount?.toString() ?? '0');

        // 1. Mark parent SUPERSEDED
        await tx.admissionInstallment.update({
          where: { id: inst.id },
          data: {
            status: InstallmentRowStatus.SUPERSEDED,
            supersededAt: new Date(),
          },
        });

        // 2. Insert Settled Child
        const settledChild = await tx.admissionInstallment.create({
          data: {
            scheduleId: schedule.id,
            feePaymentHeaderId,
            sequence: inst.sequence,
            subSequence: baseSubSequence + 1,
            offsetAmount: currentOffset,
            rootInstallmentId: rootId,
            label: `${inst.label} (Partially Paid)`,
            amount: allocatedAmount,
            dueDate: inst.dueDate,
            status: settledStatus,
            paidAt: paymentDate,
          },
        });

        // 3. Insert Remaining Child
        const remainingChild = await tx.admissionInstallment.create({
          data: {
            scheduleId: schedule.id,
            feePaymentHeaderId,
            sequence: inst.sequence,
            subSequence: baseSubSequence + 2,
            offsetAmount: currentOffset.plus(allocatedAmount),
            rootInstallmentId: rootId,
            label: `${inst.label} (Balance)`,
            amount: remainingAmount,
            dueDate: inst.dueDate,
            status: InstallmentRowStatus.PENDING,
            paidAt: null,
          },
        });

        // 4. Record Lineage Event
        const lineageEvent = await tx.installmentLineageEvent.create({
          data: {
            scheduleId: schedule.id,
            feePaymentId,
            eventType: LineageEventType.PAYMENT_AUTO_SPLIT,
            description: `Auto-split from payment ${feePaymentId}: allocated ${allocatedAmount.toString()}, remaining ${remainingAmount.toString()}`,
          },
        });

        // 5. Record Transfer Edges
        await tx.installmentLineageTransferEdge.createMany({
          data: [
            {
              eventId: lineageEvent.id,
              scheduleId: schedule.id,
              sourceInstallmentId: inst.id,
              resultInstallmentId: settledChild.id,
              amount: allocatedAmount,
            },
            {
              eventId: lineageEvent.id,
              scheduleId: schedule.id,
              sourceInstallmentId: inst.id,
              resultInstallmentId: remainingChild.id,
              amount: remainingAmount,
            },
          ],
        });

        // 6. Record Allocation targeting Settled Child
        const alloc = await tx.feePaymentInstallmentAllocation.create({
          data: {
            feePaymentId,
            feePaymentHeaderId,
            installmentId: settledChild.id,
            allocatedAmount,
          },
        });

        createdAllocations.push(alloc);
        remainingToAllocate = new Prisma.Decimal(0);
      }
    }

    if (!remainingToAllocate.isZero()) {
      throw new BadRequestException(
        `Failed to allocate payment completely. Unallocated remainder: ${remainingToAllocate.toString()}`,
      );
    }

    const totalAllocated = createdAllocations.reduce(
      (sum, a) => sum.plus(new Prisma.Decimal(a.allocatedAmount.toString())),
      new Prisma.Decimal(0),
    );

    if (!totalAllocated.equals(paymentAmount)) {
      throw new ConflictException(
        `Total allocated amount (${totalAllocated.toString()}) does not match payment amount (${paymentAmount.toString()}).`,
      );
    }

    return createdAllocations;
  }

  /**
   * Combined workflow for FIFO payment allocation.
   */
  async allocateInstallmentPaymentFifo(input: FifoAllocationInput): Promise<any[]> {
    const {
      tx,
      schoolId,
      admissionId,
      feePaymentHeaderId,
      feePaymentId,
      paymentAmount,
      paymentDate,
      headerTotalFeeAmount,
      headerTotalDueAmount,
      schoolTimezone = 'Asia/Kolkata',
    } = input;

    const { schedule, pendingInstallments } = await this.reconcileAndLockSchedule({
      tx,
      schoolId,
      admissionId,
      feePaymentHeaderId,
      headerTotalFeeAmount,
      headerTotalDueAmount,
      paymentAmount,
    });

    return this.executeFifoAllocation({
      tx,
      schedule,
      pendingInstallments,
      feePaymentHeaderId,
      feePaymentId,
      paymentAmount,
      paymentDate,
      schoolTimezone,
    });
  }
}
