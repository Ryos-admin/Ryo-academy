import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentService } from './student.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { CreateStudentFeePaymentDto } from './dto/create-student-fee-payment.dto.js';

const d = (n: number) => ({ toString: () => String(n) });

const HEADER = {
  id: 'header-1',
  academicYearId: 'year-1',
  feeStructureId: 'fs-1',
  totalFeeAmount: d(125000),
  totalPaidAmount: d(0),
  totalDueAmount: d(125000),
  feePaymentDetails: [
    {
      id: 'detail-1',
      feeComponentId: 'fc-1',
      nameSnapshot: 'Tuition Fee',
      originalAmount: d(90000),
      discountApplicable: false,
      isMandatory: true,
      discountAmount: d(0),
      finalAmount: d(90000),
      totalAmountToBePaid: d(90000),
      amountPaid: d(0),
      paymentDate: null,
    },
  ],
};

const studentWith = (headers: unknown[], status = 'CONFIRMED') => ({
  id: 'stu-1',
  studentNumber: 'STU-1',
  studentName: 'Student One',
  admission: {
    id: 'adm-1',
    schoolId: 'school-1',
    admissionNumber: 'ADM-1',
    admissionStatus: status,
    feePaymentHeaders: headers,
  },
});

type Harness = {
  service: StudentService;
  findUnique: jest.Mock;
  detailUpdate: jest.Mock;
  headerUpdate: jest.Mock;
};

function build(headers: unknown[], status = 'CONFIRMED'): Harness {
  const findUnique = jest.fn().mockResolvedValue(studentWith(headers, status));
  const actorFindUnique = jest.fn().mockResolvedValue({ schoolId: 'school-1' });
  const detailUpdate = jest.fn().mockResolvedValue({});
  const headerUpdate = jest.fn().mockResolvedValue({});
  const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1' });
  const logCreate = jest.fn().mockResolvedValue({});
  const tx = {
    user: { findUnique: actorFindUnique },
    student: { findUnique },
    feePaymentDetails: { update: detailUpdate },
    feePaymentHeader: { update: headerUpdate },
    feePayment: { create: paymentCreate },
    financialLog: { create: logCreate },
  };
  const db = {
    student: { findUnique },
    feePayment: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  } as unknown as DatabaseService;
  return { service: new StudentService(db), findUnique, detailUpdate, headerUpdate };
}

const DTO = (amount: number): CreateStudentFeePaymentDto => ({ amount }) as CreateStudentFeePaymentDto;

describe('StudentService fee snapshot (BUG-4)', () => {
  it('returns an applicable fee, not null, once a snapshot exists', async () => {
    const h = build([HEADER]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.fee).not.toBeNull();
    expect(result.fee?.totalAmount).toBe(125000);
    expect(result.fee?.outstandingAmount).toBe(125000);
    expect(result.fee?.components.length).toBe(1);
  });

  it('still reports fee: null when the admission genuinely has no snapshot', async () => {
    const h = build([]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.fee).toBeNull();
    expect(result.payments.length).toBe(0);
  });

  it('404s a missing student', async () => {
    const h = build([HEADER]);
    h.findUnique.mockResolvedValue(null);
    await expect(h.service.getStudentFees('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentService.recordStudentFeePayment', () => {
  it('records a valid payment and updates the header balance', async () => {
    const h = build([HEADER]);
    await h.service.recordStudentFeePayment('stu-1', DTO(50000), 'actor-1');
    expect(h.detailUpdate).toHaveBeenCalled();
    expect(h.headerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'header-1' },
        data: expect.objectContaining({ totalPaidAmount: expect.anything() }),
      }),
    );
  });

  it('allocates the payment across the fee components', async () => {
    const h = build([HEADER]);
    await h.service.recordStudentFeePayment('stu-1', DTO(50000), 'actor-1');
    const [call] = h.detailUpdate.mock.calls;
    expect(call[0].where).toEqual({ id: 'detail-1' });
  });

  it('still rejects a payment when no snapshot exists (pre-BUG-4 state)', async () => {
    const h = build([]);
    await expect(h.service.recordStudentFeePayment('stu-1', DTO(100), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-positive payment input', async () => {
    const h = build([HEADER]);
    await expect(h.service.recordStudentFeePayment('stu-1', DTO(0), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment larger than the outstanding balance', async () => {
    const h = build([HEADER]);
    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO(999999), 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payment for a cancelled admission', async () => {
    const h = build([HEADER], 'CANCELLED');
    await expect(h.service.recordStudentFeePayment('stu-1', DTO(100), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment that cannot be fully allocated across components', async () => {
    // Header owes 125000 but components only cover 90000.
    const h = build([HEADER]);
    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO(100000), 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
