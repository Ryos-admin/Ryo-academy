import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  FeeStructureSyncService,
  resolveSupplementaryDueDate,
} from './fee-structure-sync.service.js';
import { AdmissionStatus, InstallmentRowStatus, LineageEventType } from '../../../generated/prisma/enums.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { getKolkataBusinessDateUtc } from '../../common/date/kolkata-business-date.js';

describe('FeeStructureSyncService (Task 3)', () => {
  let service: FeeStructureSyncService;
  let mockDb: any;
  let txMock: any;
  let mockConcessionService: any;

  const feeStructureId = 'fs-test-1';
  const actorUserId = 'usr-admin-1';
  const schoolId = 'sch-test-1';

  beforeEach(() => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      feeStructure: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      academicYear: {
        findUnique: jest.fn(),
      },
      admission: {
        findMany: jest.fn(),
      },
      feeComponent: {
        findMany: jest.fn(),
      },
      feePaymentHeader: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      feePaymentDetails: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      admissionInstallmentSchedule: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      admissionInstallment: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      installmentLineageEvent: {
        create: jest.fn(),
      },
      installmentLineageTransferEdge: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    mockDb = {
      $transaction: jest.fn(async (cb: any, _options?: any) => {
        return await cb(txMock);
      }),
    };

    mockConcessionService = {
      recomputeV0: jest.fn().mockImplementation(async (tx: any, headerId: string) => {
        return { id: headerId };
      }),
    };

    service = new FeeStructureSyncService(mockDb as any, mockConcessionService as any);
  });

  // =========================================================================
  // 1. Supplementary Due Date Validation Contract
  // =========================================================================

  describe('Supplementary Due Date Validation Contract (resolveSupplementaryDueDate)', () => {
    const futureEndDate = new Date(Date.UTC(2027, 4, 31)); // 2027-05-31
    const pastEndDate = new Date(Date.UTC(2020, 4, 31)); // 2020-05-31

    it('accepts valid future date in strict YYYY-MM-DD format', () => {
      const res = resolveSupplementaryDueDate('2027-12-31', futureEndDate);
      expect(res).toBeInstanceOf(Date);
      expect(res.getUTCFullYear()).toBe(2027);
      expect(res.getUTCMonth()).toBe(11);
      expect(res.getUTCDate()).toBe(31);
    });

    it('rejects datetime string with timestamp / ISO markers', () => {
      expect(() =>
        resolveSupplementaryDueDate('2027-12-31T00:00:00Z', futureEndDate),
      ).toThrow(BadRequestException);
      expect(() =>
        resolveSupplementaryDueDate('2027-12-31 10:00:00', futureEndDate),
      ).toThrow(BadRequestException);
    });

    it('rejects invalid calendar days (e.g. 2026-04-31)', () => {
      expect(() =>
        resolveSupplementaryDueDate('2026-04-31', futureEndDate),
      ).toThrow(BadRequestException);
    });

    it('rejects leap-year invalid date (e.g. 2026-02-29 in non-leap year)', () => {
      expect(() =>
        resolveSupplementaryDueDate('2026-02-29', futureEndDate),
      ).toThrow(BadRequestException);
    });

    it('accepts valid leap year date in leap year (e.g. 2028-02-29)', () => {
      const res = resolveSupplementaryDueDate('2028-02-29', futureEndDate);
      expect(res.getUTCFullYear()).toBe(2028);
      expect(res.getUTCMonth()).toBe(1);
      expect(res.getUTCDate()).toBe(29);
    });

    it('rejects past dates relative to Kolkata business date', () => {
      expect(() =>
        resolveSupplementaryDueDate('2020-01-01', futureEndDate),
      ).toThrow(BadRequestException);
    });

    it('defaults to academicYear.endDate when omitted and endDate is in the future', () => {
      const res = resolveSupplementaryDueDate(undefined, futureEndDate);
      expect(res.getUTCFullYear()).toBe(2027);
      expect(res.getUTCMonth()).toBe(4);
      expect(res.getUTCDate()).toBe(31);
    });

    it('throws 409 ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED when omitted and endDate is in the past', () => {
      expect(() =>
        resolveSupplementaryDueDate(undefined, pastEndDate),
      ).toThrow(ConflictException);

      try {
        resolveSupplementaryDueDate(undefined, pastEndDate);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED',
          }),
        );
      }
    });
  });

  // =========================================================================
  // 2. Preflight Coordination & Error Classification (Preserved from Stage 2)
  // =========================================================================

  describe('P2028 and Database Error Classification', () => {
    it('maps P2034 to CONCURRENT_FINANCIAL_TRANSACTION (409)', () => {
      const err = service.classifyDatabaseError({ code: 'P2034', message: 'Write conflict' });
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as any).getResponse()).toEqual({
        code: 'CONCURRENT_FINANCIAL_TRANSACTION',
        message: 'Concurrent financial modification detected. Please retry the transaction.',
      });
    });

    it('maps PostgreSQL 40P01, 55P03, 40001 to CONCURRENT_FINANCIAL_TRANSACTION (409)', () => {
      for (const code of ['40P01', '55P03', '40001']) {
        const err = service.classifyDatabaseError({ code, message: 'Deadlock/Lock conflict' });
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as any).getResponse().code).toBe('CONCURRENT_FINANCIAL_TRANSACTION');
      }
    });

    it('maps P2028 to CONCURRENT_FINANCIAL_TRANSACTION ONLY when lock timeout evidence is present', () => {
      const lockTimeoutErr = {
        code: 'P2028',
        message: 'Transaction timed out waiting for lock on relation FeeStructure',
      };
      const res = service.classifyDatabaseError(lockTimeoutErr);
      expect(res).toBeInstanceOf(ConflictException);
      expect((res as any).getResponse().code).toBe('CONCURRENT_FINANCIAL_TRANSACTION');
    });

    it('maps P2028 to sanitized 500 when underlying cause is not a verified lock timeout', () => {
      const genericCloseErr = {
        code: 'P2028',
        message: 'Transaction already closed: A query cannot be executed on a closed transaction.',
      };
      const res = service.classifyDatabaseError(genericCloseErr);
      expect(res).toBeInstanceOf(InternalServerErrorException);
      expect((res as any).getResponse()).toEqual({
        code: 'TRANSACTION_EXECUTION_FAILED',
        message: 'A database transaction error occurred during synchronization. Please retry the operation.',
      });
    });

    it('preserves domain HttpExceptions without modification', () => {
      const domainErr = new ConflictException({ code: 'PAID_PROJECTION_INTEGRITY_MISMATCH', message: 'Mismatch' });
      const res = service.classifyDatabaseError(domainErr);
      expect(res).toBe(domainErr);
    });
  });

  // =========================================================================
  // 3. School Context & Tenant Verification
  // =========================================================================

  describe('Tenant & School Context Verification', () => {
    it('throws ForbiddenException if callerSchoolId does not match academicYear.schoolId', async () => {
      const masterStructure = {
        id: feeStructureId,
        isActive: true,
        deletedAt: null,
        academicYear: {
          id: 'ay-1',
          schoolId: 'sch-other-tenant',
          endDate: new Date(Date.UTC(2027, 4, 31)),
        },
      };

      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([]);

      await expect(
        service.executeSynchronization(
          feeStructureId,
          {},
          actorUserId,
          'sch-caller-tenant',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('succeeds when callerSchoolId matches academicYear.schoolId', async () => {
      const masterStructure = {
        id: feeStructureId,
        isActive: true,
        deletedAt: null,
        academicYear: {
          id: 'ay-1',
          schoolId,
          endDate: new Date(Date.UTC(2027, 4, 31)),
        },
      };

      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([]);
      txMock.feeComponent.findMany.mockResolvedValue([]);

      const result = await service.executeSynchronization(
        feeStructureId,
        {},
        actorUserId,
        schoolId,
      );

      expect(result.eligibleAdmissionCount).toBe(0);
      expect(result.synchronizedAdmissionCount).toBe(0);
    });
  });

  // =========================================================================
  // 4. Admission Detail Synchronization & Missing Component Addition
  // =========================================================================

  describe('Admission Snapshot Reconciliation (Missing Components)', () => {
    const futureEndDate = new Date(Date.UTC(2027, 4, 31));
    const masterStructure = {
      id: feeStructureId,
      isActive: true,
      deletedAt: null,
      academicYear: {
        id: 'ay-1',
        schoolId,
        endDate: futureEndDate,
      },
    };

    beforeEach(() => {
      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([
        { id: 'adm-1', admissionStatus: AdmissionStatus.CONFIRMED, schoolId },
      ]);
      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue([
        {
          id: 'dtl-tuition',
          feePaymentHeaderId: 'hdr-1',
          feeComponentId: 'comp-tuition',
          nameSnapshot: 'Tuition Fee',
          originalAmount: new Prisma.Decimal('1000.00'),
          amountPaid: new Prisma.Decimal('0.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          totalAmountToBePaid: new Prisma.Decimal('1000.00'),
          finalAmount: new Prisma.Decimal('1000.00'),
          isActive: true,
          isIncluded: true,
          isMandatory: true,
          discountApplicable: false,
        },
      ]);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([]);
    });

    it('inserts missing mandatory active component with isIncluded: true and zero concessions', async () => {
      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: null,
      };

      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master now has 2 components: Tuition (1000) and Lab (500, mandatory)
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1000.00'),
          isMandatory: true,
          discountApplicable: false,
        },
        {
          id: 'comp-lab',
          name: 'Lab Fee',
          amount: new Prisma.Decimal('500.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.detailsInsertedCount).toBe(1);
      expect(txMock.feePaymentDetails.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          feePaymentHeaderId: 'hdr-1',
          feeComponentId: 'comp-lab',
          nameSnapshot: 'Lab Fee',
          isActive: true,
          isIncluded: true,
          originalAmount: new Prisma.Decimal('500.00'),
          totalAmountToBePaid: new Prisma.Decimal('500.00'),
          finalAmount: new Prisma.Decimal('500.00'),
          amountPaid: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
        }),
      });

      // Assert recomputeV0 was called on the header
      expect(mockConcessionService.recomputeV0).toHaveBeenCalledWith(txMock, 'hdr-1');
    });

    it('inserts missing optional active component with isIncluded: false by default', async () => {
      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: null,
      };

      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master now has optional Transport Fee
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1000.00'),
          isMandatory: true,
          discountApplicable: false,
        },
        {
          id: 'comp-transport',
          name: 'Transport Fee',
          amount: new Prisma.Decimal('300.00'),
          isMandatory: false,
          discountApplicable: false,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.detailsInsertedCount).toBe(1);
      expect(txMock.feePaymentDetails.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          feeComponentId: 'comp-transport',
          isMandatory: false,
          isIncluded: false, // Default for optional
        }),
      });
    });
  });

  // =========================================================================
  // 5. Existing Component Upward Increase & Concession Preservation
  // =========================================================================

  describe('Component Upward Amount Adjustments and Concession Preservation', () => {
    const futureEndDate = new Date(Date.UTC(2027, 4, 31));
    const masterStructure = {
      id: feeStructureId,
      isActive: true,
      deletedAt: null,
      academicYear: {
        id: 'ay-1',
        schoolId,
        endDate: futureEndDate,
      },
    };

    beforeEach(() => {
      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([
        { id: 'adm-1', admissionStatus: AdmissionStatus.CONFIRMED, schoolId },
      ]);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([]);
    });

    it('updates detail originalAmount and recalculates without concession', async () => {
      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: null,
      };

      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master increased Tuition from 1000 to 1200
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1200.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.detailsUpdatedCount).toBe(1);
      expect(txMock.feePaymentDetails.update).toHaveBeenCalledWith({
        where: { id: 'dtl-tuition' },
        data: expect.objectContaining({
          originalAmount: new Prisma.Decimal('1200.00'),
          totalAmountToBePaid: new Prisma.Decimal('1200.00'),
          finalAmount: new Prisma.Decimal('1200.00'),
        }),
      });
    });

    it('preserves PAYABLE absolute discount contract when component amount increases', async () => {
      // Detail originally: 1000, discount: 200, payable: 800
      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('800.00'),
            finalAmount: new Prisma.Decimal('800.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('200.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: true,
            concession: {
              id: 'cnc-1',
              calculatedDiscountAmount: new Prisma.Decimal('200.00'),
              requiresReview: false,
            },
          },
        ],
        installmentSchedule: null,
      };

      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('200.00'),
          netAmount: new Prisma.Decimal('800.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('800.00'),
          totalFeeAmount: new Prisma.Decimal('800.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master increased Tuition from 1000 to 1500
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1500.00'),
          isMandatory: true,
          discountApplicable: true,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.detailsUpdatedCount).toBe(1);
      // New original: 1500, discount preserved: 200, new payable: 1300
      expect(txMock.feePaymentDetails.update).toHaveBeenCalledWith({
        where: { id: 'dtl-tuition' },
        data: expect.objectContaining({
          originalAmount: new Prisma.Decimal('1500.00'),
          discountAmount: new Prisma.Decimal('200.00'),
          totalAmountToBePaid: new Prisma.Decimal('1300.00'),
          finalAmount: new Prisma.Decimal('1300.00'),
        }),
      });
    });

    it('rejects component decrease during synchronization with COMPONENT_DECREASE_PROHIBITED', async () => {
      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: null,
      };

      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master decreased Tuition from 1000 to 800
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('800.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      await expect(
        service.executeSynchronization(
          feeStructureId,
          { supplementaryDueDate: '2027-01-15' },
          actorUserId,
          schoolId,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'COMPONENT_DECREASE_PROHIBITED',
        }),
      });
    });
  });

  // =========================================================================
  // 6. Installment Lineage Decision Tree (Case A, Case B, Case C)
  // =========================================================================

  describe('Installment Lineage Decision Tree', () => {
    const futureEndDate = new Date(Date.UTC(2027, 4, 31));
    const masterStructure = {
      id: feeStructureId,
      isActive: true,
      deletedAt: null,
      academicYear: {
        id: 'ay-1',
        schoolId,
        endDate: futureEndDate,
      },
    };

    beforeEach(() => {
      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([
        { id: 'adm-1', admissionStatus: AdmissionStatus.CONFIRMED, schoolId },
      ]);
    });

    it('Case A (In-Place Root Increase): updates pending root and initial edge in-place when all 9 conditions pass', async () => {
      // 1 root installment: PENDING, seq: 1, subSeq: 0, offset: 0, rootId: null, 0 allocations, 0 descendants
      const existingInstallment = {
        id: 'inst-1',
        scheduleId: 'sch-1',
        sequence: 1,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal('0.00'),
        rootInstallmentId: null,
        amount: new Prisma.Decimal('1000.00'),
        status: InstallmentRowStatus.PENDING,
        supersededAt: null,
        allocations: [],
        resultTransferEdges: [
          {
            id: 'edge-init-1',
            sourceInstallmentId: null,
            resultInstallmentId: 'inst-1',
            amount: new Prisma.Decimal('1000.00'),
          },
        ],
      };

      const existingSchedule = {
        id: 'sch-1',
        feePaymentHeaderId: 'hdr-1',
        totalAmount: new Prisma.Decimal('1000.00'),
        installmentCount: 1,
        installments: [existingInstallment],
      };

      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: existingSchedule,
      };

      // Preflight mocks
      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([existingSchedule]);
      txMock.admissionInstallment.findMany.mockResolvedValue([existingInstallment]);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Component increases from 1000 to 1300 (+300)
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1300.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.caseAIncreasesCount).toBe(1);
      expect(result.supplementaryRootsCreatedCount).toBe(0);

      // Installment amount updated in-place: 1000 + 300 = 1300
      expect(txMock.admissionInstallment.update).toHaveBeenCalledWith({
        where: { id: 'inst-1' },
        data: { amount: new Prisma.Decimal('1300.00') },
      });

      // Initial edge updated in-place: 1000 + 300 = 1300
      expect(txMock.installmentLineageTransferEdge.update).toHaveBeenCalledWith({
        where: { id: 'edge-init-1' },
        data: { amount: new Prisma.Decimal('1300.00') },
      });

      // Schedule total updated: 1300
      expect(txMock.admissionInstallmentSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sch-1' },
        data: { totalAmount: new Prisma.Decimal('1300.00') },
      });

      // Lineage event created with IN_PLACE_ROOT_INCREASE variant
      expect(txMock.installmentLineageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduleId: 'sch-1',
          eventType: LineageEventType.FEE_REVISION,
          description: expect.stringContaining('"variant":"IN_PLACE_ROOT_INCREASE"'),
        }),
      });

      // No new transfer edge created in Case A!
      expect(txMock.installmentLineageTransferEdge.create).not.toHaveBeenCalled();
    });

    it('Case B (Split Leaf Protection): creates supplementary root when pending installment has historical allocation', async () => {
      // Installment has allocation (e.g. partially allocated or split)
      const allocatedInstallment = {
        id: 'inst-1',
        scheduleId: 'sch-1',
        sequence: 1,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal('0.00'),
        rootInstallmentId: null,
        amount: new Prisma.Decimal('600.00'),
        status: InstallmentRowStatus.PENDING,
        supersededAt: null,
        allocations: [{ id: 'alloc-1', amount: new Prisma.Decimal('400.00') }],
        resultTransferEdges: [
          {
            id: 'edge-init-1',
            sourceInstallmentId: null,
            resultInstallmentId: 'inst-1',
            amount: new Prisma.Decimal('1000.00'),
          },
        ],
      };

      const existingSchedule = {
        id: 'sch-1',
        feePaymentHeaderId: 'hdr-1',
        totalAmount: new Prisma.Decimal('1000.00'),
        installmentCount: 1,
        installments: [allocatedInstallment],
      };

      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('400.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('400.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: existingSchedule,
      };

      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('400.00'),
          totalDueAmount: new Prisma.Decimal('600.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([existingSchedule]);
      txMock.admissionInstallment.findMany.mockResolvedValue([allocatedInstallment]);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master increases Tuition from 1000 to 1200 (+200)
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1200.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      txMock.admissionInstallment.create.mockResolvedValue({ id: 'supp-inst-2' });
      txMock.installmentLineageEvent.create.mockResolvedValue({ id: 'ev-revision-1' });

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.caseAIncreasesCount).toBe(0);
      expect(result.supplementaryRootsCreatedCount).toBe(1);

      // Supplementary root created: sequence = 2, amount = 200
      expect(txMock.admissionInstallment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduleId: 'sch-1',
          sequence: 2,
          subSequence: 0,
          offsetAmount: new Prisma.Decimal(0),
          rootInstallmentId: null,
          amount: new Prisma.Decimal('200.00'),
          status: InstallmentRowStatus.PENDING,
        }),
      });

      // Schedule count incremented
      expect(txMock.admissionInstallmentSchedule.update).toHaveBeenCalledWith({
        where: { id: 'sch-1' },
        data: {
          totalAmount: new Prisma.Decimal('1200.00'),
          installmentCount: 2,
        },
      });

      // Lineage event with SUPPLEMENTARY_ROOT variant
      expect(txMock.installmentLineageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduleId: 'sch-1',
          eventType: LineageEventType.FEE_REVISION,
          description: expect.stringContaining('"variant":"SUPPLEMENTARY_ROOT"'),
        }),
      });

      // Transfer edge created for supplementary root
      expect(txMock.installmentLineageTransferEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'ev-revision-1',
          scheduleId: 'sch-1',
          sourceInstallmentId: null,
          resultInstallmentId: 'supp-inst-2',
          amount: new Prisma.Decimal('200.00'),
        }),
      });
    });

    it('Case C (All Paid Protection): creates supplementary root when all installments are fully settled', async () => {
      const settledInstallment = {
        id: 'inst-1',
        scheduleId: 'sch-1',
        sequence: 1,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal('0.00'),
        rootInstallmentId: null,
        amount: new Prisma.Decimal('1000.00'),
        status: InstallmentRowStatus.PAID,
        supersededAt: null,
        allocations: [{ id: 'alloc-1', amount: new Prisma.Decimal('1000.00') }],
        resultTransferEdges: [],
      };

      const existingSchedule = {
        id: 'sch-1',
        feePaymentHeaderId: 'hdr-1',
        totalAmount: new Prisma.Decimal('1000.00'),
        installmentCount: 1,
        installments: [settledInstallment],
      };

      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('1000.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('1000.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: existingSchedule,
      };

      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('1000.00'),
          totalDueAmount: new Prisma.Decimal('0.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([existingSchedule]);
      txMock.admissionInstallment.findMany.mockResolvedValue([settledInstallment]);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Component increases from 1000 to 1250 (+250)
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1250.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      txMock.admissionInstallment.create.mockResolvedValue({ id: 'supp-inst-2' });
      txMock.installmentLineageEvent.create.mockResolvedValue({ id: 'ev-revision-1' });

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      expect(result.caseAIncreasesCount).toBe(0);
      expect(result.supplementaryRootsCreatedCount).toBe(1);

      expect(txMock.admissionInstallment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sequence: 2,
          amount: new Prisma.Decimal('250.00'),
          status: InstallmentRowStatus.PENDING,
        }),
      });
    });
  });

  // =========================================================================
  // 7. Idempotency & Repeated Synchronization
  // =========================================================================

  describe('Idempotency and Convergence', () => {
    const futureEndDate = new Date(Date.UTC(2027, 4, 31));
    const masterStructure = {
      id: feeStructureId,
      isActive: true,
      deletedAt: null,
      academicYear: {
        id: 'ay-1',
        schoolId,
        endDate: futureEndDate,
      },
    };

    it('produces zero mutations and zero duplicate lineage records on second synchronization', async () => {
      // Admission already matching master structure: 1 component at 1000.00
      const existingInstallment = {
        id: 'inst-1',
        scheduleId: 'sch-1',
        sequence: 1,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal('0.00'),
        rootInstallmentId: null,
        amount: new Prisma.Decimal('1000.00'),
        status: InstallmentRowStatus.PENDING,
        supersededAt: null,
        allocations: [],
        resultTransferEdges: [],
      };

      const existingSchedule = {
        id: 'sch-1',
        feePaymentHeaderId: 'hdr-1',
        totalAmount: new Prisma.Decimal('1000.00'),
        installmentCount: 1,
        installments: [existingInstallment],
      };

      const existingHeader = {
        id: 'hdr-1',
        admissionId: 'adm-1',
        totalPaidAmount: new Prisma.Decimal('0.00'),
        feePaymentDetails: [
          {
            id: 'dtl-tuition',
            feePaymentHeaderId: 'hdr-1',
            feeComponentId: 'comp-tuition',
            nameSnapshot: 'Tuition Fee',
            originalAmount: new Prisma.Decimal('1000.00'),
            totalAmountToBePaid: new Prisma.Decimal('1000.00'),
            finalAmount: new Prisma.Decimal('1000.00'),
            amountPaid: new Prisma.Decimal('0.00'),
            discountAmount: new Prisma.Decimal('0.00'),
            isActive: true,
            isIncluded: true,
            isMandatory: true,
            discountApplicable: false,
            concession: null,
          },
        ],
        installmentSchedule: existingSchedule,
      };

      txMock.feeStructure.findUnique.mockResolvedValue(masterStructure);
      txMock.admission.findMany.mockResolvedValue([
        { id: 'adm-1', admissionStatus: AdmissionStatus.CONFIRMED, schoolId },
      ]);
      txMock.feePaymentHeader.findMany.mockResolvedValue([
        {
          id: 'hdr-1',
          admissionId: 'adm-1',
          grossAmount: new Prisma.Decimal('1000.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('1000.00'),
          totalPaidAmount: new Prisma.Decimal('0.00'),
          totalDueAmount: new Prisma.Decimal('1000.00'),
          totalFeeAmount: new Prisma.Decimal('1000.00'),
        },
      ]);
      txMock.feePaymentDetails.findMany.mockResolvedValue(existingHeader.feePaymentDetails);
      txMock.admissionInstallmentSchedule.findMany.mockResolvedValue([existingSchedule]);
      txMock.admissionInstallment.findMany.mockResolvedValue([existingInstallment]);
      txMock.feePaymentHeader.findFirst.mockResolvedValue(existingHeader);

      // Master exactly matches existing detail
      txMock.feeComponent.findMany.mockResolvedValue([
        {
          id: 'comp-tuition',
          name: 'Tuition Fee',
          amount: new Prisma.Decimal('1000.00'),
          isMandatory: true,
          discountApplicable: false,
        },
      ]);

      const result = await service.executeSynchronization(
        feeStructureId,
        { supplementaryDueDate: '2027-01-15' },
        actorUserId,
        schoolId,
      );

      // Verify zero mutations
      expect(result.detailsInsertedCount).toBe(0);
      expect(result.detailsUpdatedCount).toBe(0);
      expect(result.caseAIncreasesCount).toBe(0);
      expect(result.supplementaryRootsCreatedCount).toBe(0);

      expect(txMock.feePaymentDetails.create).not.toHaveBeenCalled();
      expect(txMock.feePaymentDetails.update).not.toHaveBeenCalled();
      expect(txMock.admissionInstallment.create).not.toHaveBeenCalled();
      expect(txMock.admissionInstallment.update).not.toHaveBeenCalled();
      expect(txMock.installmentLineageEvent.create).not.toHaveBeenCalled();
      expect(txMock.installmentLineageTransferEdge.create).not.toHaveBeenCalled();
    });
  });
});
