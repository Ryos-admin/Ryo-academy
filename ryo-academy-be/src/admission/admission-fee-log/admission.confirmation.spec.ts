import { ConflictException } from '@nestjs/common';
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
    admission: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'admission-1', admissionStatus: 'DRAFT', admissionSequence: 1,
        admissionNumber: 'ADM-1', studentName: 'Student', dateOfBirth: new Date(), gender: 'OTHER',
      }),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'admission-1', admissionSequence: 1, admissionNumber: 'ADM-1',
        studentName: 'Student', dateOfBirth: new Date(), gender: 'OTHER', ...data,
      })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admission-1' }),
    },
    student: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    feePaymentHeader: {
      findMany: jest.fn().mockResolvedValue(headers),
      update: jest.fn(),
    },
    feePaymentDetails: { update: jest.fn() },
    admissionFeeConcession: { update: jest.fn() },
  };
  const schedule = { confirmAdmissionSchedules: jest.fn().mockResolvedValue(undefined) };
  const database = { $transaction: jest.fn((callback) => callback(tx)) };
  const service = new AdmissionService(
    database as any,
    {} as AdmissionRepository,
    schedule as any,
  );
  return { service, tx, schedule };
}

describe('admission confirmation financial snapshot validation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('aggregates only active included detail rows and never updates fee snapshot amounts', async () => {
    const h = header([
      detail(),
      detail({
        id: 'excluded', isIncluded: false, originalAmount: d(500),
        concession: { calculationMode: 'LEGACY_PERCENTAGE', discountType: 'PERCENTAGE', discountValue: d(10), calculatedDiscountAmount: d(50), requiresReview: false },
      }),
      detail({ id: 'inactive', isActive: false, originalAmount: d(700) }),
    ]);
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
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(20) },
    })], { grossAmount: d(100), discountAmount: d(20), netAmount: d(80), totalFeeAmount: d(80), totalDueAmount: d(80) });
    const { service } = setup([h]);
    await service.updateStatusById('admission-1', { id: 'actor-1' }, 'CONFIRMED');
    expect(legacy).not.toHaveBeenCalled();
  });

  it('confirms zero net without adding an installment obligation', async () => {
    const h = header([detail({
      discountAmount: d(100), finalAmount: d(0), totalAmountToBePaid: d(0),
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(100) },
    })], { discountAmount: d(100), netAmount: d(0), totalFeeAmount: d(0), totalDueAmount: d(0) });
    const { service, schedule } = setup([h]);
    await service.updateStatusById('admission-1', {}, 'CONFIRMED');
    expect(schedule.confirmAdmissionSchedules).toHaveBeenCalledWith(
      expect.anything(), 'admission-1', undefined, new Map([['header-1', d(0)]]),
    );
  });

  it.each([
    ['LEGACY_PERCENTAGE', 'PERCENTAGE'],
    ['LEGACY_FIXED', 'FIXED'],
  ])('validates a consistent %s concession through its matching legacy calculation', async (mode, type) => {
    const legacy = jest.spyOn(DiscountCalculator, 'calculate');
    const h = header([detail({
      discountAmount: d(20), finalAmount: d(80), totalAmountToBePaid: d(80),
      concession: {
        calculationMode: mode, discountType: type, discountValue: d(20),
        calculatedDiscountAmount: d(20), requiresReview: false,
      },
    })], { grossAmount: d(100), discountAmount: d(20), netAmount: d(80), totalFeeAmount: d(80), totalDueAmount: d(80) });
    const { service } = setup([h]);
    await service.updateStatusById('admission-1', {}, 'CONFIRMED');
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent PAYABLE discount and compatibility mirror values', async () => {
    const h = header([detail({
      discountAmount: d(19), finalAmount: d(80), totalAmountToBePaid: d(80),
      concession: { calculationMode: 'PAYABLE', requiresReview: false, calculatedDiscountAmount: d(20) },
    })], { grossAmount: d(100), discountAmount: d(19), netAmount: d(81), totalFeeAmount: d(81), totalDueAmount: d(81) });
    const { service, tx } = setup([h]);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
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
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
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
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
  });

  it('rejects inconsistent snapshots before writing admission or creating a student', async () => {
    const { service, tx } = setup([header([detail({ totalAmountToBePaid: d(99) })])]);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
  });

  it('blocks review-required concessions without mutating them', async () => {
    const { service, tx } = setup([header([detail({
      concession: { calculationMode: 'PAYABLE', requiresReview: true, calculatedDiscountAmount: d(0) },
    })])]);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DISCOUNT_REVIEW_REQUIRED' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
  });

  it('rejects when no active included details exist', async () => {
    const { service, tx } = setup([header([detail({ isIncluded: false })])]);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_INCLUDED_FEE_DETAILS' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('fails closed when payment/allocation evidence exists instead of resetting paid totals', async () => {
    const { service, tx } = setup([header([detail()], { payments: [{ id: 'payment-1' }] })]);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FINANCIAL_SNAPSHOT_INCONSISTENT' }),
    });
    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('propagates a downstream student-write failure through the transaction callback', async () => {
    const { service, tx } = setup([header([detail()])]);
    const failure = new Error('student write failed');
    tx.student.create.mockRejectedValue(failure);
    await expect(service.updateStatusById('admission-1', {}, 'CONFIRMED')).rejects.toBe(failure);
  });
});
