import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdmissionService } from './admission.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';

const EXISTING = {
  id: 'adm-1',
  admissionStatus: 'CONFIRMED',
  classId: 'class-1',
  sectionId: 'section-1',
  studentName: 'Original Name',
};

describe('AdmissionService.findById (BUG-6: missing record must 404)', () => {
  const buildFind = (result: unknown) => {
    const findUnique = jest.fn().mockResolvedValue(result);
    const databaseService = {
      admission: { findUnique },
    } as unknown as DatabaseService;
    const repository = {} as unknown as AdmissionRepository;
    return {
      service: new AdmissionService(databaseService, repository),
      findUnique,
    };
  };

  it('returns the admission when it exists', async () => {
    const record = {
      ...EXISTING,
      student: {
        id: 'stu-1',
        studentNumber: 'S-1',
        studentName: 'Original Name',
      },
    };
    const { service } = buildFind(record);
    await expect(service.findById('adm-1')).resolves.toEqual(record);
  });

  it('preserves the student include in the successful response', async () => {
    const { service, findUnique } = buildFind(EXISTING);
    await service.findById('adm-1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'adm-1' }),
      }),
    );
  });

  it('throws NotFoundException when the admission does not exist', async () => {
    const { service } = buildFind(null);
    await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("uses the module's existing not-found message", async () => {
    const { service } = buildFind(null);
    let caught: unknown;
    try {
      await service.findById('missing-id');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).message).toBe(
      'Admission with id "missing-id" not found',
    );
  });

  it('does not convert an unexpected database error into a 404', async () => {
    const boom = new Error('connection terminated unexpectedly');
    const findUnique = jest.fn().mockRejectedValue(boom);
    const databaseService = {
      admission: { findUnique },
    } as unknown as DatabaseService;
    const service = new AdmissionService(
      databaseService,
      {} as unknown as AdmissionRepository,
    );
    let caught: unknown;
    try {
      await service.findById('adm-1');
    } catch (error) {
      caught = error;
    }
    // Must surface unchanged (=> HTTP 500), not be masked as a 404.
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(NotFoundException);
  });
});

describe('AdmissionService.updateById (partial update)', () => {
  let service: AdmissionService;
  let admissionUpdate: jest.Mock;
  let sectionFindUnique: jest.Mock;

  beforeEach(() => {
    admissionUpdate = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...EXISTING, ...data }),
    );
    sectionFindUnique = jest
      .fn()
      .mockResolvedValue({ id: 'section-1', classId: 'class-1' });

    const databaseService = {
      admission: {
        findUnique: jest.fn().mockResolvedValue(EXISTING),
        update: admissionUpdate,
      },
      section: { findUnique: sectionFindUnique },
    } as unknown as DatabaseService;

    const admissionRepository = {
      getFeePaymentByAdmissionId: jest.fn().mockResolvedValue(null),
      updateFeePaymentDet: jest.fn(),
    } as unknown as AdmissionRepository;

    service = new AdmissionService(databaseService, admissionRepository);
  });

  it('updates only the fields present in the patch', async () => {
    await service.updateById('adm-1', { studentName: 'Renamed' });
    expect(admissionUpdate).toHaveBeenCalledWith({
      where: { id: 'adm-1' },
      data: { studentName: 'Renamed' },
    });
  });

  it('does not treat an omitted classId as a class change on a confirmed admission', async () => {
    await expect(
      service.updateById('adm-1', { studentName: 'Renamed' }),
    ).resolves.toBeDefined();
    expect(sectionFindUnique).not.toHaveBeenCalled();
  });

  it('still refuses a real class change on a confirmed admission', async () => {
    await expect(
      service.updateById('adm-1', {
        classId: 'class-2',
        sectionId: 'section-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the section against the stored class when only sectionId is patched', async () => {
    await service.updateById('adm-1', { sectionId: 'section-1' });
    expect(sectionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'section-1' } }),
    );
  });

  it('rejects a patch with no updateable fields instead of performing a no-op', async () => {
    await expect(service.updateById('adm-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(admissionUpdate).not.toHaveBeenCalled();
  });

  it('rejects fee structure updates on confirmed admissions (immutability)', async () => {
    await expect(
      service.updateById('adm-1', {
        feePaymentHeaders: {
          feePaymentHeaderId: 'hdr-1',
          totalFeeAmount: 5000,
          grossAmount: 5000,
          discountAmount: 0,
          netAmount: 5000,
          feePaymentDetails: [],
        } as any,
      }),
    ).rejects.toThrow('Fee structure and obligations cannot be modified after admission confirmation.');
  });
});

describe('AdmissionService.updateStatusById (Confirmation & Concession Freezing)', () => {
  let service: AdmissionService;
  let tx: any;
  let databaseService: any;

  beforeEach(() => {
    tx = {
      admission: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      student: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      feePaymentHeader: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      feePaymentDetails: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      admissionFeeConcession: {
        update: jest.fn(),
      },
    };

    databaseService = {
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    const repository = {} as unknown as AdmissionRepository;
    service = new AdmissionService(databaseService as any, repository, {
      confirmAdmissionSchedules: jest.fn().mockResolvedValue(undefined),
    } as any);
  });

  it('confirms a consistent active included snapshot without rewriting financial values', async () => {
    const draftAdmission = {
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      studentName: 'Test Student',
      admissionSequence: 101,
      dateOfBirth: new Date(),
      gender: 'MALE',
    };

    tx.admission.findUnique.mockResolvedValue(draftAdmission);
    tx.student.findUnique.mockResolvedValue(null);
    tx.admission.update.mockResolvedValue({ ...draftAdmission, admissionStatus: 'CONFIRMED' });
    tx.student.create.mockResolvedValue({ id: 'stu-1' });
    tx.admission.findUniqueOrThrow.mockResolvedValue({
      ...draftAdmission,
      admissionStatus: 'CONFIRMED',
      student: { id: 'stu-1', studentNumber: '101', studentName: 'Test Student' },
    });

    tx.feePaymentHeader.findMany.mockResolvedValue([{
      id: 'header-1',
      grossAmount: 12000,
      discountAmount: 0,
      netAmount: 12000,
      totalFeeAmount: 12000,
      totalPaidAmount: 0,
      totalDueAmount: 12000,
      payments: [],
      installmentAllocations: [],
      feePaymentDetails: [
        {
          id: 'det-tuition',
          isActive: true,
          isIncluded: true,
          nameSnapshot: 'Tuition Fee',
          originalAmount: 10000,
          discountAmount: 0,
          finalAmount: 10000,
          totalAmountToBePaid: 10000,
          amountPaid: 0,
          discountApplicable: true,
          concession: null,
        },
        {
          id: 'det-exam',
          isActive: true,
          isIncluded: true,
          nameSnapshot: 'Exam Fee',
          originalAmount: 2000,
          discountAmount: 0,
          finalAmount: 2000,
          totalAmountToBePaid: 2000,
          amountPaid: 0,
          discountApplicable: false,
          concession: null,
        },
      ],
    }]);

    const result = await service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CONFIRMED');

    expect(result.admissionStatus).toBe('CONFIRMED');
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
  });

  it('rejects confirmation if admission is not in DRAFT status', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-already-confirmed',
      admissionStatus: 'CONFIRMED',
    });

    await expect(
      service.updateStatusById('adm-already-confirmed', { id: 'user-admin' }, 'CONFIRMED'),
    ).rejects.toThrow('cannot be confirmed from status CONFIRMED');
  });
});

describe('AdmissionService.updateFeeConfiguration consistency guards', () => {
  function build(detailRows: any[], headerOverrides: any = {}) {
    const tx: any = {
      $queryRaw: jest.fn(),
      admission: { findUnique: jest.fn() },
      feePaymentDetails: { findMany: jest.fn(), update: jest.fn() },
      feePaymentHeader: { findUnique: jest.fn(), update: jest.fn() },
      admissionFeeConcession: { update: jest.fn() },
      feePayment: { count: jest.fn().mockResolvedValue(0) },
      feePaymentInstallmentAllocation: { count: jest.fn().mockResolvedValue(0) },
      paymentReversalEvent: { count: jest.fn().mockResolvedValue(0) },
    };
    const header = {
      id: 'header-1',
      grossAmount: new Prisma.Decimal('100.00'),
      discountAmount: new Prisma.Decimal('0.00'),
      netAmount: new Prisma.Decimal('100.00'),
      totalFeeAmount: new Prisma.Decimal('100.00'),
      totalPaidAmount: new Prisma.Decimal('0.00'),
      totalDueAmount: new Prisma.Decimal('100.00'),
      ...headerOverrides,
      feePaymentDetails: detailRows.filter((d) => d.isActive),
    };
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft', admissionStatus: 'DRAFT', isActive: true, deletedAt: null,
      feePaymentHeaders: [header],
    });
    tx.feePaymentDetails.findMany.mockResolvedValue(detailRows.map(({ id, amountPaid }) => ({ id, amountPaid })));
    const database = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    return { service: new AdmissionService(database, {} as any), tx };
  }

  it('rejects when an inactive snapshot detail has a nonzero paid amount', async () => {
    const { service, tx } = build([
      { id: 'active-1', isActive: true, isIncluded: true, isMandatory: true, originalAmount: new Prisma.Decimal('100.00'), discountAmount: new Prisma.Decimal('0.00'), finalAmount: new Prisma.Decimal('100.00'), totalAmountToBePaid: new Prisma.Decimal('100.00'), amountPaid: new Prisma.Decimal('0.00') },
      { id: 'inactive-paid', isActive: false, isIncluded: false, isMandatory: false, amountPaid: new Prisma.Decimal('1.00') },
    ]);

    await expect(service.updateFeeConfiguration('adm-draft', { selectedFeeComponentIds: ['active-1'] } as any))
      .rejects.toThrow('Fee configuration cannot be changed after financial activity.');
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
  });

  it('rejects a mismatched totalFeeAmount before any configuration write', async () => {
    const { service, tx } = build([
      { id: 'active-1', isActive: true, isIncluded: true, isMandatory: true, originalAmount: new Prisma.Decimal('100.00'), discountAmount: new Prisma.Decimal('0.00'), finalAmount: new Prisma.Decimal('100.00'), totalAmountToBePaid: new Prisma.Decimal('100.00'), amountPaid: new Prisma.Decimal('0.00') },
    ], { totalFeeAmount: new Prisma.Decimal('99.99') });

    await expect(service.updateFeeConfiguration('adm-draft', { selectedFeeComponentIds: ['active-1'] } as any))
      .rejects.toThrow('Admission fee financial snapshot is inconsistent.');
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.admissionFeeConcession.update).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
  });
});
