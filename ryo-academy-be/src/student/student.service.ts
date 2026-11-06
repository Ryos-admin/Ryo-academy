import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateStudentFeePaymentDto } from './dto/create-student-fee-payment.dto.js';
import {
  InstallmentAllocationService,
  getCalendarDateString,
} from '../admission/installment/installment-allocation.service.js';
import { parseMoney, serializeMoney } from '../common/money/money.util.js';

const studentRelations = {
  admission: {
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      programId: true,
      classId: true,
      sectionId: true,
    },
  },
} as const;

@Injectable()
export class StudentService {
  private readonly allocationService: InstallmentAllocationService;

  constructor(
    private readonly databaseService: DatabaseService,
    allocationService?: InstallmentAllocationService,
  ) {
    this.allocationService = allocationService ?? new InstallmentAllocationService();
  }

  async findAll() {
    return this.databaseService.student.findMany({
      where: { isActive: true, deletedAt: null },
      include: studentRelations,
      orderBy: [{ studentName: 'asc' }, { studentNumber: 'asc' }],
    });
  }

  async findById(id: string) {
    const student = await this.databaseService.student.findUnique({
      where: { id, isActive: true },
      include: studentRelations,
    });

    if (!student) {
      throw new NotFoundException(`Student with id "${id}" not found`);
    }

    return student;
  }

  async getStudentFees(studentId: string) {
    const student = await this.databaseService.student.findUnique({
      where: { id: studentId, isActive: true, deletedAt: null },
      include: {
        admission: {
          include: {
            feePaymentHeaders: {
              orderBy: { createdAt: 'desc' },
              include: {
                feePaymentDetails: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
        feePayments: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student with id "${studentId}" not found`);
    }

    if (!student.admission) {
      throw new NotFoundException(
        `Student with id "${studentId}" does not have an admission record`,
      );
    }

    const feeHeader = student.admission.feePaymentHeaders[0] ?? null;

    return {
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        studentName: student.studentName,
      },
      admission: {
        id: student.admission.id,
        admissionNumber: student.admission.admissionNumber,
        admissionStatus: student.admission.admissionStatus,
      },
      fee: feeHeader
        ? {
            id: feeHeader.id,
            academicYearId: feeHeader.academicYearId,
            feeStructureId: feeHeader.feeStructureId,
            totalAmount: serializeMoney(feeHeader.totalFeeAmount),
            paidAmount: serializeMoney(feeHeader.totalPaidAmount),
            outstandingAmount: serializeMoney(
              new Prisma.Decimal(feeHeader.totalFeeAmount.toString()).minus(
                new Prisma.Decimal(feeHeader.totalPaidAmount.toString()),
              ),
            ),
            components: feeHeader.feePaymentDetails.map((detail) => ({
              id: detail.id,
              feeComponentId: detail.feeComponentId,
              nameSnapshot: detail.nameSnapshot,
              isActive: detail.isActive,
              isIncluded: detail.isIncluded,
              originalAmount: serializeMoney(detail.originalAmount),
              discountApplicable: detail.discountApplicable,
              isMandatory: detail.isMandatory,
              discountAmount: serializeMoney(detail.discountAmount),
              finalAmount: serializeMoney(detail.finalAmount),
              totalAmountToBePaid: serializeMoney(detail.totalAmountToBePaid),
              amountPaid: serializeMoney(detail.amountPaid),
              amountOutstanding: serializeMoney(
                new Prisma.Decimal(detail.totalAmountToBePaid.toString()).minus(
                  new Prisma.Decimal(detail.amountPaid.toString()),
                ),
              ),
              paymentDate: detail.paymentDate,
            })),
          }
        : null,
      payments: (student.feePayments || []).map((payment) => ({
        id: payment.id,
        paymentDate: payment.paymentDate,
        amount: serializeMoney(payment.amount),
        createdAt: payment.createdAt,
        idempotencyKey: payment.idempotencyKey,
        studentId: payment.studentId,
        actor: payment.user
          ? {
              id: payment.user.id,
              name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
              email: payment.user.email,
            }
          : null,
      })),
    };
  }

  async recordStudentFeePayment(
    studentId: string,
    dto: CreateStudentFeePaymentDto,
    actorUserId: string,
  ) {
    if (!dto.idempotencyKey || typeof dto.idempotencyKey !== 'string' || !dto.idempotencyKey.trim()) {
      throw new BadRequestException('Payment idempotencyKey is required and must be a UUID.');
    }
    if (dto.amount === undefined || dto.amount === null) {
      throw new BadRequestException('Payment amount is required.');
    }

    const amount = parseMoney(dto.amount, 'Payment amount');
    if (amount.lte(new Prisma.Decimal(0))) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const isDateProvided = Boolean(dto.paymentDate);
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Payment date must be a valid ISO date string.');
    }

    const idempotencyKey = dto.idempotencyKey;

    // Idempotency pre-check outside transaction
    if (dto.idempotencyKey) {
      const existing = await this.databaseService.feePayment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        this.validateIdempotencyReplay(
          existing,
          studentId,
          dto.feePaymentHeaderId,
          amount,
          isDateProvided,
          paymentDate,
        );
        return this.getStudentFees(studentId);
      }
    }

    try {
      return await this.databaseService.$transaction(async (tx) => {
        const actor = await tx.user.findUnique({
          where: { id: actorUserId },
          select: { schoolId: true },
        });
        if (!actor?.schoolId) {
          throw new ForbiddenException('A school-scoped user is required');
        }

        const student = await tx.student.findUnique({
          where: { id: studentId },
          include: {
            admission: {
              include: {
                feePaymentHeaders: {
                  orderBy: { createdAt: 'desc' },
                  include: {
                    feePaymentDetails: {
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
              },
            },
          },
        });

        if (!student) {
          throw new NotFoundException(`Student with id "${studentId}" not found`);
        }

        if (!student.admission) {
          throw new BadRequestException(
            `Student with id "${studentId}" does not have an admission record`,
          );
        }

        if (student.admission.schoolId !== actor.schoolId) {
          throw new NotFoundException(`Student with id "${studentId}" not found`);
        }

        // Level 1 Lock: Admission row
        await this.lockAdmission(tx, student.admission.id);

        if (student.admission.admissionStatus === 'CANCELLED') {
          throw new BadRequestException(
            'Payment recording is not allowed for cancelled admissions.',
          );
        }

        if (student.admission.admissionStatus !== 'CONFIRMED') {
          throw new BadRequestException(
            'Payment recording is not allowed for unconfirmed admissions.',
          );
        }

        // Re-read active headers under Admission lock
        const activeHeaders: any[] =
          typeof tx.feePaymentHeader.findMany === 'function'
            ? await tx.feePaymentHeader.findMany({
                where: { admissionId: student.admission.id, isActive: true },
                orderBy: { createdAt: 'asc' },
              })
            : (student.admission.feePaymentHeaders as any[] ?? []);

        let targetHeader: any = null;
        if (dto.feePaymentHeaderId) {
          targetHeader = activeHeaders.find((h) => h.id === dto.feePaymentHeaderId);
          if (!targetHeader) {
            throw new BadRequestException('Fee payment header not found or not active for this admission.');
          }
        } else {
          if (activeHeaders.length === 1) {
            targetHeader = activeHeaders[0];
          } else if (activeHeaders.length > 1) {
            throw new BadRequestException(
              'Multiple active fee headers exist for this admission. Explicit feePaymentHeaderId is required.',
            );
          } else {
            throw new BadRequestException(
              `Student with id "${studentId}" does not have an applicable fee snapshot.`,
            );
          }
        }

        // Level 2 Lock: FeePaymentHeader
        await this.lockFeePaymentHeader(tx, targetHeader.id);

        // Re-fetch header with details inside transaction
        const freshHeader =
          (await tx.feePaymentHeader.findUnique?.({
            where: { id: targetHeader.id },
            include: {
              feePaymentDetails: {
                orderBy: { createdAt: 'asc' },
              },
            },
          })) ?? targetHeader;

        const totalFeeAmount = new Prisma.Decimal(freshHeader.totalFeeAmount.toString());
        const totalPaidAmount = new Prisma.Decimal(freshHeader.totalPaidAmount.toString());
        const totalDueAmount = new Prisma.Decimal(freshHeader.totalDueAmount.toString());
        const netAmount = freshHeader.netAmount
          ? new Prisma.Decimal(freshHeader.netAmount.toString())
          : totalFeeAmount;

        // Canonical financial invariants check
        if (!totalFeeAmount.equals(netAmount)) {
          throw new ConflictException(
            `Financial header imbalance: totalFeeAmount (${totalFeeAmount.toString()}) does not match netAmount (${netAmount.toString()}).`,
          );
        }

        const currentOutstanding = totalFeeAmount.minus(totalPaidAmount);
        if (!totalDueAmount.equals(currentOutstanding)) {
          throw new ConflictException(
            `Financial header imbalance: totalDueAmount (${totalDueAmount.toString()}) does not match calculated balance (${currentOutstanding.toString()}).`,
          );
        }

        if (currentOutstanding.lte(new Prisma.Decimal(0))) {
          throw new BadRequestException(
            'This admission already has no outstanding balance.',
          );
        }

        if (amount.gt(currentOutstanding)) {
          throw new BadRequestException(
            'Payment amount exceeds the outstanding balance for this admission.',
          );
        }

        // Level 3 Lock: FeePaymentDetails
        await this.lockFeePaymentDetails(tx, freshHeader.id);

        // Level 4 & 5 Locks: Reconcile and Lock Schedule and Installments before payment creation
        const { schedule, pendingInstallments } = await this.allocationService.reconcileAndLockSchedule({
          tx,
          schoolId: actor.schoolId,
          admissionId: student.admission.id,
          feePaymentHeaderId: freshHeader.id,
          headerTotalFeeAmount: totalFeeAmount,
          headerTotalDueAmount: totalDueAmount,
          paymentAmount: amount,
        });

        // Level 6: Record FeePayment
        const payment = await tx.feePayment.create({
          data: {
            idempotencyKey,
            schoolId: actor.schoolId,
            userId: actorUserId,
            studentId: student.id,
            admissionId: student.admission.id,
            feePaymentHeaderId: freshHeader.id,
            amount,
            paymentDate,
          },
        });

        // Level 7: Execute FIFO Installment Allocation & Lineage
        await this.allocationService.executeFifoAllocation({
          tx,
          schedule,
          pendingInstallments,
          feePaymentHeaderId: freshHeader.id,
          feePaymentId: payment.id,
          paymentAmount: amount,
          paymentDate,
          schoolTimezone: 'Asia/Kolkata',
        });

        // Component Attribution (FeePaymentDetails aggregate updates)
        let remaining = amount;
        const zero = new Prisma.Decimal(0);
        const detailAllocations: Array<{ detailId: string; amount: Prisma.Decimal }> = [];

        for (const detail of freshHeader.feePaymentDetails.filter(
          (candidate: any) => candidate.isActive === true && candidate.isIncluded === true,
        )) {
          if (remaining.lte(zero)) {
            break;
          }

          const amountAlreadyPaid = new Prisma.Decimal(detail.amountPaid.toString());
          const totalAmountToBePaid = new Prisma.Decimal(
            detail.totalAmountToBePaid.toString(),
          );
          const remainingForDetail = totalAmountToBePaid.minus(amountAlreadyPaid);

          if (remainingForDetail.lte(zero)) {
            continue;
          }

          const allocatedAmount =
            remaining.lte(remainingForDetail) ? remaining : remainingForDetail;

          await tx.feePaymentDetails.update({
            where: { id: detail.id },
            data: {
              amountPaid: amountAlreadyPaid.plus(allocatedAmount),
              paymentDate,
            },
          });
          detailAllocations.push({ detailId: detail.id, amount: allocatedAmount });

          remaining = remaining.minus(allocatedAmount);
        }

        if (remaining.gt(zero)) {
          throw new BadRequestException(
            'Unable to allocate the payment across the fee components.',
          );
        }

        const attributionTotal = detailAllocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          zero,
        );
        if (detailAllocations.length === 0 || !attributionTotal.equals(amount)) {
          throw new ConflictException('Payment detail attribution does not reconcile to the payment amount.');
        }
        await tx.feePaymentDetailAttribution.createMany({
          data: detailAllocations.map(({ detailId, amount: allocatedAmount }) => ({
            feePaymentId: payment.id,
            feePaymentDetailsId: detailId,
            feePaymentHeaderId: freshHeader.id,
            amount: allocatedAmount,
          })),
        });

        const nextPaidAmount = totalPaidAmount.plus(amount);

        await tx.feePaymentHeader.update({
          where: { id: freshHeader.id },
          data: {
            totalPaidAmount: nextPaidAmount,
            totalDueAmount: totalFeeAmount.minus(nextPaidAmount),
          },
        });

        await this.createFinancialLog(tx, {
          data: {
            schoolId: actor.schoolId,
            userId: actorUserId,
            type: 'FEE_PAYMENT',
            flowType: 'INCOME',
            amount,
            occurredAt: paymentDate,
            description: `Fee payment for admission ${student.admission.admissionNumber}`,
            sourceType: 'FEE_PAYMENT',
            sourceId: payment.id,
          },
        });

        return this.getStudentFees(studentId);
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.databaseService.feePayment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
          this.validateIdempotencyReplay(
            existing,
            studentId,
            dto.feePaymentHeaderId,
            amount,
            isDateProvided,
            paymentDate,
          );
          return this.getStudentFees(studentId);
        }
      }
      throw error;
    }
  }

  private validateIdempotencyReplay(
    existing: any,
    studentId: string,
    requestedHeaderId: string | undefined,
    amount: Prisma.Decimal,
    isDateProvided: boolean,
    paymentDate: Date,
  ) {
    if (existing.studentId !== studentId) {
      throw new ConflictException('The idempotency key was already used for a different payment.');
    }

    if (!new Prisma.Decimal(existing.amount.toString()).equals(amount)) {
      throw new ConflictException('The idempotency key was already used for a different payment.');
    }

    if (requestedHeaderId && existing.feePaymentHeaderId !== requestedHeaderId) {
      throw new ConflictException('The idempotency key was already used for a different payment.');
    }

    if (existing.paymentDate && existing.createdAt) {
      const existingWasServerGenerated =
        Math.abs(existing.paymentDate.getTime() - existing.createdAt.getTime()) < 5000;
      if (isDateProvided && existingWasServerGenerated) {
        throw new ConflictException('The idempotency key was already used for a different payment.');
      }
      if (!isDateProvided && !existingWasServerGenerated) {
        throw new ConflictException('The idempotency key was already used for a different payment.');
      }
      if (isDateProvided) {
        const existingDateStr = getCalendarDateString(existing.paymentDate);
        const incomingDateStr = getCalendarDateString(paymentDate);
        if (existingDateStr !== incomingDateStr) {
          throw new ConflictException('The idempotency key was already used for a different payment.');
        }
      }
    }
  }

  protected async lockAdmission(tx: any, admissionId: string): Promise<void> {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id, "admissionStatus", "schoolId" FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
    }
  }

  protected async lockFeePaymentHeader(tx: any, headerId: string): Promise<void> {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "FeePaymentHeader" WHERE id = ${headerId} FOR UPDATE`;
    }
  }

  protected async lockFeePaymentDetails(tx: any, headerId: string): Promise<void> {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "FeePaymentDetails" WHERE "feePaymentHeaderId" = ${headerId} ORDER BY id ASC FOR UPDATE`;
    }
  }

  protected createFinancialLog(tx: any, data: any) {
    return tx.financialLog.create(data);
  }

}
