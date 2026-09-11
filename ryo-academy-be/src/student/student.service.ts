import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import { CreateStudentFeePaymentDto } from './dto/create-student-fee-payment.dto.js';

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
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    return this.databaseService.student.findMany({
      include: studentRelations,
      orderBy: [{ studentName: 'asc' }, { studentNumber: 'asc' }],
    });
  }

  async findById(id: string) {
    const student = await this.databaseService.student.findUnique({
      where: { id },
      include: studentRelations,
    });

    if (!student) {
      throw new NotFoundException(`Student with id "${id}" not found`);
    }

    return student;
  }

  async getStudentFees(studentId: string) {
    const student = await this.databaseService.student.findUnique({
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
            totalAmount: this.toNumber(feeHeader.totalFeeAmount),
            paidAmount: this.toNumber(feeHeader.totalPaidAmount),
            outstandingAmount: this.toNumber(
              new Prisma.Decimal(feeHeader.totalFeeAmount.toString()).minus(
                new Prisma.Decimal(feeHeader.totalPaidAmount.toString()),
              ),
            ),
            components: feeHeader.feePaymentDetails.map((detail) => ({
              id: detail.id,
              feeComponentId: detail.feeComponentId,
              nameSnapshot: detail.nameSnapshot,
              originalAmount: this.toNumber(detail.originalAmount),
              discountApplicable: detail.discountApplicable,
              isMandatory: detail.isMandatory,
              discountAmount: this.toNumber(detail.discountAmount),
              finalAmount: this.toNumber(detail.finalAmount),
              totalAmountToBePaid: this.toNumber(detail.totalAmountToBePaid),
              amountPaid: this.toNumber(detail.amountPaid),
              amountOutstanding: this.toNumber(
                new Prisma.Decimal(detail.totalAmountToBePaid.toString()).minus(
                  new Prisma.Decimal(detail.amountPaid.toString()),
                ),
              ),
              paymentDate: detail.paymentDate,
            })),
          }
        : null,
      payments: feeHeader
        ? feeHeader.feePaymentDetails
            .filter((detail) => this.toNumber(detail.amountPaid) > 0)
            .map((detail) => ({
              id: detail.id,
              paymentDate: detail.paymentDate,
              amount: this.toNumber(detail.amountPaid),
              createdAt: detail.createdAt,
            }))
        : [],
    };
  }

  async recordStudentFeePayment(
    studentId: string,
    dto: CreateStudentFeePaymentDto,
  ) {
    const amount = new Prisma.Decimal(dto.amount.toString());

    if (!dto.amount || amount.lte(new Prisma.Decimal(0))) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Payment date must be a valid ISO date string.');
    }

    return this.databaseService.$transaction(async (tx) => {
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

      if (student.admission.admissionStatus === 'CANCELLED') {
        throw new BadRequestException(
          'Payment recording is not allowed for cancelled admissions.',
        );
      }

      const feeHeader = student.admission.feePaymentHeaders[0] ?? null;

      if (!feeHeader) {
        throw new BadRequestException(
          `Student with id "${studentId}" does not have an applicable fee snapshot.`,
        );
      }

      const totalFeeAmount = new Prisma.Decimal(
        feeHeader.totalFeeAmount.toString(),
      );
      const totalPaidAmount = new Prisma.Decimal(
        feeHeader.totalPaidAmount.toString(),
      );
      const currentOutstanding = totalFeeAmount.minus(totalPaidAmount);

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

      let remaining = amount;
      const zero = new Prisma.Decimal(0);

      for (const detail of feeHeader.feePaymentDetails) {
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

        remaining = remaining.minus(allocatedAmount);
      }

      if (remaining.gt(zero)) {
        throw new BadRequestException(
          'Unable to allocate the payment across the fee components.',
        );
      }

      const nextPaidAmount = totalPaidAmount.plus(amount);

      await tx.feePaymentHeader.update({
        where: { id: feeHeader.id },
        data: {
          totalPaidAmount: nextPaidAmount,
          totalDueAmount: totalFeeAmount.minus(nextPaidAmount),
        },
      });

      return this.getStudentFees(studentId);
    });
  }

  private toNumber(value: Prisma.Decimal | number | string): number {
    return Number(new Prisma.Decimal(value.toString()));
  }
}
