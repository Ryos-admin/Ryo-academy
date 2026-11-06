import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudentService } from './student.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CreateStudentFeePaymentDto } from './dto/create-student-fee-payment.dto.js';

const d = (n: number) => new Prisma.Decimal(String(n));

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
      isActive: true,
      isIncluded: true,
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

const studentWith = (headers: unknown[], status = 'CONFIRMED', payments: unknown[] = []) => ({
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
  feePayments: payments,
});

type Harness = {
  service: StudentService;
  findUnique: jest.Mock;
  detailUpdate: jest.Mock;
  headerUpdate: jest.Mock;
  queryRaw: jest.Mock;
  paymentFindUnique: jest.Mock;
  paymentCreate: jest.Mock;
  attributionCreateMany: jest.Mock;
};

function build(headers: unknown[], status = 'CONFIRMED', payments: unknown[] = []): Harness {
  const findUnique = jest.fn().mockResolvedValue(studentWith(headers, status, payments));
  const actorFindUnique = jest.fn().mockResolvedValue({ schoolId: 'school-1' });
  const detailUpdate = jest.fn().mockResolvedValue({});
  const headerUpdate = jest.fn().mockResolvedValue({});
  const paymentCreate = jest.fn().mockResolvedValue({ id: 'payment-1' });
  const attributionCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const logCreate = jest.fn().mockResolvedValue({});
  const queryRaw = jest.fn().mockResolvedValue([]);
  const paymentFindUnique = jest.fn();
  const tx = {
    user: { findUnique: actorFindUnique },
    student: { findUnique },
    feePaymentDetails: { update: detailUpdate },
    feePaymentHeader: { update: headerUpdate, findUnique: jest.fn().mockResolvedValue(headers[0] ?? null) },
    feePayment: { create: paymentCreate },
    feePaymentDetailAttribution: { createMany: attributionCreateMany },
    financialLog: { create: logCreate },
    $queryRaw: queryRaw,
  };
  const db = {
    student: { findUnique },
    feePayment: { findUnique: paymentFindUnique },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  } as unknown as DatabaseService;
  return { service: new StudentService(db), findUnique, detailUpdate, headerUpdate, queryRaw, paymentFindUnique, paymentCreate, attributionCreateMany };
}

const DTO = (amount: string, idempotencyKey?: string): CreateStudentFeePaymentDto =>
  ({ amount, idempotencyKey: idempotencyKey ?? '00000000-0000-4000-8000-000000000001' }) as CreateStudentFeePaymentDto;

describe('StudentService fee snapshot (BUG-4)', () => {
  it('returns an applicable fee, not null, once a snapshot exists', async () => {
    const h = build([HEADER]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.fee).not.toBeNull();
    expect(result.fee?.totalAmount).toBe('125000');
    expect(result.fee?.outstandingAmount).toBe('125000');
    expect(result.fee?.components.length).toBe(1);
    expect(result.fee?.components[0]).toEqual(
      expect.objectContaining({ isActive: true, isIncluded: true }),
    );
  });

  it('returns excluded snapshots with inclusion state without changing summary totals', async () => {
    const excluded = { ...HEADER.feePaymentDetails[0], id: 'detail-2', isIncluded: false };
    const h = build([{ ...HEADER, feePaymentDetails: [...HEADER.feePaymentDetails, excluded] }]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.fee?.totalAmount).toBe('125000');
    expect(result.fee?.components.find((component) => component.id === 'detail-2')).toEqual(
      expect.objectContaining({ isActive: true, isIncluded: false }),
    );
  });

  it('still reports fee: null when the admission genuinely has no snapshot', async () => {
    const h = build([]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.fee).toBeNull();
    expect(result.payments.length).toBe(0);
  });

  it('returns actual FeePayment events in payments list (H2 fix)', async () => {
    const paymentRecord = {
      id: 'pay-123',
      amount: d(25000),
      paymentDate: new Date('2026-11-01'),
      createdAt: new Date('2026-11-01T10:00:00Z'),
      idempotencyKey: 'idem-key-1',
      studentId: 'stu-1',
      user: {
        id: 'user-admin',
        firstName: 'Office',
        lastName: 'Admin',
        email: 'admin@ryo.local',
      },
    };
    const h = build([HEADER], 'CONFIRMED', [paymentRecord]);
    const result = await h.service.getStudentFees('stu-1');
    expect(result.payments.length).toBe(1);
    expect(result.payments[0]).toEqual(
      expect.objectContaining({
        id: 'pay-123',
        amount: '25000',
        idempotencyKey: 'idem-key-1',
        studentId: 'stu-1',
        actor: {
          id: 'user-admin',
          name: 'Office Admin',
          email: 'admin@ryo.local',
        },
      }),
    );
  });

  it('404s a missing student', async () => {
    const h = build([HEADER]);
    h.findUnique.mockResolvedValue(null);
    await expect(h.service.getStudentFees('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudentService.recordStudentFeePayment', () => {
  it('rejects a missing client idempotency key before financial writes', async () => {
    const h = build([HEADER]);
    await expect(h.service.recordStudentFeePayment('stu-1', { amount: '100.00' } as CreateStudentFeePaymentDto, 'actor-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(h.paymentCreate).not.toHaveBeenCalled();
    expect(h.detailUpdate).not.toHaveBeenCalled();
    expect(h.headerUpdate).not.toHaveBeenCalled();
  });

  it('records a valid payment and updates the header balance', async () => {
    const h = build([HEADER]);
    await h.service.recordStudentFeePayment('stu-1', DTO("50000.00"), 'actor-1');
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
    await h.service.recordStudentFeePayment('stu-1', DTO("50000.00"), 'actor-1');
    const [call] = h.detailUpdate.mock.calls;
    expect(call[0].where).toEqual({ id: 'detail-1' });
  });

  it('persists exact attribution for the eligible allocation', async () => {
    const h = build([HEADER]);
    await h.service.recordStudentFeePayment('stu-1', DTO('50000.00'), 'actor-1');
    expect(h.attributionCreateMany).toHaveBeenCalledWith({
      data: [{
        feePaymentId: 'payment-1',
        feePaymentDetailsId: 'detail-1',
        feePaymentHeaderId: 'header-1',
        amount: d(50000),
      }],
    });
  });

  it('allocates only to active included details', async () => {
    const excluded = { ...HEADER.feePaymentDetails[0], id: 'detail-excluded', isIncluded: false, isMandatory: false, originalAmount: d(10000), totalAmountToBePaid: d(10000), finalAmount: d(10000) };
    const inactive = { ...HEADER.feePaymentDetails[0], id: 'detail-inactive', isActive: false, isIncluded: true, isMandatory: false, originalAmount: d(10000), totalAmountToBePaid: d(10000), finalAmount: d(10000) };
    const h = build([{ ...HEADER, feePaymentDetails: [...HEADER.feePaymentDetails, excluded, inactive] }]);
    await h.service.recordStudentFeePayment('stu-1', DTO('50000.00'), 'actor-1');
    expect(h.detailUpdate).toHaveBeenCalledTimes(1);
    expect(h.detailUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'detail-1' } }));
    expect(h.detailUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'detail-excluded' } }));
    expect(h.detailUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'detail-inactive' } }));
  });

  it('still rejects a payment when no snapshot exists (pre-BUG-4 state)', async () => {
    const h = build([]);
    await expect(h.service.recordStudentFeePayment('stu-1', DTO("100.00"), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-positive payment input', async () => {
    const h = build([HEADER]);
    await expect(h.service.recordStudentFeePayment('stu-1', DTO("0.00"), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment larger than the outstanding balance', async () => {
    const h = build([HEADER]);
    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO("999999.00"), 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payment for a cancelled admission', async () => {
    const h = build([HEADER], 'CANCELLED');
    await expect(h.service.recordStudentFeePayment('stu-1', DTO("100.00"), 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment that cannot be fully allocated across components', async () => {
    // Header owes 125000 but components only cover 90000.
    const h = build([HEADER]);
    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO("100000.00"), 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acquires database row-level lock on the fee payment header (C2 concurrency protection)', async () => {
    const h = build([HEADER]);
    await h.service.recordStudentFeePayment('stu-1', DTO("50000.00"), 'actor-1');
    expect(h.queryRaw).toHaveBeenCalled();
  });

  it('safely replays payment when duplicate idempotency key is submitted for same student and amount (H1 fix)', async () => {
    const h = build([HEADER]);
    // Simulate concurrent race: pre-check finds nothing, payment creation hits P2002, catch re-reads winner
    h.paymentFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        studentId: 'stu-1',
        amount: d(50000),
      });
    h.paymentCreate.mockRejectedValueOnce({ code: 'P2002' });

    const result = await h.service.recordStudentFeePayment('stu-1', DTO("50000.00", 'same-key'), 'actor-1');
    expect(result).toBeDefined();
    expect(h.paymentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'same-key' },
      }),
    );
  });

  it('safely replays payment on initial lookup outside transaction before payment creation', async () => {
    const h = build([HEADER]);
    h.paymentFindUnique.mockResolvedValueOnce({
      studentId: 'stu-1',
      amount: d(50000),
    });

    const result = await h.service.recordStudentFeePayment('stu-1', DTO("50000.00", 'cached-key'), 'actor-1');
    expect(result).toBeDefined();
    expect(h.paymentCreate).not.toHaveBeenCalled();
  });

  it('throws ConflictException when duplicate idempotency key is reused for a different amount (H1)', async () => {
    const h = build([HEADER]);
    h.paymentFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        studentId: 'stu-1',
        amount: d(30000), // different amount
      });
    h.paymentCreate.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO("50000.00", 'same-key'), 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when duplicate idempotency key is reused for a different student (H1)', async () => {
    const h = build([HEADER]);
    h.paymentFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        studentId: 'other-stu', // different student
        amount: d(50000),
      });
    h.paymentCreate.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      h.service.recordStudentFeePayment('stu-1', DTO("50000.00", 'same-key'), 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
