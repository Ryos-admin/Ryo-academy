import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { AdmissionService } from './admission.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { DiscountCalculator } from '../fee-concession/discount-calculator.js';

const d = (value: string | number) => new Prisma.Decimal(value);

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'detail-1',
    isActive: true,
    isIncluded: true,
    originalAmount: d('100.00'),
    discountAmount: d('0.00'),
    finalAmount: d('100.00'),
    totalAmountToBePaid: d('100.00'),
    amountPaid: d('0.00'),
    discountApplicable: true,
    nameSnapshot: 'Tuition',
    concession: null,
    ...overrides,
  };
}

function header(details: any[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'header-1',
    grossAmount: d('100.00'),
    discountAmount: d('0.00'),
    netAmount: d('100.00'),
    totalFeeAmount: d('100.00'),
    totalPaidAmount: d('0.00'),
    totalDueAmount: d('100.00'),
    feePaymentDetails: details,
    payments: [],
    installmentAllocations: [],
    ...overrides,
  };
}

function setup(headers: any[]) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    admission: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'admission-1', admissionStatus: 'DRAFT', admissionSequence: 1,
        admissionNumber: 'ADM-1', studentName: 'Student', dateOfBirth: new Date(), gender: 'OTHER',
        schoolId: 'school-1', isActive: true, deletedAt: null,
      }),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'admission-1', admissionSequence: 1, admissionNumber: 'ADM-1',
        studentName: 'Student', dateOfBirth: new Date(), gender: 'OTHER',
        schoolId: 'school-1', isActive: true, deletedAt: null, ...data,
      })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admission-1' }),
    },
    student: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'stu-1' }) },
    feePaymentHeader: {
      findMany: jest.fn().mockResolvedValue(headers),
      update: jest.fn(),
    },
    feePaymentDetails: { update: jest.fn() },
    admissionFeeConcession: { update: jest.fn() },
  };
  const schedule = { confirmAdmissionSchedules: jest.fn().mockResolvedValue(undefined) };
  const database = {
    $transaction: jest.fn((callback) => callback(tx)),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'actor-1', schoolId: 'school-1' }),
    },
  };
  const service = new AdmissionService(
    database as any,
    {} as AdmissionRepository,
    schedule as any,
  );
  return { service, tx, schedule, database };
}

describe('admission confirmation financial snapshot validation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aggregates only active included detail rows and never updates fee snapshot amounts', async () => {
    const h = header([
      detail({ amountPaid: d(40) }),
      detail({
        id: 'excluded', isIncluded: false, originalAmount: d(500),
        concession: { calculationMode: 'LEGACY_PERCENTAGE', discountType: 'PERCENTAGE', discountValue: d(10), calculatedDiscountAmount: d(50), requiresReview: false },
      }),
      detail({ id: 'inactive', isActive: false, originalAmount: d(700) }),
    ], {
      totalPaidAmount: d(40),
      totalDueAmount: d(60),
      payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
    });
    const { service, tx, schedule } = setup([h]);
    const legacy = jest.spyOn(DiscountCalculator, 'calculate');
    await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
    expect(schedule.confirmAdmissionSchedules).toHaveBeenCalledWith(
      tx,
      'admission-1',
      'actor-1',
      new Map([['header-1', d(100)]]),
    );
    expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
  });

  it('validates PAYABLE concessions without invoking the legacy calculator', async () => {
    const legacy = jest.spyOn(DiscountCalculator, 'calculate');
    const h = header([detail({
      discountAmount: d(20), finalAmount: d(80), totalAmountToBePaid: d(80),
      amountPaid: d(40),
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(20) },
    })], {
      grossAmount: d(100), discountAmount: d(20), netAmount: d(80), totalFeeAmount: d(80),
      totalPaidAmount: d(40), totalDueAmount: d(40),
      payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
    });
    const { service } = setup([h]);
    await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
    expect(legacy).not.toHaveBeenCalled();
  });

  it('confirms zero net without adding an installment obligation', async () => {
    const h1 = header([detail({
      discountAmount: d(100), finalAmount: d(0), totalAmountToBePaid: d(0),
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(100) },
    })], { id: 'header-1', discountAmount: d(100), netAmount: d(0), totalFeeAmount: d(0), totalDueAmount: d(0) });
    const h2 = header([detail({
      id: 'detail-2', originalAmount: d(50), finalAmount: d(50), totalAmountToBePaid: d(50), amountPaid: d(50),
    })], {
      id: 'header-2', grossAmount: d(50), discountAmount: d(0), netAmount: d(50), totalFeeAmount: d(50),
      totalPaidAmount: d(50), totalDueAmount: d(0),
      payments: [{ id: 'payment-2', admissionId: 'admission-1', feePaymentHeaderId: 'header-2', amount: d(50) }],
    });
    const { service, schedule } = setup([h1, h2]);
    await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
    expect(schedule.confirmAdmissionSchedules).toHaveBeenCalledWith(
      expect.anything(), 'admission-1', 'actor-1', new Map([['header-1', d(0)], ['header-2', d(50)]]),
    );
  });

  it.each([
    ['LEGACY_PERCENTAGE', 'PERCENTAGE'],
    ['LEGACY_FIXED', 'FIXED'],
  ])('validates a consistent %s concession through its matching legacy calculation', async (mode, type) => {
    const legacy = jest.spyOn(DiscountCalculator, 'calculate');
    const h = header([detail({
      discountAmount: d(20), finalAmount: d(80), totalAmountToBePaid: d(80),
      amountPaid: d(40),
      concession: {
        calculationMode: mode, discountType: type, discountValue: d(20),
        calculatedDiscountAmount: d(20), requiresReview: false,
      },
    })], {
      grossAmount: d(100), discountAmount: d(20), netAmount: d(80), totalFeeAmount: d(80),
      totalPaidAmount: d(40), totalDueAmount: d(40),
      payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
    });
    const { service } = setup([h]);
    await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent PAYABLE discount and compatibility mirror values', async () => {
    const h = header([detail({
      discountAmount: d(19), finalAmount: d(80), totalAmountToBePaid: d(80),
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(20) },
    })], { grossAmount: d(100), discountAmount: d(19), netAmount: d(81), totalFeeAmount: d(81), totalDueAmount: d(81) });
    const { service, tx } = setup([h]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it.each(['-1.00', '101.00'])('rejects PAYABLE value %s outside original amount bounds', async (payable) => {
    const p = d(payable);
    const h = header([detail({
      discountAmount: d(0), finalAmount: p, totalAmountToBePaid: p,
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(0) },
    })]);
    const { service, tx } = setup([h]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('rejects a legacy mismatch without changing stored detail or concession values', async () => {
    const h = header([detail({
      discountAmount: d(19), finalAmount: d(81), totalAmountToBePaid: d(81),
      concession: {
        calculationMode: 'LEGACY_PERCENTAGE', discountType: 'PERCENTAGE',
        discountValue: d(20), calculatedDiscountAmount: d(19), requiresReview: false,
      },
    })], { discountAmount: d(19), netAmount: d(81), totalFeeAmount: d(81), totalDueAmount: d(81) });
    const { service, tx } = setup([h]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
  });

  it('rejects inconsistent snapshots before writing admission or creating a student', async () => {
    const { service, tx } = setup([header([detail({ totalAmountToBePaid: d(99) })])]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
  });

  it('blocks review-required concessions without mutating them', async () => {
    const { service, tx } = setup([header([detail({
      concession: { calculationMode: 'PAYABLE', requiresReview: true, calculatedDiscountAmount: d(0) },
    })])]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_REVIEW_REQUIRED' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
  });

  it('rejects when no active included details exist', async () => {
    const { service, tx } = setup([header([detail({ isIncluded: false })])]);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_INCLUDED_FEE_DETAILS' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  describe('legacy admission confirmation with existing payments (generalized balance reconciliation)', () => {
    it('1. confirms a legacy admission with existing payment records when totals reconcile', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100), finalAmount: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
          installmentAllocations: [
            {
              id: 'alloc-1',
              feePaymentHeaderId: 'header-1',
              allocatedAmount: d(40),
              installment: { id: 'inst-1', feePaymentHeaderId: 'header-1' },
            },
          ],
        },
      );
      const { service, tx, schedule } = setup([h]);
      const result = await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
      expect(result.admissionStatus).toBe('CONFIRMED');
      expect(tx.admission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ admissionStatus: 'CONFIRMED', studentId: 'stu-1' }),
        }),
      );
      expect(tx.student.create).toHaveBeenCalled();
      expect(schedule.confirmAdmissionSchedules).toHaveBeenCalledWith(
        tx,
        'admission-1',
        'actor-1',
        new Map([['header-1', d(100)]]),
      );
    });

    it('2. confirms a legacy admission with partial payments and outstanding balance', async () => {
      const h = header(
        [detail({ amountPaid: d(25), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(25),
          totalDueAmount: d(75),
          payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(25) }],
        },
      );
      const { service, tx } = setup([h]);
      const result = await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
      expect(result.admissionStatus).toBe('CONFIRMED');
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('3. confirms a fully paid legacy admission (due === 0)', async () => {
      const h = header(
        [detail({ amountPaid: d(100), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(100),
          totalDueAmount: d(0),
          payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(100) }],
        },
      );
      const { service, tx } = setup([h]);
      const result = await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
      expect(result.admissionStatus).toBe('CONFIRMED');
      expect(tx.student.create).toHaveBeenCalled();
    });

    it('4. rejects an unpaid legacy admission with full outstanding balance', async () => {
      const h = header(
        [detail({ amountPaid: d(0), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(0), totalDueAmount: d(100) },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CONFIRMATION_PAYMENT_REQUIRED' }),
      });
      expect(tx.student.create).not.toHaveBeenCalled();
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('5. rejects when header totalPaidAmount does not match detail-level amountPaid sum', async () => {
      const h = header(
        [detail({ amountPaid: d(30), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(40), totalDueAmount: d(60) }, // 40 != 30
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('6. rejects when header totalDueAmount does not reconcile with net minus paid', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(40), totalDueAmount: d(55) }, // expected 60, got 55
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('7a. rejects negative paid amount on detail', async () => {
      const h = header(
        [detail({ amountPaid: d(-10), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(-10), totalDueAmount: d(110) },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('7b. rejects negative paid amount on header', async () => {
      const h = header(
        [detail({ amountPaid: d(0), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(-10), totalDueAmount: d(110) },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('7c. rejects detail-level paid amount exceeding payable', async () => {
      const h = header(
        [detail({ amountPaid: d(110), totalAmountToBePaid: d(100) })],
        { totalPaidAmount: d(110), totalDueAmount: d(-10) },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('8a. rejects payment belonging to a different admission or header', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          payments: [{ id: 'payment-1', admissionId: 'wrong-adm', feePaymentHeaderId: 'header-1' }],
        },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('8b. rejects payment with missing admissionId or feePaymentHeaderId', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          payments: [{ id: 'payment-1', admissionId: null, feePaymentHeaderId: 'header-1' }],
        },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('8c. rejects installment allocation with mismatched or missing feePaymentHeaderId', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          installmentAllocations: [
            {
              id: 'alloc-1',
              feePaymentHeaderId: 'other-header',
              installment: { id: 'inst-1', feePaymentHeaderId: 'header-1' },
            },
          ],
        },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('8d. rejects installment allocation with missing installment relation', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          installmentAllocations: [
            {
              id: 'alloc-1',
              feePaymentHeaderId: 'header-1',
              installment: null,
            },
          ],
        },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('8e. rejects installment allocation where installment belongs to a different header', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          installmentAllocations: [
            {
              id: 'alloc-1',
              feePaymentHeaderId: 'header-1',
              installment: { id: 'inst-cross', feePaymentHeaderId: 'other-header' },
            },
          ],
        },
      );
      const { service, tx } = setup([h]);
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
      });
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('9. positive-net admission without a required schedule still fails', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
        },
      );
      const { service, tx, schedule } = setup([h]);
      schedule.confirmAdmissionSchedules.mockRejectedValue(
        new BadRequestException('Positive-net admission requires an existing installment schedule.'),
      );
      await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toThrow(
        'Positive-net admission requires an existing installment schedule.',
      );
      expect(tx.admission.update).not.toHaveBeenCalled();
    });

    it('10. existing schedules, allocations, payments, and financial totals remain unchanged after confirmation', async () => {
      const h = header(
        [detail({ amountPaid: d(40), totalAmountToBePaid: d(100) })],
        {
          totalPaidAmount: d(40),
          totalDueAmount: d(60),
          payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
          installmentAllocations: [
            {
              id: 'alloc-1',
              feePaymentHeaderId: 'header-1',
              installment: { id: 'inst-1', feePaymentHeaderId: 'header-1' },
            },
          ],
        },
      );
      const { service, tx } = setup([h]);
      await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
      expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
      expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
      expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
    });
  });

  it('propagates a downstream student-write failure through the transaction callback', async () => {
    const h = header([detail({ amountPaid: d(40) })], {
      totalPaidAmount: d(40),
      totalDueAmount: d(60),
      payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
    });
    const { service, tx } = setup([h]);
    const failure = new Error('student write failed');
    tx.student.create.mockRejectedValue(failure);
    await expect(service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED')).rejects.toBe(failure);
  });

  describe('confirmAdmission transaction options', () => {
    it('configures interactive transaction with { timeout: 10000, maxWait: 5000 }', async () => {
      const h = header([detail({ amountPaid: d(40) })], {
        totalPaidAmount: d(40),
        totalDueAmount: d(60),
        payments: [{ id: 'payment-1', admissionId: 'admission-1', feePaymentHeaderId: 'header-1', amount: d(40) }],
      });
      const { service, database } = setup([h]);
      await service.confirmAdmission('admission-1', { id: 'actor-1' });
      expect(database.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 10000, maxWait: 5000 },
      );
    });
  });
});
