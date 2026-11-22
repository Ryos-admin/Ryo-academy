import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AdmissionStatus,
  FeePricingVersion,
  InstallmentCalculationType,
  InstallmentRowStatus,
  InstallmentScheduleType,
  LineageEventType,
  Prisma,
} from '../../../generated/prisma/client.js';
import { AdmissionInstallmentScheduleService } from './admission-installment-schedule.service.js';
import { ScheduleCalculatorService } from './schedule-calculator.service.js';
import { getCalendarDateString } from './installment-allocation.service.js';

describe('V0 Installment Schedule Lifecycle (BE-M5.1)', () => {
  let service: AdmissionInstallmentScheduleService;
  let mockDatabaseService: any;
  let mockTemplateService: any;
  let mockCalculatorService: ScheduleCalculatorService;

  beforeEach(() => {
    mockCalculatorService = new ScheduleCalculatorService();
    mockTemplateService = {
      findById: jest.fn(),
    };
    mockDatabaseService = {
      $transaction: jest.fn(async (callback: any) => callback(mockTx)),
      admission: { findUnique: jest.fn() },
      admissionInstallmentSchedule: { findUnique: jest.fn() },
      feePayment: { count: jest.fn() },
      feePaymentHeader: { findFirst: jest.fn() },
      school: { findFirst: jest.fn().mockResolvedValue({ id: 'school-1' }) },
      user: { findUnique: jest.fn() },
    };

    service = new AdmissionInstallmentScheduleService(
      mockDatabaseService,
      mockCalculatorService,
      mockTemplateService,
    );
  });

  let mockTx: any;

  function setupMockTx(options?: {
    admissionStatus?: AdmissionStatus;
    pricingVersion?: FeePricingVersion;
    paymentCount?: number;
    existingSchedule?: any;
    netAmount?: string;
  }) {
    const admissionStatus = options?.admissionStatus ?? AdmissionStatus.DRAFT;
    const pricingVersion = options?.pricingVersion ?? FeePricingVersion.V0_SNAPSHOTTED;
    const paymentCount = options?.paymentCount ?? 0;
    const existingSchedule = options?.existingSchedule ?? null;
    const netAmount = new Prisma.Decimal(options?.netAmount ?? '1000.00');

    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      admission: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'adm-1',
          schoolId: 'school-1',
          admissionStatus,
        }),
      },
      feePaymentHeader: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'hdr-1',
          admissionId: 'adm-1',
          isActive: true,
          pricingVersion,
          netAmount,
          grossAmount: netAmount,
          discountAmount: new Prisma.Decimal(0),
          totalPaidAmount: new Prisma.Decimal(0),
          totalDueAmount: netAmount,
        }),
      },
      feePayment: {
        count: jest.fn().mockResolvedValue(paymentCount),
      },
      admissionInstallmentSchedule: {
        findUnique: jest.fn().mockResolvedValue(existingSchedule),
        create: jest.fn().mockImplementation((args: any) => ({
          id: 'sched-new',
          ...args.data,
        })),
        findUniqueOrThrow: jest.fn().mockImplementation(() => ({
          id: 'sched-new',
          installments: [],
        })),
        update: jest.fn().mockImplementation((args: any) => ({
          id: args.where.id,
          ...args.data,
        })),
      },
      admissionInstallment: {
        create: jest.fn().mockImplementation((args: any) => ({
          id: 'inst-' + Math.random().toString(36).substring(7),
          ...args.data,
        })),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      installmentLineageEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      installmentLineageTransferEdge: {
        create: jest.fn().mockResolvedValue({ id: 'edge-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      installmentTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tpl-1',
          schoolId: 'school-1',
          name: 'Standard 2-Term',
          calculationType: InstallmentCalculationType.EQUAL_SPLIT,
          installmentCount: 2,
          isActive: true,
          items: [
            { sequence: 1, label: 'Term 1', dueDaysAfterAdmission: 0 },
            { sequence: 2, label: 'Term 2', dueDaysAfterAdmission: 90 },
          ],
        }),
      },
    };

    (service as any).getAdmissionWithAccess = jest.fn().mockResolvedValue({
      id: 'adm-1',
      schoolId: 'school-1',
      admissionStatus,
    });
  }

  describe('createFromTemplate', () => {
    it('creates an installment schedule on a DRAFT V0 admission with zero payments', async () => {
      setupMockTx({ admissionStatus: AdmissionStatus.DRAFT, pricingVersion: FeePricingVersion.V0_SNAPSHOTTED });

      const result = await service.createFromTemplate('adm-1', {
        templateId: 'tpl-1',
        firstDueDate: '2026-06-15',
      });

      expect(result).toBeDefined();
      expect(mockTx.admissionInstallmentSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            admissionId: 'adm-1',
            feePaymentHeaderId: 'hdr-1',
            scheduleType: InstallmentScheduleType.TEMPLATE,
          }),
        }),
      );
    });

    it('creates an installment schedule on an unpaid CONFIRMED V0 admission', async () => {
      setupMockTx({ admissionStatus: AdmissionStatus.CONFIRMED, pricingVersion: FeePricingVersion.V0_SNAPSHOTTED, paymentCount: 0 });

      const result = await service.createFromTemplate('adm-1', {
        templateId: 'tpl-1',
        firstDueDate: '2026-06-15',
      });

      expect(result).toBeDefined();
      expect(mockTx.admissionInstallmentSchedule.create).toHaveBeenCalled();
    });

    it('rejects schedule creation on a CANCELLED admission', async () => {
      setupMockTx({ admissionStatus: AdmissionStatus.CANCELLED });

      await expect(
        service.createFromTemplate('adm-1', { templateId: 'tpl-1', firstDueDate: '2026-06-15' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects schedule creation on a CONFIRMED legacy admission (preserves DRAFT-only rule)', async () => {
      setupMockTx({ admissionStatus: AdmissionStatus.CONFIRMED, pricingVersion: FeePricingVersion.LEGACY });

      await expect(
        service.createFromTemplate('adm-1', { templateId: 'tpl-1', firstDueDate: '2026-06-15' }),
      ).rejects.toThrow('Only DRAFT admissions can be scheduled.');
    });

    it('rejects duplicate schedule creation when a schedule already exists (HTTP 409 SCHEDULE_ALREADY_EXISTS)', async () => {
      setupMockTx({
        admissionStatus: AdmissionStatus.DRAFT,
        existingSchedule: { id: 'sched-existing', feePaymentHeaderId: 'hdr-1' },
      });

      await expect(
        service.createFromTemplate('adm-1', { templateId: 'tpl-1', firstDueDate: '2026-06-15' }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SCHEDULE_ALREADY_EXISTS' }),
        }),
      );
    });

    it('rejects schedule creation when payments exist (HTTP 409 SCHEDULE_FROZEN_PAYMENT_EXISTS)', async () => {
      setupMockTx({
        admissionStatus: AdmissionStatus.DRAFT,
        paymentCount: 1, // Even 1 payment freezes schedule creation
      });

      await expect(
        service.createFromTemplate('adm-1', { templateId: 'tpl-1', firstDueDate: '2026-06-15' }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SCHEDULE_FROZEN_PAYMENT_EXISTS' }),
        }),
      );
    });
  });

  describe('createManual', () => {
    it('creates a custom manual schedule on an unpaid CONFIRMED V0 admission', async () => {
      setupMockTx({ admissionStatus: AdmissionStatus.CONFIRMED, netAmount: '1000.00' });

      const result = await service.createManual('adm-1', {
        justification: 'Principal approved 2-part payment',
        installments: [
          { sequence: 1, label: 'Part 1', amount: '500.00', dueDate: '2026-07-01' },
          { sequence: 2, label: 'Part 2', amount: '500.00', dueDate: '2026-08-01' },
        ],
      });

      expect(result).toBeDefined();
      expect(mockTx.admissionInstallmentSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scheduleType: InstallmentScheduleType.CUSTOM,
            installmentCount: 2,
          }),
        }),
      );
    });

    it('rejects manual schedule creation without a justification', async () => {
      setupMockTx();

      await expect(
        service.createManual('adm-1', {
          justification: '   ',
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-01' }],
        }),
      ).rejects.toThrow('Justification is mandatory');
    });

    it('rejects manual schedule when payments exist', async () => {
      setupMockTx({ paymentCount: 2 });

      await expect(
        service.createManual('adm-1', {
          justification: 'Valid justification',
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-01' }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SCHEDULE_FROZEN_PAYMENT_EXISTS' }),
        }),
      );
    });

    it('rejects manual schedule when schedule already exists', async () => {
      setupMockTx({ existingSchedule: { id: 'sched-1' } });

      await expect(
        service.createManual('adm-1', {
          justification: 'Valid justification',
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-01' }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SCHEDULE_ALREADY_EXISTS' }),
        }),
      );
    });
  });

  describe('updateDraftSchedule', () => {
    it('allows updating an unpaid schedule on a CONFIRMED V0 admission', async () => {
      setupMockTx({
        admissionStatus: AdmissionStatus.CONFIRMED,
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        paymentCount: 0,
        existingSchedule: { id: 'sched-1', feePaymentHeaderId: 'hdr-1' },
        netAmount: '1000.00',
      });

      const result = await service.updateDraftSchedule('adm-1', {
        reason: 'Adjusting due dates',
        installments: [
          { sequence: 1, label: 'Part 1', amount: '600.00', dueDate: '2026-07-15' },
          { sequence: 2, label: 'Part 2', amount: '400.00', dueDate: '2026-08-15' },
        ],
      });

      expect(result).toBeDefined();
      expect(mockTx.admissionInstallment.deleteMany).toHaveBeenCalledWith({ where: { scheduleId: 'sched-1' } });
      expect(mockTx.admissionInstallmentSchedule.update).toHaveBeenCalled();
    });

    it('rejects update when payment history exists', async () => {
      setupMockTx({
        admissionStatus: AdmissionStatus.CONFIRMED,
        paymentCount: 1,
        existingSchedule: { id: 'sched-1' },
      });

      await expect(
        service.updateDraftSchedule('adm-1', {
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-15' }],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SCHEDULE_FROZEN_PAYMENT_EXISTS' }),
        }),
      );
    });

    it('rejects update on a confirmed legacy admission', async () => {
      setupMockTx({
        admissionStatus: AdmissionStatus.CONFIRMED,
        pricingVersion: FeePricingVersion.LEGACY,
        paymentCount: 0,
        existingSchedule: { id: 'sched-1' },
      });

      await expect(
        service.updateDraftSchedule('adm-1', {
          installments: [{ sequence: 1, label: 'Full', amount: '1000.00', dueDate: '2026-07-15' }],
        }),
      ).rejects.toThrow('Only DRAFT admissions can be scheduled.');
    });
  });

  describe('getSchedule isFrozen projection', () => {
    it('projects isFrozen = false for unpaid CONFIRMED V0 admission', async () => {
      mockDatabaseService.admission.findUnique.mockResolvedValue({
        id: 'adm-1',
        schoolId: 'school-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
      });
      mockDatabaseService.feePaymentHeader.findFirst.mockResolvedValue({
        id: 'hdr-1',
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
        totalPaidAmount: new Prisma.Decimal(0),
        totalDueAmount: new Prisma.Decimal(1000),
      });
      mockDatabaseService.feePayment.count.mockResolvedValue(0);
      mockDatabaseService.admissionInstallmentSchedule.findUnique.mockResolvedValue({
        id: 'sched-1',
        installments: [],
      });

      const res = await service.getSchedule('adm-1');
      expect(res.isFrozen).toBe(false);
      expect(res.admissionStatus).toBe(AdmissionStatus.CONFIRMED);
    });

    it('projects isFrozen = true when payments exist on V0 admission', async () => {
      mockDatabaseService.admission.findUnique.mockResolvedValue({
        id: 'adm-1',
        schoolId: 'school-1',
        admissionStatus: AdmissionStatus.DRAFT,
      });
      mockDatabaseService.feePaymentHeader.findFirst.mockResolvedValue({
        id: 'hdr-1',
        pricingVersion: FeePricingVersion.V0_SNAPSHOTTED,
        grossAmount: new Prisma.Decimal(1000),
        discountAmount: new Prisma.Decimal(0),
        netAmount: new Prisma.Decimal(1000),
        totalPaidAmount: new Prisma.Decimal(500),
        totalDueAmount: new Prisma.Decimal(500),
      });
      mockDatabaseService.feePayment.count.mockResolvedValue(1);
      mockDatabaseService.admissionInstallmentSchedule.findUnique.mockResolvedValue({
        id: 'sched-1',
        installments: [],
      });

      const res = await service.getSchedule('adm-1');
      expect(res.isFrozen).toBe(true);
    });
  });

  describe('Canonical UTC Due-Date Semantics Evaluation', () => {
    // Canonical due date is stored as UTC midnight: 2026-06-15T00:00:00.000Z
    const canonicalDueDate = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
    const dueCalDate = canonicalDueDate.toISOString().slice(0, 10); // "2026-06-15"

    function evaluateEarly(paymentInstant: Date, schoolTimezone: string): boolean {
      const paymentCalDate = getCalendarDateString(paymentInstant, schoolTimezone);
      return paymentCalDate < dueCalDate;
    }

    it('evaluates early, on-date, and late payments correctly in Asia/Kolkata', () => {
      const tz = 'Asia/Kolkata';
      // 1 day before: 2026-06-14 10:00 UTC -> Kolkata 2026-06-14 15:30
      expect(evaluateEarly(new Date('2026-06-14T10:00:00.000Z'), tz)).toBe(true);
      // On due date: 2026-06-15 02:00 UTC -> Kolkata 2026-06-15 07:30
      expect(evaluateEarly(new Date('2026-06-15T02:00:00.000Z'), tz)).toBe(false);
      // 1 day after: 2026-06-16 10:00 UTC -> Kolkata 2026-06-16 15:30
      expect(evaluateEarly(new Date('2026-06-16T10:00:00.000Z'), tz)).toBe(false);
    });

    it('evaluates early, on-date, and late payments correctly in UTC', () => {
      const tz = 'UTC';
      expect(evaluateEarly(new Date('2026-06-14T23:59:59.000Z'), tz)).toBe(true);
      expect(evaluateEarly(new Date('2026-06-15T12:00:00.000Z'), tz)).toBe(false);
      expect(evaluateEarly(new Date('2026-06-16T00:00:01.000Z'), tz)).toBe(false);
    });

    it('evaluates early, on-date, and late payments correctly in America/New_York (west of UTC)', () => {
      const tz = 'America/New_York';
      // Canonical due date remains 2026-06-15 (never shifted back)
      // 1 day before: 2026-06-14 14:00 UTC -> NY 2026-06-14 10:00
      expect(evaluateEarly(new Date('2026-06-14T14:00:00.000Z'), tz)).toBe(true);
      // On due date: 2026-06-15 14:00 UTC -> NY 2026-06-15 10:00
      expect(evaluateEarly(new Date('2026-06-15T14:00:00.000Z'), tz)).toBe(false);
      // 1 day after: 2026-06-16 14:00 UTC -> NY 2026-06-16 10:00
      expect(evaluateEarly(new Date('2026-06-16T14:00:00.000Z'), tz)).toBe(false);
    });
  });
});
