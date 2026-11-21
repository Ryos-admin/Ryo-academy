import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  AdmissionStatus,
  FeePricingVersion,
  InstallmentRowStatus,
  PaymentMethod,
} from '../../../generated/prisma/enums.js';
import { AdmissionPaymentService } from './admission-payment.service.js';
import { CreateAdmissionPaymentDto } from './dto/create-admission-payment.dto.js';
import { ReverseAdmissionPaymentDto } from './dto/reverse-admission-payment.dto.js';

describe('AdmissionPaymentService (BE-M3 & BE-M5.2)', () => {
  const schoolId = 'sch-test-1';
  const actorUserId = 'usr-admin-1';
  const admissionId = 'adm-test-1';
  const headerId = 'hdr-test-1';
  const detail1Id = 'det-tuition-1';
  const detail2Id = 'det-exam-1';
  const detailExcludedId = 'det-lab-excluded';

  const buildHarness = (options?: {
    admissionStatus?: AdmissionStatus;
    schoolIdMismatch?: boolean;
    headerPricingVersion?: FeePricingVersion;
    schedule?: any;
    installments?: any[];
    paymentCount?: number;
    initialAllocations?: any[];
  }) => {
    const savedPayments: any[] = [];
    let savedPayment: any = null;
    let savedAttributions: any[] = [];
    let savedInstallmentAllocations: any[] = options?.initialAllocations ? [...options.initialAllocations] : [];
    const savedReversals: any[] = [];
    let savedReversal: any = null;
    let savedLogs: any[] = [];

    let scheduleState = options?.schedule ?? null;
    let installmentsList = options?.installments ? options.installments.map((i) => ({ ...i })) : [];

    const feeStructureId = 'fs-test-1';
    const compTuitionId = 'comp-tuition-1';
    const compExamId = 'comp-exam-1';
    const compLabId = 'comp-lab-1';

    const feeStructureState: any = {
      id: feeStructureId,
      name: 'Test Fee Structure',
      academicYearId: 'ay-test-1',
      feeComponents: [
        {
          id: compTuitionId,
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1000.00'),
          isActive: true,
          isMandatory: true,
          discountApplicable: true,
        },
        {
          id: compExamId,
          name: 'Examination Fee',
          amount: new Prisma.Decimal('500.00'),
          isActive: true,
          isMandatory: true,
          discountApplicable: true,
        },
        {
          id: compLabId,
          name: 'Lab Fee',
          amount: new Prisma.Decimal('300.00'),
          isActive: true,
          isMandatory: false,
          discountApplicable: true,
        },
      ],
    };

    const detailsMap = new Map<string, any>([
      [
        detail1Id,
        {
          id: detail1Id,
          feePaymentHeaderId: headerId,
          feeComponentId: compTuitionId,
          nameSnapshot: 'Tuition Fee',
          originalAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          finalAmount: new Prisma.Decimal('1000.00'),
          totalAmountToBePaid: new Prisma.Decimal('1000.00'),
          amountPaid: new Prisma.Decimal('200.00'),
          isActive: true,
          isIncluded: true,
          isMandatory: true,
          discountApplicable: true,
        },
      ],
      [
        detail2Id,
        {
          id: detail2Id,
          feePaymentHeaderId: headerId,
          feeComponentId: compExamId,
          nameSnapshot: 'Examination Fee',
          originalAmount: new Prisma.Decimal('500.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          finalAmount: new Prisma.Decimal('500.00'),
          totalAmountToBePaid: new Prisma.Decimal('500.00'),
          amountPaid: new Prisma.Decimal('0.00'),
          isActive: true,
          isIncluded: true,
          isMandatory: true,
          discountApplicable: true,
        },
      ],
      [
        detailExcludedId,
        {
          id: detailExcludedId,
          feePaymentHeaderId: headerId,
          feeComponentId: compLabId,
          nameSnapshot: 'Lab Fee',
          originalAmount: new Prisma.Decimal('300.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          finalAmount: new Prisma.Decimal('300.00'),
          totalAmountToBePaid: new Prisma.Decimal('300.00'),
          amountPaid: new Prisma.Decimal('0.00'),
          isActive: true,
          isIncluded: false, // Excluded!
          isMandatory: false,
          discountApplicable: true,
        },
      ],
    ]);

    let headerState: any = {
      id: headerId,
      admissionId,
      feeStructureId,
      pricingVersion: options?.headerPricingVersion ?? FeePricingVersion.V0_SNAPSHOTTED,
      grossAmount: new Prisma.Decimal('1500.00'),
      netAmount: new Prisma.Decimal('1500.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      totalFeeAmount: new Prisma.Decimal('1500.00'),
      totalPaidAmount: new Prisma.Decimal('200.00'),
      totalDueAmount: new Prisma.Decimal('1300.00'),
      isActive: true,
    };

    const admissionState: any = {
      id: admissionId,
      admissionNumber: 'ADM-2026-001',
      admissionStatus: options?.admissionStatus ?? AdmissionStatus.DRAFT,
      schoolId: options?.schoolIdMismatch ? 'different-school' : schoolId,
      student: null,
    };

    const userState: any = {
      id: actorUserId,
      schoolId,
    };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      admission: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === admissionId ? admissionState : null
        ),
      },
      feeStructure: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === feeStructureId ? feeStructureState : null
        ),
      },
      feePaymentHeader: {
        findMany: jest.fn().mockImplementation(async () => [headerState]),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === headerId) {
            return {
              ...headerState,
              admission: admissionState,
              feeStructure: feeStructureState,
              feePaymentDetails: Array.from(detailsMap.values()),
            };
          }
          return null;
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          headerState = { ...headerState, ...data };
          return headerState;
        }),
      },
      feePaymentDetails: {
        findMany: jest.fn().mockImplementation(async () => Array.from(detailsMap.values())),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const detail = detailsMap.get(where.id);
          if (detail) {
            const updated = { ...detail, ...data };
            detailsMap.set(where.id, updated);
            return updated;
          }
          return null;
        }),
      },
      feePayment: {
        count: jest.fn().mockImplementation(async () =>
          options?.paymentCount !== undefined
            ? options.paymentCount
            : headerState.totalPaidAmount.gt(0) || savedPayments.length > 0 || savedPayment
            ? Math.max(savedPayments.length, 1)
            : 0,
        ),
        create: jest.fn().mockImplementation(async ({ data }) => {
          const p = { id: `pay-test-${savedPayments.length + 1}`, createdAt: new Date(), ...data };
          savedPayments.push(p);
          savedPayment = p;
          return p;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const found =
            savedPayments.find(
              (p) =>
                (where.id && p.id === where.id) ||
                (where.idempotencyKey && p.idempotencyKey === where.idempotencyKey),
            ) ||
            (savedPayment &&
            (savedPayment.id === where.id || savedPayment.idempotencyKey === where.idempotencyKey)
              ? savedPayment
              : null);
          if (found) {
            const atts = savedAttributions.filter((a) => a.feePaymentId === found.id);
            const allocs = savedInstallmentAllocations.filter((a) => a.feePaymentId === found.id);
            return {
              ...found,
              detailAttributions: atts.length > 0 ? atts : savedAttributions,
              installmentAllocations: allocs,
              feePaymentHeader: headerState,
            };
          }
          return null;
        }),
      },
      admissionInstallmentSchedule: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (scheduleState && where.feePaymentHeaderId === scheduleState.feePaymentHeaderId) {
            return scheduleState;
          }
          return null;
        }),
      },
      admissionInstallment: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return installmentsList.find((i) => i.id === where.id) ?? null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          let res = installmentsList;
          if (where?.scheduleId) res = res.filter((i) => i.scheduleId === where.scheduleId);
          if (where?.status) res = res.filter((i) => i.status === where.status);
          if (where?.supersededAt === null) res = res.filter((i) => i.supersededAt === null);
          return res.sort((a, b) => {
            const dDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            if (dDiff !== 0) return dDiff;
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
            if (a.subSequence !== b.subSequence) return a.subSequence - b.subSequence;
            return a.id.localeCompare(b.id);
          });
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const inst = installmentsList.find((i) => i.id === where.id);
          if (inst) {
            Object.assign(inst, data);
            return inst;
          }
          return null;
        }),
      },
      feePaymentInstallmentAllocation: {
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          const newAllocations = data.map((d: any, idx: number) => ({
            id: `inst-alloc-${savedInstallmentAllocations.length + idx + 1}`,
            reversedAmount: new Prisma.Decimal(0),
            ...d,
          }));
          savedInstallmentAllocations.push(...newAllocations);
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const alloc = savedInstallmentAllocations.find((a) => a.id === where.id);
          if (alloc) {
            Object.assign(alloc, data);
            return alloc;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where, include }) => {
          let res = savedInstallmentAllocations;
          if (where?.feePaymentId) {
            res = res.filter((a) => a.feePaymentId === where.feePaymentId);
          }
          if (where?.installmentId?.in) {
            res = res.filter((a) => where.installmentId.in.includes(a.installmentId));
          } else if (where?.installmentId) {
            res = res.filter((a) => a.installmentId === where.installmentId);
          }
          if (include?.feePayment) {
            res = res.map((a) => {
              const payment = savedPayments.find((p) => p.id === a.feePaymentId) || savedPayment;
              return {
                ...a,
                feePayment: a.feePayment || payment || {
                  id: a.feePaymentId,
                  paymentDate: new Date('2026-11-09T18:00:00.000Z'),
                  createdAt: new Date('2026-11-09T18:00:00.000Z'),
                },
              };
            });
          }
          return res;
        }),
      },
      feePaymentDetailAttribution: {
        createMany: jest.fn().mockImplementation(async ({ data }) => {
          const newAtts = data.map((d: any, idx: number) => ({
            id: `attr-${savedAttributions.length + idx + 1}`,
            ...d,
          }));
          savedAttributions.push(...newAtts);
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          if (where?.feePaymentId) {
            return savedAttributions.filter((a) => a.feePaymentId === where.feePaymentId);
          }
          return savedAttributions;
        }),
      },
      paymentReversalEvent: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const rev = { id: `rev-test-${savedReversals.length + 1}`, createdAt: new Date(), ...data };
          savedReversals.push(rev);
          savedReversal = rev;
          return rev;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const rev =
            savedReversals.find(
              (r) =>
                (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey) ||
                (where.feePaymentId && r.feePaymentId === where.feePaymentId),
            ) ||
            (savedReversal &&
            ((where.idempotencyKey && savedReversal.idempotencyKey === where.idempotencyKey) ||
              (where.feePaymentId && savedReversal.feePaymentId === where.feePaymentId))
              ? savedReversal
              : null);
          if (rev) {
            const pay = savedPayments.find((p) => p.id === rev.feePaymentId) || savedPayment;
            return { ...rev, feePayment: pay };
          }
          return null;
        }),
      },
      financialLog: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const log = { id: `log-${savedLogs.length + 1}`, ...data };
          savedLogs.push(log);
          return log;
        }),
      },
    };

    const databaseService = {
      $transaction: jest.fn(async (cb: (client: any) => Promise<any>) => cb(tx)),
      admission: tx.admission,
      feePayment: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const found =
            savedPayments.find(
              (p) =>
                (where.id && p.id === where.id) ||
                (where.idempotencyKey && p.idempotencyKey === where.idempotencyKey),
            ) ||
            (savedPayment &&
            (savedPayment.id === where.id || savedPayment.idempotencyKey === where.idempotencyKey)
              ? savedPayment
              : null);
          if (found) {
            const atts = savedAttributions.filter((a) => a.feePaymentId === found.id);
            const allocs = savedInstallmentAllocations.filter((a) => a.feePaymentId === found.id);
            return {
              ...found,
              detailAttributions: atts.length > 0 ? atts : savedAttributions,
              installmentAllocations: allocs,
              feePaymentHeader: headerState,
            };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          if (where.admissionId === admissionId) {
            const payments = savedPayments.length > 0 ? savedPayments : savedPayment ? [savedPayment] : [];
            return payments.map((p) => {
              const rev = savedReversals.find((r) => r.feePaymentId === p.id) || (savedReversal?.feePaymentId === p.id ? savedReversal : null);
              const atts = savedAttributions.filter((a) => a.feePaymentId === p.id);
              const allocs = savedInstallmentAllocations.filter((a) => a.feePaymentId === p.id);
              return {
                ...p,
                reversalEvent: rev,
                detailAttributions: atts.map((a) => ({
                  ...a,
                  feePaymentDetails: detailsMap.get(a.feePaymentDetailsId),
                })),
                installmentAllocations: allocs.map((ia) => ({
                  ...ia,
                  installment: installmentsList.find((i) => i.id === ia.installmentId),
                })),
              };
            });
          }
          return [];
        }),
      },
      feePaymentHeader: tx.feePaymentHeader,
      paymentReversalEvent: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const rev =
            savedReversals.find(
              (r) =>
                (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey) ||
                (where.feePaymentId && r.feePaymentId === where.feePaymentId),
            ) ||
            (savedReversal &&
            ((where.idempotencyKey && savedReversal.idempotencyKey === where.idempotencyKey) ||
              (where.feePaymentId && savedReversal.feePaymentId === where.feePaymentId))
              ? savedReversal
              : null);
          if (rev) {
            const pay = savedPayments.find((p) => p.id === rev.feePaymentId) || savedPayment;
            return { ...rev, feePayment: pay };
          }
          return null;
        }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) =>
          where.id === actorUserId ? userState : null
        ),
      },
    } as any;

    const service = new AdmissionPaymentService(databaseService);
    return {
      service,
      databaseService,
      tx,
      detailsMap,
      getHeaderState: () => headerState,
      getAdmissionState: () => admissionState,
      getFeeStructureState: () => feeStructureState,
      getSavedPayment: () => savedPayment,
      getSavedAttributions: () => savedAttributions,
      getSavedInstallmentAllocations: () => savedInstallmentAllocations,
      getInstallmentsList: () => installmentsList,
      getSavedReversal: () => savedReversal,
      getSavedLogs: () => savedLogs,
      setSavedPayment: (p: any, attributions: any[]) => {
        savedPayment = p;
        savedAttributions = attributions;
      },
    };
  };

  const standardPayload: CreateAdmissionPaymentDto = {
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    amount: '600.00',
    paymentMethod: PaymentMethod.CASH,
    paymentDate: '2026-11-09T18:00:00.000Z',
    allocations: [
      { feePaymentDetailsId: detail1Id, amount: '400.00' },
      { feePaymentDetailsId: detail2Id, amount: '200.00' },
    ],
  };

  describe('Payment Creation & Allocations Validation', () => {
    it('creates a cash payment with explicit component allocations on a DRAFT admission', async () => {
      const { service, getHeaderState, getSavedPayment, getSavedAttributions, getSavedLogs, detailsMap } = buildHarness();

      const result = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      expect(result.statusCode).toBe(201);
      expect(result.isReplay).toBe(false);
      expect(result.amount).toBe('600');
      expect(result.paymentMethod).toBe(PaymentMethod.CASH);
      expect(result.allocations).toHaveLength(2);

      // Verify payment persistence
      const payment = getSavedPayment();
      expect(payment.admissionId).toBe(admissionId);
      expect(payment.studentId).toBeNull();
      expect(payment.amount.toString()).toBe('600');

      // Verify immutable detail attributions
      const attributions = getSavedAttributions();
      expect(attributions).toHaveLength(2);
      expect(attributions[0].amount.toString()).toBe('400');
      expect(attributions[1].amount.toString()).toBe('200');

      // Verify projections
      const detail1 = detailsMap.get(detail1Id);
      expect(detail1.amountPaid.toString()).toBe('600'); // 200 previous + 400 new

      const detail2 = detailsMap.get(detail2Id);
      expect(detail2.amountPaid.toString()).toBe('200'); // 0 previous + 200 new

      const header = getHeaderState();
      expect(header.totalPaidAmount.toString()).toBe('800'); // 200 + 600
      expect(header.totalDueAmount.toString()).toBe('700'); // 1500 - 800

      // Verify FinancialLog
      const logs = getSavedLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('FEE_PAYMENT');
      expect(logs[0].flowType).toBe('INCOME');
      expect(logs[0].amount.toString()).toBe('600');
    });

    it('allows payment on a CONFIRMED admission', async () => {
      const { service } = buildHarness({ admissionStatus: AdmissionStatus.CONFIRMED });
      const result = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(result.statusCode).toBe(201);
    });

    it('rejects payment on a CANCELLED admission with 400 Bad Request', async () => {
      const { service } = buildHarness({ admissionStatus: AdmissionStatus.CANCELLED });
      await expect(
        service.createAdmissionPayment(admissionId, standardPayload, actorUserId)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported payment methods (non-CASH)', async () => {
      const { service } = buildHarness();
      await expect(
        service.createAdmissionPayment(
          admissionId,
          { ...standardPayload, paymentMethod: 'UPI' as any },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects allocation sum mismatch with total payment amount', async () => {
      const { service } = buildHarness();
      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            amount: '700.00', // allocations sum to 600.00
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects zero or negative allocation amounts', async () => {
      const { service } = buildHarness();
      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            amount: '400.00',
            allocations: [
              { feePaymentDetailsId: detail1Id, amount: '400.00' },
              { feePaymentDetailsId: detail2Id, amount: '0.00' },
            ],
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate feePaymentDetailsId in allocations', async () => {
      const { service } = buildHarness();
      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            allocations: [
              { feePaymentDetailsId: detail1Id, amount: '300.00' },
              { feePaymentDetailsId: detail1Id, amount: '300.00' },
            ],
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects allocations to excluded or inactive components', async () => {
      const { service } = buildHarness();
      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            allocations: [
              { feePaymentDetailsId: detailExcludedId, amount: '600.00' },
            ],
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects allocation amount exceeding component outstanding balance', async () => {
      const { service } = buildHarness();
      // detail1 has 1000 total, 200 already paid => remaining balance is 800
      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            amount: '850.00',
            allocations: [
              { feePaymentDetailsId: detail1Id, amount: '850.00' },
            ],
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Payment Idempotency & P2002 Collision Handling', () => {
    it('returns original payment with 200 OK on idempotent replay with identical intent', async () => {
      const { service } = buildHarness();

      // First call (creates payment)
      const res1 = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(res1.statusCode).toBe(201);
      expect(res1.isReplay).toBe(false);

      // Replay with identical key and intent
      const res2 = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(res2.statusCode).toBe(200);
      expect(res2.isReplay).toBe(true);
      expect(res2.id).toBe(res1.id);
      expect(res2.amount).toBe(res1.amount);
    });

    it('rejects idempotent replay with mismatched payment amount with 409 Conflict', async () => {
      const { service } = buildHarness();
      await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            amount: '500.00',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '500.00' }],
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects idempotent replay with different paymentDate with 409 Conflict', async () => {
      const { service } = buildHarness();
      await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            ...standardPayload,
            paymentDate: '2026-11-10T18:00:00.000Z', // Different date!
          },
          actorUserId
        )
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects idempotent replay targeting a different admission with 409 Conflict', async () => {
      const { service } = buildHarness();
      await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      await expect(
        service.createAdmissionPayment('different-admission-uuid', standardPayload, actorUserId)
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recovers cleanly on P2002 multi-admission collision: compares intent and returns 409 on mismatch', async () => {
      const { service, tx, databaseService } = buildHarness();

      // Mock tx.feePayment.create to throw P2002 idempotencyKey conflict
      tx.feePayment.create.mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['idempotencyKey'] },
      });

      // Mock databaseService.feePayment.findUnique to simulate the competing transaction that committed for admission B
      databaseService.feePayment.findUnique.mockResolvedValueOnce({
        id: 'pay-collision-1',
        idempotencyKey: standardPayload.idempotencyKey,
        admissionId: 'other-admission-uuid',
        amount: new Prisma.Decimal('600.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date(standardPayload.paymentDate),
        detailAttributions: [],
        feePaymentHeader: { totalPaidAmount: 600, totalDueAmount: 400, totalFeeAmount: 1000 },
      });

      await expect(
        service.createAdmissionPayment(admissionId, standardPayload, actorUserId)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Full Payment Reversal', () => {
    const reversalPayload: ReverseAdmissionPaymentDto = {
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
      reason: 'Entered incorrect components at cash desk',
    };

    it('reverses a recorded payment in full using exact attribution lineage and restores projections', async () => {
      const {
        service,
        detailsMap,
        getHeaderState,
        getSavedReversal,
        getSavedLogs,
      } = buildHarness();

      // Create initial payment
      const paymentRes = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(paymentRes.statusCode).toBe(201);

      // Verify projections before reversal
      expect(detailsMap.get(detail1Id).amountPaid.toString()).toBe('600');
      expect(getHeaderState().totalPaidAmount.toString()).toBe('800');

      // Execute Reversal
      const revResult = await service.reverseAdmissionPayment(
        admissionId,
        paymentRes.id,
        reversalPayload,
        actorUserId
      );

      expect(revResult.statusCode).toBe(200);
      expect(revResult.isReplay).toBe(false);
      expect(revResult.reversal.reason).toBe(reversalPayload.reason);

      // Verify detail projections restored
      expect(detailsMap.get(detail1Id).amountPaid.toString()).toBe('200'); // 600 - 400
      expect(detailsMap.get(detail2Id).amountPaid.toString()).toBe('0'); // 200 - 200

      // Verify header projections restored
      const header = getHeaderState();
      expect(header.totalPaidAmount.toString()).toBe('200'); // 800 - 600
      expect(header.totalDueAmount.toString()).toBe('1300'); // 700 + 600

      // Verify FinancialLog reversal entry
      const logs = getSavedLogs();
      expect(logs).toHaveLength(2);
      expect(logs[1].type).toBe('FEE_PAYMENT_REVERSAL');
      expect(logs[1].flowType).toBe('REVERSAL');
      expect(logs[1].amount.toString()).toBe('600');
    });

    it('returns existing reversal with 200 OK on idempotent reversal replay', async () => {
      const { service } = buildHarness();
      const paymentRes = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      // First reversal call
      const rev1 = await service.reverseAdmissionPayment(admissionId, paymentRes.id, reversalPayload, actorUserId);
      expect(rev1.statusCode).toBe(200);
      expect(rev1.isReplay).toBe(false);

      // Replay
      const rev2 = await service.reverseAdmissionPayment(admissionId, paymentRes.id, reversalPayload, actorUserId);
      expect(rev2.statusCode).toBe(200);
      expect(rev2.isReplay).toBe(true);
      expect(rev2.reversal.id).toBe(rev1.reversal.id);
    });

    it('rejects double reversal under a different idempotency key with 409 Conflict', async () => {
      const { service } = buildHarness();
      const paymentRes = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      await service.reverseAdmissionPayment(admissionId, paymentRes.id, reversalPayload, actorUserId);

      // Try reversing again with different idempotency key
      await expect(
        service.reverseAdmissionPayment(
          admissionId,
          paymentRes.id,
          { idempotencyKey: '88888888-8888-4888-8888-888888888888', reason: 'Second reversal try' },
          actorUserId
        )
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects reversal when payment attribution records are unavailable with 409 Conflict', async () => {
      const { service, setSavedPayment } = buildHarness();

      // Simulate a legacy payment that has NO attribution records
      setSavedPayment(
        {
          id: 'pay-legacy-no-attr',
          idempotencyKey: 'legacy-key',
          admissionId,
          feePaymentHeaderId: headerId,
          amount: new Prisma.Decimal('500.00'),
          schoolId,
          paymentMethod: PaymentMethod.LEGACY_UNSPECIFIED,
        },
        [] // Empty attributions!
      );

      await expect(
        service.reverseAdmissionPayment(
          admissionId,
          'pay-legacy-no-attr',
          reversalPayload,
          actorUserId
        )
      ).rejects.toMatchObject({
        response: {
          code: 'PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE',
        },
      });
    });
  });

  describe('Payment History & Allocation Queries', () => {
    it('returns payment history including allocations and reversal metadata', async () => {
      const { service } = buildHarness();
      const payment = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      await service.reverseAdmissionPayment(admissionId, payment.id, {
        idempotencyKey: 'rev-key-hist',
        reason: 'Audit correction',
      }, actorUserId);

      const history = await service.getAdmissionPayments(admissionId);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(payment.id);
      expect(history[0].isReversed).toBe(true);
      expect(history[0].reversal.reason).toBe('Audit correction');
      expect(history[0].allocations).toHaveLength(2);
      expect(history[0].allocations[0].netAmount).toBe('0.00'); // netAmount is 0 when reversed
    });
  });

  describe('Dual-Attribution Installment Collection (BE-M5.2)', () => {
    const defaultSchedule = {
      id: 'sch-sched-1',
      schoolId,
      admissionId,
      feePaymentHeaderId: headerId,
      scheduleType: 'CUSTOM',
      totalAmount: new Prisma.Decimal('1500.00'),
      installmentCount: 2,
    };

    const defaultInstallments = [
      {
        id: 'inst-1',
        scheduleId: 'sch-sched-1',
        feePaymentHeaderId: headerId,
        sequence: 1,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal(0),
        label: 'Term 1 Installment',
        amount: new Prisma.Decimal('1000.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      },
      {
        id: 'inst-2',
        scheduleId: 'sch-sched-1',
        feePaymentHeaderId: headerId,
        sequence: 2,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal(0),
        label: 'Term 2 Installment',
        amount: new Prisma.Decimal('500.00'),
        dueDate: new Date('2026-12-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      },
    ];

    it('rejects payment on a new unscheduled V0 admission with 409 SCHEDULE_REQUIRED when paymentCount === 0', async () => {
      const { service } = buildHarness({
        schedule: null,
        paymentCount: 0,
      });

      await expect(
        service.createAdmissionPayment(admissionId, standardPayload, actorUserId)
      ).rejects.toMatchObject({
        response: {
          code: 'SCHEDULE_REQUIRED',
        },
      });
    });

    it('allows payment on a grandfathered unscheduled V0 admission when paymentCount > 0', async () => {
      const { service, getSavedInstallmentAllocations } = buildHarness({
        schedule: null,
        paymentCount: 1,
      });

      const res = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(res.statusCode).toBe(201);
      expect(res.allocations).toHaveLength(2);
      // Grandfathered header produces 0 installment allocations (component-only collection)
      expect(getSavedInstallmentAllocations()).toHaveLength(0);
      expect(res.installmentAllocations).toHaveLength(0);
    });

    it('rejects payment if schedule ownership does not match admission or school context', async () => {
      const { service } = buildHarness({
        schedule: {
          ...defaultSchedule,
          schoolId: 'foreign-school-id',
        },
        installments: defaultInstallments,
      });

      await expect(
        service.createAdmissionPayment(admissionId, standardPayload, actorUserId)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects payment if schedule total does not equal header totalFeeAmount', async () => {
      const { service } = buildHarness({
        schedule: {
          ...defaultSchedule,
          totalAmount: new Prisma.Decimal('9999.00'), // Mismatched obligation!
        },
        installments: defaultInstallments,
      });

      await expect(
        service.createAdmissionPayment(admissionId, standardPayload, actorUserId)
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('processes partial installment payment leaving original row intact, PENDING, paidAt null, and zero row-splits', async () => {
      const { service, getSavedInstallmentAllocations, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      // standardPayload is 600.00 (which partially pays inst-1 of 1000.00)
      const res = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);

      expect(res.statusCode).toBe(201);
      expect(res.amount).toBe('600');
      // Dual-attribution conservation: detail attributions (600) == installment allocations (600)
      expect(res.allocations).toHaveLength(2);
      expect(res.installmentAllocations).toHaveLength(1);
      expect(res.installmentAllocations[0].installmentId).toBe('inst-1');
      expect(res.installmentAllocations[0].allocatedAmount).toBe('600');

      const savedAllocs = getSavedInstallmentAllocations();
      expect(savedAllocs).toHaveLength(1);
      expect(savedAllocs[0].installmentId).toBe('inst-1');
      expect(savedAllocs[0].allocatedAmount.toString()).toBe('600');

      // Crucial BE-M5.2 mandate: Zero row-splitting, row amount untouched, status PENDING, paidAt null
      const installments = getInstallmentsList();
      expect(installments).toHaveLength(2); // Still exactly 2 rows!
      const inst1 = installments.find((i) => i.id === 'inst-1');
      expect(new Prisma.Decimal(inst1.amount.toString()).equals(new Prisma.Decimal('1000.00'))).toBe(true);
      expect(inst1.status).toBe(InstallmentRowStatus.PENDING);
      expect(inst1.paidAt).toBeNull();
      expect(inst1.supersededAt).toBeNull();
    });

    it('fully settles single installment and marks PAID_EARLY when payment date is before canonical due date', async () => {
      const payload: CreateAdmissionPaymentDto = {
        idempotencyKey: '00000000-0000-4000-8000-000000000010',
        amount: '1000.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z', // Before 2026-11-15 UTC
        allocations: [
          { feePaymentDetailsId: detail1Id, amount: '800.00' },
          { feePaymentDetailsId: detail2Id, amount: '200.00' },
        ],
      };

      const { service, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      const res = await service.createAdmissionPayment(admissionId, payload, actorUserId);
      expect(res.statusCode).toBe(201);
      expect(res.installmentAllocations).toHaveLength(1);
      expect(res.installmentAllocations[0].installmentId).toBe('inst-1');
      expect(res.installmentAllocations[0].allocatedAmount).toBe('1000');

      const installments = getInstallmentsList();
      const inst1 = installments.find((i) => i.id === 'inst-1');
      expect(inst1.status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(inst1.paidAt).toEqual(new Date('2026-11-10T10:00:00.000Z'));
    });

    it('fully settles single installment and marks PAID when payment date is on or after canonical due date', async () => {
      const payload: CreateAdmissionPaymentDto = {
        idempotencyKey: '00000000-0000-4000-8000-000000000011',
        amount: '1000.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-15T12:00:00.000Z', // On due date in Asia/Kolkata
        allocations: [
          { feePaymentDetailsId: detail1Id, amount: '800.00' },
          { feePaymentDetailsId: detail2Id, amount: '200.00' },
        ],
      };

      const { service, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      const res = await service.createAdmissionPayment(admissionId, payload, actorUserId);
      expect(res.statusCode).toBe(201);

      const installments = getInstallmentsList();
      const inst1 = installments.find((i) => i.id === 'inst-1');
      expect(inst1.status).toBe(InstallmentRowStatus.PAID);
      expect(inst1.paidAt).toEqual(new Date('2026-11-15T12:00:00.000Z'));
    });

    it('allocates across multiple installments in strict FIFO order (dueDate ASC, sequence ASC)', async () => {
      // 1200.00 payment covers inst-1 (1000.00) and 200.00 of inst-2 (500.00)
      const payload: CreateAdmissionPaymentDto = {
        idempotencyKey: '00000000-0000-4000-8000-000000000012',
        amount: '1200.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [
          { feePaymentDetailsId: detail1Id, amount: '800.00' },
          { feePaymentDetailsId: detail2Id, amount: '400.00' },
        ],
      };

      const { service, getInstallmentsList, getSavedInstallmentAllocations } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      const res = await service.createAdmissionPayment(admissionId, payload, actorUserId);
      expect(res.statusCode).toBe(201);
      expect(res.installmentAllocations).toHaveLength(2);
      expect(res.installmentAllocations[0].installmentId).toBe('inst-1');
      expect(res.installmentAllocations[0].allocatedAmount).toBe('1000');
      expect(res.installmentAllocations[1].installmentId).toBe('inst-2');
      expect(res.installmentAllocations[1].allocatedAmount).toBe('200');

      // Check sum conservation: 1000 + 200 = 1200 = payment amount
      const sum = res.installmentAllocations.reduce(
        (acc: number, a: any) => acc + Number(a.allocatedAmount),
        0
      );
      expect(sum).toBe(1200);

      const installments = getInstallmentsList();
      const inst1 = installments.find((i) => i.id === 'inst-1');
      const inst2 = installments.find((i) => i.id === 'inst-2');

      // inst-1 is fully settled
      expect(inst1.status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(inst1.paidAt).toEqual(new Date('2026-11-10T10:00:00.000Z'));

      // inst-2 is partially settled
      expect(inst2.status).toBe(InstallmentRowStatus.PENDING);
      expect(inst2.paidAt).toBeNull();
      expect(new Prisma.Decimal(inst2.amount.toString()).equals(new Prisma.Decimal('500.00'))).toBe(true);
    });

    it('identifies the correct settling payment when multiple payments complete an installment', async () => {
      // Payment 1: 400.00 allocated to inst-1 on 2026-11-01
      const initialAllocations = [
        {
          id: 'alloc-prior-1',
          feePaymentId: 'pay-prior-1',
          installmentId: 'inst-1',
          feePaymentHeaderId: headerId,
          allocatedAmount: new Prisma.Decimal('400.00'),
          reversedAmount: new Prisma.Decimal(0),
          feePayment: {
            id: 'pay-prior-1',
            paymentDate: new Date('2026-11-01T10:00:00.000Z'),
            createdAt: new Date('2026-11-01T10:00:00.000Z'),
          },
        },
      ];

      // Payment 2: 600.00 allocated to inst-1 on 2026-11-10
      const payload: CreateAdmissionPaymentDto = {
        idempotencyKey: '00000000-0000-4000-8000-000000000020',
        amount: '600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T12:00:00.000Z',
        allocations: [
          { feePaymentDetailsId: detail1Id, amount: '600.00' },
        ],
      };

      const { service, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
        initialAllocations,
        paymentCount: 1,
      });

      const res = await service.createAdmissionPayment(admissionId, payload, actorUserId);
      expect(res.statusCode).toBe(201);

      const installments = getInstallmentsList();
      const inst1 = installments.find((i) => i.id === 'inst-1');
      // Threshold (1000.00) crossed by Payment 2 (400 prior + 600 new = 1000)
      expect(inst1.status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(inst1.paidAt).toEqual(new Date('2026-11-10T12:00:00.000Z'));
    });

    it('rejects payment exceeding total pending installment obligation with 400 Bad Request', async () => {
      // Installment obligation is 1500.00 total. Attempting to pay 1600.00
      const payload: CreateAdmissionPaymentDto = {
        idempotencyKey: '00000000-0000-4000-8000-000000000030',
        amount: '1600.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate: '2026-11-10T10:00:00.000Z',
        allocations: [
          { feePaymentDetailsId: detail1Id, amount: '1000.00' },
          { feePaymentDetailsId: detail2Id, amount: '600.00' },
        ],
      };

      const { service } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      await expect(
        service.createAdmissionPayment(admissionId, payload, actorUserId)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('Canonical Due Date & School Timezone Semantics', () => {
      const canonicalDueDate = new Date('2026-11-15T00:00:00.000Z'); // Canonical UTC date: '2026-11-15'

      const makeHarnessWithInst = (tz: string) => {
        const singleInst = [
          {
            id: 'inst-tz-1',
            scheduleId: 'sch-sched-tz',
            feePaymentHeaderId: headerId,
            sequence: 1,
            subSequence: 0,
            offsetAmount: new Prisma.Decimal(0),
            label: 'TZ Test Installment',
            amount: new Prisma.Decimal('500.00'),
            dueDate: canonicalDueDate,
            status: InstallmentRowStatus.PENDING,
            paidAt: null,
            supersededAt: null,
          },
        ];

        const sched = {
          id: 'sch-sched-tz',
          schoolId,
          admissionId,
          feePaymentHeaderId: headerId,
          scheduleType: 'CUSTOM',
          totalAmount: new Prisma.Decimal('1500.00'),
          installmentCount: 1,
        };

        return {
          ...buildHarness({ schedule: sched, installments: singleInst }),
          tz,
        };
      };

      const makePayload = (paymentDate: string): CreateAdmissionPaymentDto => ({
        idempotencyKey: `tz-key-${Date.now()}-${Math.random()}`,
        amount: '500.00',
        paymentMethod: PaymentMethod.CASH,
        paymentDate,
        allocations: [
          { feePaymentDetailsId: detail2Id, amount: '500.00' },
        ],
      });

      it('evaluates correctly in Asia/Kolkata: early, on due date, and after due date', async () => {
        // Due Date canonical: 2026-11-15
        // 1. One calendar day before due date: 2026-11-14 in Asia/Kolkata
        // 2026-11-14T15:00:00.000Z + 05:30 = 2026-11-14 20:30 (Cal Date: 2026-11-14) < 2026-11-15 -> PAID_EARLY
        const hEarly = makeHarnessWithInst('Asia/Kolkata');
        await hEarly.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-14T15:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'Asia/Kolkata' },
        );
        expect(hEarly.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);

        // 2. On due date: 2026-11-15 in Asia/Kolkata
        // 2026-11-15T00:00:00.000Z + 05:30 = 2026-11-15 05:30 (Cal Date: 2026-11-15) == 2026-11-15 -> PAID
        const hOn = makeHarnessWithInst('Asia/Kolkata');
        await hOn.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-15T00:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'Asia/Kolkata' },
        );
        expect(hOn.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);

        // 3. One calendar day after due date: 2026-11-16 in Asia/Kolkata
        // 2026-11-15T20:00:00.000Z + 05:30 = 2026-11-16 01:30 (Cal Date: 2026-11-16) > 2026-11-15 -> PAID
        const hAfter = makeHarnessWithInst('Asia/Kolkata');
        await hAfter.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-15T20:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'Asia/Kolkata' },
        );
        expect(hAfter.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);
      });

      it('evaluates correctly in UTC: early, on due date, and after due date', async () => {
        // Due Date canonical: 2026-11-15
        // 1. One calendar day before in UTC: 2026-11-14T23:00:00.000Z -> PAID_EARLY
        const hEarly = makeHarnessWithInst('UTC');
        await hEarly.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-14T23:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'UTC' },
        );
        expect(hEarly.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);

        // 2. On due date in UTC: 2026-11-15T10:00:00.000Z -> PAID
        const hOn = makeHarnessWithInst('UTC');
        await hOn.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-15T10:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'UTC' },
        );
        expect(hOn.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);

        // 3. One calendar day after in UTC: 2026-11-16T02:00:00.000Z -> PAID
        const hAfter = makeHarnessWithInst('UTC');
        await hAfter.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-16T02:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'UTC' },
        );
        expect(hAfter.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);
      });

      it('evaluates correctly in America/New_York (west of UTC)', async () => {
        // Due Date canonical: 2026-11-15
        // 2026-11-15T02:00:00.000Z in America/New_York is 2026-11-14 21:00 (Cal date: 2026-11-14)
        // 2026-11-14 < 2026-11-15 -> PAID_EARLY!
        const hNyEarly = makeHarnessWithInst('America/New_York');
        await hNyEarly.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-15T02:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'America/New_York' },
        );
        expect(hNyEarly.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);

        // 2026-11-15T15:00:00.000Z in America/New_York is 2026-11-15 10:00 (Cal date: 2026-11-15)
        // 2026-11-15 == 2026-11-15 -> PAID
        const hNyOn = makeHarnessWithInst('America/New_York');
        await hNyOn.service.createAdmissionPayment(
          admissionId,
          makePayload('2026-11-15T15:00:00.000Z'),
          actorUserId,
          undefined,
          { schoolTimezone: 'America/New_York' },
        );
        expect(hNyOn.getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);
      });
    });

    it('returns installmentAllocations on idempotent replay with 200 OK', async () => {
      const { service } = buildHarness({
        schedule: defaultSchedule,
        installments: defaultInstallments,
      });

      const res1 = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(res1.statusCode).toBe(201);
      expect(res1.isReplay).toBe(false);
      expect(res1.installmentAllocations).toHaveLength(1);

      // Replay with identical intent
      const res2 = await service.createAdmissionPayment(admissionId, standardPayload, actorUserId);
      expect(res2.statusCode).toBe(200);
      expect(res2.isReplay).toBe(true);
      expect(res2.id).toBe(res1.id);
      expect(res2.installmentAllocations).toHaveLength(1);
      expect(res2.installmentAllocations[0].installmentId).toBe('inst-1');
      expect(res2.installmentAllocations[0].allocatedAmount).toBe('600');
    });
  });

  describe('Dual-Attribution Payment Reversal (BE-M5.3)', () => {
    const scheduleId = 'sch-sched-1';
    const defaultSchedule = {
      id: scheduleId,
      schoolId,
      admissionId,
      feePaymentHeaderId: headerId,
      scheduleType: 'CUSTOM',
      totalAmount: new Prisma.Decimal('1500.00'),
      installmentCount: 2,
    };

    const revDto = (key: string): ReverseAdmissionPaymentDto => ({
      idempotencyKey: key,
      reason: 'Reversing payment for testing BE-M5.3',
    });

    it('reverses the only payment settling an installment, resetting status to PENDING and paidAt to null', async () => {
      const { service, getInstallmentsList, getSavedInstallmentAllocations } = buildHarness({
        schedule: defaultSchedule,
        installments: [
          {
            id: 'inst-1',
            scheduleId: scheduleId,
            sequence: 1,
            subSequence: 0,
            label: 'Installment 1',
            amount: new Prisma.Decimal('600.00'),
            dueDate: new Date('2026-11-15T00:00:00.000Z'),
            status: InstallmentRowStatus.PENDING,
            paidAt: null,
            supersededAt: null,
          },
        ],
      });

      const payRes = await service.createAdmissionPayment(
        admissionId,
        {
          ...standardPayload,
          paymentDate: '2026-11-10T10:00:00.000Z',
        },
        actorUserId,
      );
      expect(payRes.statusCode).toBe(201);
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(getInstallmentsList()[0].paidAt).toBeDefined();

      const revRes = await service.reverseAdmissionPayment(
        admissionId,
        payRes.id,
        revDto('rev-key-m53-1'),
        actorUserId,
      );
      expect(revRes.statusCode).toBe(200);

      const allocs = getSavedInstallmentAllocations();
      expect(allocs).toHaveLength(1);
      expect(allocs[0].feePaymentId).toBe(payRes.id);
      expect(new Prisma.Decimal(allocs[0].reversedAmount.toString()).equals(new Prisma.Decimal('600.00'))).toBe(true);

      const instAfter = getInstallmentsList()[0];
      expect(instAfter.status).toBe(InstallmentRowStatus.PENDING);
      expect(instAfter.paidAt).toBeNull();
      expect(new Prisma.Decimal(instAfter.amount.toString()).equals(new Prisma.Decimal('600.00'))).toBe(true);
      expect(instAfter.supersededAt).toBeNull();
    });

    it('reverses one of multiple payments while another still fully settles it', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('500.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PAID_EARLY,
        paidAt: new Date('2026-11-05T10:00:00.000Z'),
        supersededAt: null,
      };

      const pay1 = {
        id: 'pay-1',
        admissionId,
        feePaymentHeaderId: headerId,
        schoolId,
        amount: new Prisma.Decimal('500.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-11-05T10:00:00.000Z'),
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        idempotencyKey: '00000000-0000-4000-8000-000000000101',
      };
      const pay2 = {
        id: 'pay-2',
        admissionId,
        feePaymentHeaderId: headerId,
        schoolId,
        amount: new Prisma.Decimal('200.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-11-08T10:00:00.000Z'),
        createdAt: new Date('2026-11-08T10:00:00.000Z'),
        idempotencyKey: '00000000-0000-4000-8000-000000000102',
      };

      const { service, tx, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1],
      });

      // Populate harness payments and attributions
      await tx.feePayment.create({ data: pay1 });
      await tx.feePayment.create({ data: pay2 });
      await tx.feePaymentDetailAttribution.createMany({
        data: [
          {
            schoolId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay1.id,
            feePaymentDetailsId: detail1Id,
            amount: new Prisma.Decimal('500.00'),
          },
          {
            schoolId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay2.id,
            feePaymentDetailsId: detail2Id,
            amount: new Prisma.Decimal('200.00'),
          },
        ],
      });

      // Update details amountPaid to reflect both payments
      await tx.feePaymentDetails.update({ where: { id: detail1Id }, data: { amountPaid: new Prisma.Decimal('700.00') } });
      await tx.feePaymentDetails.update({ where: { id: detail2Id }, data: { amountPaid: new Prisma.Decimal('200.00') } });

      // Add installment allocations: pay1 allocated 500, pay2 allocated 200
      await tx.feePaymentInstallmentAllocation.createMany({
        data: [
          {
            schoolId,
            admissionId,
            feePaymentScheduleId: scheduleId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay1.id,
            installmentId: 'inst-1',
            allocatedAmount: new Prisma.Decimal('500.00'),
          },
          {
            schoolId,
            admissionId,
            feePaymentScheduleId: scheduleId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay2.id,
            installmentId: 'inst-1',
            allocatedAmount: new Prisma.Decimal('200.00'),
          },
        ],
      });

      // Reverse Payment 2
      const revRes = await service.reverseAdmissionPayment(
        admissionId,
        pay2.id,
        revDto('rev-key-m53-2'),
        actorUserId,
      );
      expect(revRes.statusCode).toBe(200);

      // Payment 1 still has 500 active, covering the 500 amount
      const instAfter = getInstallmentsList()[0];
      expect(instAfter.status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(instAfter.paidAt).toEqual(new Date('2026-11-05T10:00:00.000Z'));
    });

    it('reverses a partial payment without disturbing other payments', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('1000.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      };

      const { service, getInstallmentsList, getSavedInstallmentAllocations } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1],
      });

      // Payment 1: 300 (partial)
      const pay1 = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000201',
          amount: '300.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-01T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '300.00' }],
        },
        actorUserId,
      );

      // Payment 2: 200 (partial)
      const pay2 = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000202',
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '200.00' }],
        },
        actorUserId,
      );

      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PENDING);

      // Reverse Payment 2
      await service.reverseAdmissionPayment(
        admissionId,
        pay2.id,
        revDto('rev-key-m53-3'),
        actorUserId,
      );

      const allocs = getSavedInstallmentAllocations();
      const alloc1 = allocs.find((a) => a.feePaymentId === pay1.id);
      const alloc2 = allocs.find((a) => a.feePaymentId === pay2.id);

      expect(new Prisma.Decimal(alloc1.reversedAmount.toString()).toNumber()).toBe(0);
      expect(new Prisma.Decimal(alloc2.reversedAmount.toString()).toNumber()).toBe(200);

      // Installment status remains PENDING and paidAt is null
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PENDING);
      expect(getInstallmentsList()[0].paidAt).toBeNull();
    });

    it('causes a previously settled installment to become PENDING when settling payment is reversed', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('500.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      };

      const { service, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1],
      });

      // Payment 1: 300
      await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000301',
          amount: '300.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-01T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '300.00' }],
        },
        actorUserId,
      );

      // Payment 2: 200 (settles inst-1)
      const pay2 = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000302',
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '200.00' }],
        },
        actorUserId,
      );

      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(getInstallmentsList()[0].paidAt).toBeDefined();

      // Reverse Payment 2
      await service.reverseAdmissionPayment(
        admissionId,
        pay2.id,
        revDto('rev-key-m53-4'),
        actorUserId,
      );

      // Drops below 500 -> PENDING, paidAt = null
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PENDING);
      expect(getInstallmentsList()[0].paidAt).toBeNull();
    });

    it('settles the installment again when a subsequent payment is made after reversal', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('500.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      };

      const { service, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1],
      });

      // Payment 1: 300
      await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000401',
          amount: '300.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-01T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '300.00' }],
        },
        actorUserId,
      );

      // Payment 2: 200 (settles inst-1)
      const pay2 = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000402',
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '200.00' }],
        },
        actorUserId,
      );

      // Reverse Payment 2
      await service.reverseAdmissionPayment(
        admissionId,
        pay2.id,
        revDto('rev-key-m53-5'),
        actorUserId,
      );
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PENDING);

      // Payment 3: 200 made on 2026-11-20 (on/after due date 2026-11-15)
      await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000403',
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-20T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '200.00' }],
        },
        actorUserId,
      );

      // Settled again! Since 2026-11-20 >= 2026-11-15 -> PAID
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID);
      expect(getInstallmentsList()[0].paidAt).toEqual(new Date('2026-11-20T10:00:00.000Z'));
    });

    it('shifts settling payment and paidAt to a subsequent payment when original settling payment is reversed', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('500.00'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        status: InstallmentRowStatus.PAID_EARLY,
        paidAt: new Date('2026-11-05T10:00:00.000Z'),
        supersededAt: null,
      };

      const pay1 = {
        id: 'pay-1',
        admissionId,
        feePaymentHeaderId: headerId,
        schoolId,
        amount: new Prisma.Decimal('200.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-11-01T10:00:00.000Z'),
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        idempotencyKey: '00000000-0000-4000-8000-000000000501',
      };
      const pay2 = {
        id: 'pay-2',
        admissionId,
        feePaymentHeaderId: headerId,
        schoolId,
        amount: new Prisma.Decimal('300.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-11-05T10:00:00.000Z'),
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        idempotencyKey: '00000000-0000-4000-8000-000000000502',
      };
      const pay3 = {
        id: 'pay-3',
        admissionId,
        feePaymentHeaderId: headerId,
        schoolId,
        amount: new Prisma.Decimal('300.00'),
        paymentMethod: PaymentMethod.CASH,
        paymentDate: new Date('2026-11-10T10:00:00.000Z'),
        createdAt: new Date('2026-11-10T10:00:00.000Z'),
        idempotencyKey: '00000000-0000-4000-8000-000000000503',
      };

      const { service, tx, getInstallmentsList } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1],
      });

      await tx.feePayment.create({ data: pay1 });
      await tx.feePayment.create({ data: pay2 });
      await tx.feePayment.create({ data: pay3 });

      await tx.feePaymentDetailAttribution.createMany({
        data: [
          {
            schoolId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay1.id,
            feePaymentDetailsId: detail1Id,
            amount: new Prisma.Decimal('200.00'),
          },
          {
            schoolId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay2.id,
            feePaymentDetailsId: detail1Id,
            amount: new Prisma.Decimal('300.00'),
          },
          {
            schoolId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay3.id,
            feePaymentDetailsId: detail1Id,
            amount: new Prisma.Decimal('300.00'),
          },
        ],
      });

      await tx.feePaymentDetails.update({ where: { id: detail1Id }, data: { amountPaid: new Prisma.Decimal('1000.00') } });

      await tx.feePaymentInstallmentAllocation.createMany({
        data: [
          {
            schoolId,
            admissionId,
            feePaymentScheduleId: scheduleId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay1.id,
            installmentId: 'inst-1',
            allocatedAmount: new Prisma.Decimal('200.00'),
          },
          {
            schoolId,
            admissionId,
            feePaymentScheduleId: scheduleId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay2.id,
            installmentId: 'inst-1',
            allocatedAmount: new Prisma.Decimal('300.00'),
          },
          {
            schoolId,
            admissionId,
            feePaymentScheduleId: scheduleId,
            feePaymentHeaderId: headerId,
            feePaymentId: pay3.id,
            installmentId: 'inst-1',
            allocatedAmount: new Prisma.Decimal('300.00'),
          },
        ],
      });

      // Now reverse Payment 2 (which originally settled the installment)
      await service.reverseAdmissionPayment(
        admissionId,
        pay2.id,
        revDto('rev-key-m53-6'),
        actorUserId,
      );

      // Remaining active allocations: pay1 (200) + pay3 (300) = 500 >= 500
      // pay3 is now the settling payment!
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(getInstallmentsList()[0].paidAt).toEqual(new Date('2026-11-10T10:00:00.000Z'));
    });

    it('reverses a single payment affecting multiple installments, re-evaluating both independently', async () => {
      const inst1 = {
        id: 'inst-1',
        scheduleId: scheduleId,
        sequence: 1,
        subSequence: 0,
        label: 'Installment 1',
        amount: new Prisma.Decimal('600.00'),
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      };
      const inst2 = {
        id: 'inst-2',
        scheduleId: scheduleId,
        sequence: 2,
        subSequence: 0,
        label: 'Installment 2',
        amount: new Prisma.Decimal('400.00'),
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
        status: InstallmentRowStatus.PENDING,
        paidAt: null,
        supersededAt: null,
      };

      const { service, getInstallmentsList, getSavedInstallmentAllocations } = buildHarness({
        schedule: defaultSchedule,
        installments: [inst1, inst2],
      });

      // Single payment of 1000 spanning both inst-1 (600) and inst-2 (400)
      const pay = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000601',
          amount: '1000.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [
            { feePaymentDetailsId: detail1Id, amount: '600.00' },
            { feePaymentDetailsId: detail2Id, amount: '400.00' },
          ],
        },
        actorUserId,
      );

      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PAID_EARLY);
      expect(getInstallmentsList()[1].status).toBe(InstallmentRowStatus.PAID_EARLY);

      // Reverse payment
      await service.reverseAdmissionPayment(
        admissionId,
        pay.id,
        revDto('rev-key-m53-7'),
        actorUserId,
      );

      const allocs = getSavedInstallmentAllocations();
      expect(allocs).toHaveLength(2);
      expect(new Prisma.Decimal(allocs[0].reversedAmount.toString()).toNumber()).toBe(600);
      expect(new Prisma.Decimal(allocs[1].reversedAmount.toString()).toNumber()).toBe(400);

      // Both reset to PENDING and paidAt null
      expect(getInstallmentsList()[0].status).toBe(InstallmentRowStatus.PENDING);
      expect(getInstallmentsList()[0].paidAt).toBeNull();
      expect(getInstallmentsList()[1].status).toBe(InstallmentRowStatus.PENDING);
      expect(getInstallmentsList()[1].paidAt).toBeNull();
    });

    it('preserves component-only reversal for grandfathered unscheduled V0 admissions', async () => {
      const { service, tx, getSavedInstallmentAllocations, getHeaderState } = buildHarness({
        schedule: null,
        installments: [],
        paymentCount: 1, // Grandfathered
      });

      // Create grandfathered payment
      const pay = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000701',
          amount: '200.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '200.00' }],
        },
        actorUserId,
      );

      expect(getSavedInstallmentAllocations()).toHaveLength(0);

      // Reverse grandfathered payment
      const revRes = await service.reverseAdmissionPayment(
        admissionId,
        pay.id,
        revDto('rev-key-m53-8'),
        actorUserId,
      );

      expect(revRes.statusCode).toBe(200);
      expect(getSavedInstallmentAllocations()).toHaveLength(0);
      expect(tx.admissionInstallment.update).not.toHaveBeenCalled();
      expect(getHeaderState().totalPaidAmount.toNumber()).toBe(200); // 200 initial + 200 - 200
    });
  });

  describe('Incremental Fee Synchronization — Task 2 Pre-Payment Eligibility Validation Gate', () => {
    it('Case 1: Missing active mandatory component rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      // Master structure has an extra active mandatory component not in details
      getFeeStructureState().feeComponents.push({
        id: 'comp-new-mandatory',
        name: 'New Mandatory Lab Fee',
        amount: new Prisma.Decimal('200.00'),
        isActive: true,
        isMandatory: true,
        discountApplicable: true,
      });

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000801',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 2: Missing active optional component rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      // Master structure has an extra active optional component not in details
      getFeeStructureState().feeComponents.push({
        id: 'comp-new-optional',
        name: 'New Optional Transport Fee',
        amount: new Prisma.Decimal('150.00'),
        isActive: true,
        isMandatory: false,
        discountApplicable: true,
      });

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000802',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 3: Master amount increase rejects a stale admission snapshot with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Tuition fee increased from 1000 to 1200 on master
      const tuitionComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-tuition-1');
      tuitionComp.amount = new Prisma.Decimal('1200.00');

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000803',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 4: isMandatory drift rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Examination fee changed to mandatory = false on master (was true)
      const examComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-exam-1');
      examComp.isMandatory = false;

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000804',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 5: discountApplicable drift rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Tuition fee became non-discountable on master, but detail still has discountApplicable = true without concession
      const tuitionComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-tuition-1');
      tuitionComp.discountApplicable = false;

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000805',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 6: Relevant inclusion and active status drift rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      // 6a: detail isActive = false while master isActive = true
      const h1 = buildHarness();
      h1.detailsMap.get(detail1Id).isActive = false;

      await expect(
        h1.service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000806',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });

      // 6b: mandatory detail isExcluded (isIncluded = false)
      const h2 = buildHarness();
      h2.detailsMap.get(detail1Id).isIncluded = false;
      await expect(
        h2.service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000807',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 7: PAYABLE concession with valid contractual absolute discount passes gate and records payment', async () => {
      const { service, detailsMap, getHeaderState } = buildHarness();
      // Configure Detail 1 with valid PAYABLE concession
      const detail1 = detailsMap.get(detail1Id);
      detail1.discountAmount = new Prisma.Decimal('200.00');
      detail1.totalAmountToBePaid = new Prisma.Decimal('800.00');
      detail1.finalAmount = new Prisma.Decimal('800.00');
      detail1.concession = {
        id: 'concession-payable-1',
        calculationMode: 'PAYABLE',
        calculatedDiscountAmount: new Prisma.Decimal('200.00'),
        requiresReview: false,
      };

      // Adjust header aggregates: gross 1500, discount 200, net 1300, totalFee 1300, paid 200, due 1100
      const header = getHeaderState();
      header.grossAmount = new Prisma.Decimal('1500.00');
      header.discountAmount = new Prisma.Decimal('200.00');
      header.netAmount = new Prisma.Decimal('1300.00');
      header.totalFeeAmount = new Prisma.Decimal('1300.00');
      header.totalPaidAmount = new Prisma.Decimal('200.00');
      header.totalDueAmount = new Prisma.Decimal('1100.00');

      const res = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000808',
          amount: '100.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
        },
        actorUserId,
      );

      expect(res.statusCode).toBe(201);
      expect(Number(res.amount)).toBe(100);
    });

    it('Case 8: Grandfathered concession with requiresReview retains approved historical behavior and passes gate', async () => {
      const { service, detailsMap, getFeeStructureState, getHeaderState } = buildHarness();
      // Master component became non-discountable
      const currentMaster = getFeeStructureState();
      const tuitionComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-tuition-1');
      tuitionComp.discountApplicable = false;

      // Existing concession was grandfathered with requiresReview = true
      const detail1 = detailsMap.get(detail1Id);
      detail1.discountApplicable = true; // Still snapshot from when it was created
      detail1.discountAmount = new Prisma.Decimal('200.00');
      detail1.totalAmountToBePaid = new Prisma.Decimal('800.00');
      detail1.finalAmount = new Prisma.Decimal('800.00');
      detail1.concession = {
        id: 'concession-grandfathered-1',
        calculationMode: 'PAYABLE',
        calculatedDiscountAmount: new Prisma.Decimal('200.00'),
        requiresReview: true, // Grandfathered!
      };

      // Header aggregates: gross 1500, discount 200, net 1300, totalFee 1300, paid 200, due 1100
      const header = getHeaderState();
      header.grossAmount = new Prisma.Decimal('1500.00');
      header.discountAmount = new Prisma.Decimal('200.00');
      header.netAmount = new Prisma.Decimal('1300.00');
      header.totalFeeAmount = new Prisma.Decimal('1300.00');
      header.totalPaidAmount = new Prisma.Decimal('200.00');
      header.totalDueAmount = new Prisma.Decimal('1100.00');

      const res = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000809',
          amount: '100.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
        },
        actorUserId,
      );

      expect(res.statusCode).toBe(201);
      expect(Number(res.amount)).toBe(100);
    });

    it('Case 9: Deactivated component with an outstanding balance rejects payment with 409 ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, getFeeStructureState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Examination fee is deactivated on master, but detail2 has total 500, paid 0 (outstanding 500 > 0)
      const examComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-exam-1');
      examComp.isActive = false;

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000810',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });
    });

    it('Case 10: Fully settled deactivated component does not block payment against another valid component', async () => {
      const { service, detailsMap, getFeeStructureState, getHeaderState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Examination fee is deactivated on master
      const examComp = currentMaster.feeComponents.find((c: any) => c.id === 'comp-exam-1');
      examComp.isActive = false;

      // Detail 2 was fully settled: total 500, paid 500 (outstanding = 0)
      const detail2 = detailsMap.get(detail2Id);
      detail2.amountPaid = new Prisma.Decimal('500.00');

      // Header aggregates: gross 1500, net 1500, totalFee 1500, paid 700 (200 + 500), due 800
      const header = getHeaderState();
      header.totalPaidAmount = new Prisma.Decimal('700.00');
      header.totalDueAmount = new Prisma.Decimal('800.00');

      // Pay against active Tuition fee
      const res = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000811',
          amount: '100.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
        },
        actorUserId,
      );

      expect(res.statusCode).toBe(201);
      expect(Number(res.amount)).toBe(100);
    });

    it('Case 11 & 12: Rejected payment executes under header lock and leaves zero partial writes', async () => {
      const { service, tx, getFeeStructureState } = buildHarness();
      const currentMaster = getFeeStructureState();
      // Induce pricing drift
      currentMaster.feeComponents[0].amount = new Prisma.Decimal('9999.00');

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000812',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          code: 'ADMISSION_FEE_DETAILS_OUTDATED',
        }),
      });

      // Proof of Level 2 row-lock execution
      expect(tx.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('SELECT id FROM "FeePaymentHeader" WHERE id =')]),
        headerId,
      );

      // Proof of zero financial mutations on failure
      expect(tx.feePayment.create).not.toHaveBeenCalled();
      expect(tx.feePaymentDetailAttribution.createMany).not.toHaveBeenCalled();
      expect(tx.feePaymentInstallmentAllocation.createMany).not.toHaveBeenCalled();
      expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
      expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    });

    it('Case 13: Valid synchronized snapshots pass the gate cleanly', async () => {
      const { service } = buildHarness();
      const res = await service.createAdmissionPayment(
        admissionId,
        {
          idempotencyKey: '00000000-0000-4000-8000-000000000813',
          amount: '100.00',
          paymentMethod: PaymentMethod.CASH,
          paymentDate: '2026-11-05T10:00:00.000Z',
          allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
        },
        actorUserId,
      );

      expect(res.statusCode).toBe(201);
      expect(res.isReplay).toBeFalsy();
      expect(Number(res.amount)).toBe(100);
    });

    it('Case 14: Unrelated transaction and database errors are not translated to ADMISSION_FEE_DETAILS_OUTDATED', async () => {
      const { service, tx, getAdmissionState } = buildHarness();

      // Case 14a: Admission cancelled throws 400 Bad Request
      getAdmissionState().admissionStatus = AdmissionStatus.CANCELLED;

      await expect(
        service.createAdmissionPayment(
          admissionId,
          {
            idempotencyKey: '00000000-0000-4000-8000-000000000814',
            amount: '100.00',
            paymentMethod: PaymentMethod.CASH,
            paymentDate: '2026-11-05T10:00:00.000Z',
            allocations: [{ feePaymentDetailsId: detail1Id, amount: '100.00' }],
          },
          actorUserId,
        ),
      ).rejects.toThrow('Payment collection is not allowed for cancelled admissions.');

      // Case 14b: Header not found throws 404 NotFoundException (not 409)
      await expect(
        service.assertAdmissionFeeDetailsCurrent(tx, 'non-existent-header'),
      ).rejects.toBeInstanceOf(NotFoundException);

      // Case 14c: Arbitrary database connection error is rethrown unchanged
      const dbError = new Error('Database connection terminated unexpectedly');
      tx.feePaymentHeader.findUnique.mockRejectedValueOnce(dbError);

      await expect(
        service.assertAdmissionFeeDetailsCurrent(tx, headerId),
      ).rejects.toThrow('Database connection terminated unexpectedly');
    });
  });
});
