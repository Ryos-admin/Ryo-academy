import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdmissionService } from './admission.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';

const AcademicYearStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
} as const;

const EXISTING = {
  id: 'adm-1',
  admissionStatus: 'DRAFT',
  classId: 'class-1',
  sectionId: 'section-1',
  studentName: 'Original Name',
  isActive: true,
  deletedAt: null,
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

  it('rejects ordinary edits to confirmed admissions', async () => {
    const confirmedAdmission = { ...EXISTING, admissionStatus: 'CONFIRMED' };
    const databaseService = {
      admission: {
        findUnique: jest.fn().mockResolvedValue(confirmedAdmission),
        update: admissionUpdate,
      },
      section: { findUnique: sectionFindUnique },
    } as unknown as DatabaseService;
    const testService = new AdmissionService(databaseService, {} as any);

    await expect(
      testService.updateById('adm-1', { studentName: 'Renamed' }),
    ).rejects.toThrow('Ordinary admission editing is blocked after confirmation.');
    expect(admissionUpdate).not.toHaveBeenCalled();
  });
});

describe('AdmissionService.updateStatusById (Confirmation & Concession Freezing)', () => {
  let service: AdmissionService;
  let tx: any;
  let databaseService: any;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      admission: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      student: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'stu-1' }),
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
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-admin', schoolId: 'school-1' }),
      },
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
      admissionNumber: 'ADM-101',
      dateOfBirth: new Date(),
      gender: 'MALE',
      schoolId: 'school-1',
      isActive: true,
      deletedAt: null,
    };

    tx.admission.findUnique.mockResolvedValue(draftAdmission);
    tx.student.findUnique.mockResolvedValue(null);
    tx.admission.update.mockResolvedValue({ ...draftAdmission, admissionStatus: 'CONFIRMED', studentId: 'stu-1' });
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
      totalPaidAmount: 5000,
      totalDueAmount: 7000,
      payments: [
        {
          id: 'pay-1',
          admissionId: 'adm-draft',
          feePaymentHeaderId: 'header-1',
          amount: 5000,
          reversalEvent: null,
        },
      ],
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
          amountPaid: 5000,
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
    expect(result.student).toBeDefined();
    expect(tx.feePaymentDetails.update).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.update).not.toHaveBeenCalled();
  });

  it('rejects confirmation if admission is not in DRAFT status', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-cancelled',
      admissionStatus: 'CANCELLED',
      schoolId: 'school-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.updateStatusById('adm-cancelled', { id: 'user-admin' }, 'CONFIRMED'),
    ).rejects.toThrow('Cancelled admissions cannot be confirmed.');
  });
});

describe('AdmissionService.updateStatusById (Cancellation guards)', () => {
  let service: AdmissionService;
  let tx: any;
  let databaseService: any;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      admission: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      feePaymentHeader: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      feePayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      feePaymentInstallmentAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    databaseService = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-admin', schoolId: 'school-1' }),
      },
    };

    const repository = {} as unknown as AdmissionRepository;
    service = new AdmissionService(databaseService as any, repository);
  });

  it('rejects cancellation of a CONFIRMED admission with HTTP 409 Conflict', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-confirmed',
      admissionStatus: 'CONFIRMED',
      studentId: 'stu-1',
      schoolId: 'school-1',
    });

    await expect(
      service.updateStatusById('adm-confirmed', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toThrow('Confirmed admissions cannot be cancelled.');

    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation of an already CANCELLED admission with HTTP 409 Conflict', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-cancelled',
      admissionStatus: 'CANCELLED',
      schoolId: 'school-1',
    });

    await expect(
      service.updateStatusById('adm-cancelled', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toThrow('Admission is already cancelled.');

    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation with CANCELLATION_UNRESOLVED_PAYMENTS if unreversed payment exists', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.feePayment.findMany.mockResolvedValue([
      { id: 'pay-1', reversalEvent: null },
    ]);

    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_UNRESOLVED_PAYMENTS',
      },
    });

    expect(tx.admission.update).not.toHaveBeenCalled();
    expect(tx.student.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation with CANCELLATION_UNRESOLVED_PAYMENTS if header has non-zero totalPaidAmount', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.feePaymentHeader.findMany.mockResolvedValue([
      {
        id: 'hdr-1',
        totalPaidAmount: 500,
        feePaymentDetails: [],
        payments: [{ id: 'pay-1', reversalEvent: { id: 'rev-1' } }],
        installmentAllocations: [],
      },
    ]);
    tx.feePayment.findMany.mockResolvedValue([
      { id: 'pay-1', reversalEvent: { id: 'rev-1' } },
    ]);

    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_UNRESOLVED_PAYMENTS',
      },
    });

    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation with CANCELLATION_UNRESOLVED_PAYMENTS if detail component has non-zero amountPaid', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.feePaymentHeader.findMany.mockResolvedValue([
      {
        id: 'hdr-1',
        totalPaidAmount: 0,
        feePaymentDetails: [{ id: 'det-1', amountPaid: 200 }],
        payments: [{ id: 'pay-1', reversalEvent: { id: 'rev-1' } }],
        installmentAllocations: [],
      },
    ]);
    tx.feePayment.findMany.mockResolvedValue([
      { id: 'pay-1', reversalEvent: { id: 'rev-1' } },
    ]);

    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_UNRESOLVED_PAYMENTS',
      },
    });

    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation with CANCELLATION_UNRESOLVED_PAYMENTS if installment allocation is not fully reversed', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.feePayment.findMany.mockResolvedValue([
      { id: 'pay-1', reversalEvent: { id: 'rev-1' } },
    ]);
    tx.feePaymentInstallmentAllocation.findMany.mockResolvedValue([
      { id: 'alloc-1', allocatedAmount: 500, reversedAmount: 200 },
    ]);

    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_UNRESOLVED_PAYMENTS',
      },
    });

    expect(tx.admission.update).not.toHaveBeenCalled();
  });

  it('successfully cancels a DRAFT admission with fully reversed payments and zero balances', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.feePayment.findMany.mockResolvedValue([
      { id: 'pay-1', reversalEvent: { id: 'rev-1' } },
    ]);
    tx.feePaymentInstallmentAllocation.findMany.mockResolvedValue([
      { id: 'alloc-1', allocatedAmount: 500, reversedAmount: 500 },
    ]);
    tx.feePaymentHeader.findMany.mockResolvedValue([
      {
        id: 'hdr-1',
        totalPaidAmount: 0,
        feePaymentDetails: [{ id: 'det-1', amountPaid: 0 }],
        payments: [{ id: 'pay-1', reversalEvent: { id: 'rev-1' } }],
        installmentAllocations: [
          { id: 'alloc-1', allocatedAmount: 500, reversedAmount: 500 },
        ],
      },
    ]);
    tx.admission.update.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'CANCELLED',
      cancelledById: 'user-admin',
      cancelledAt: new Date(),
    });

    const result = await service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED');

    expect(result.admissionStatus).toBe('CANCELLED');
    expect(tx.admission.update).toHaveBeenCalledWith({
      where: { id: 'adm-draft' },
      data: {
        admissionStatus: 'CANCELLED',
        cancelledById: 'user-admin',
        cancelledAt: expect.any(Date),
      },
    });
  });

  it('successfully cancels a DRAFT admission without financial activity and writes cancellation audit fields', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.student.updateMany.mockResolvedValue({ count: 0 });
    tx.admission.update.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'CANCELLED',
      cancelledById: 'user-admin',
      cancelledAt: new Date(),
    });

    const result = await service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED');

    expect(result.admissionStatus).toBe('CANCELLED');
    expect(tx.admission.update).toHaveBeenCalledWith({
      where: { id: 'adm-draft' },
      data: {
        admissionStatus: 'CANCELLED',
        cancelledById: 'user-admin',
        cancelledAt: expect.any(Date),
      },
    });
    expect(tx.student.updateMany).toHaveBeenCalledWith({
      where: {
        admissionId: 'adm-draft',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
  });

  it('deactivates active linked student defensively when cancelling a DRAFT admission with an active student', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft-with-student',
      admissionStatus: 'DRAFT',
      studentId: 'stu-active-1',
      schoolId: 'school-1',
    });
    tx.student.updateMany.mockResolvedValue({ count: 1 });
    tx.admission.update.mockResolvedValue({
      id: 'adm-draft-with-student',
      admissionStatus: 'CANCELLED',
      cancelledById: 'user-admin',
      cancelledAt: new Date(),
    });

    const result = await service.updateStatusById('adm-draft-with-student', { id: 'user-admin' }, 'CANCELLED');

    expect(result.admissionStatus).toBe('CANCELLED');
    expect(tx.student.updateMany).toHaveBeenCalledWith({
      where: {
        admissionId: 'adm-draft-with-student',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    // Ensure deletedAt is NOT part of the deactivation payload (deactivated, not soft-deleted)
    const updateCall = tx.student.updateMany.mock.calls[0][0];
    expect(updateCall.data).toEqual({ isActive: false });
    expect(updateCall.data.deletedAt).toBeUndefined();
  });

  it('propagates error and rolls back when tx.student.updateMany fails during cancellation', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-draft',
      admissionStatus: 'DRAFT',
      schoolId: 'school-1',
    });
    tx.student.updateMany.mockRejectedValue(new Error('Student deactivation DB error'));

    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'CANCELLED'),
    ).rejects.toThrow('Student deactivation DB error');
  });

  it('rejects unsupported status with HTTP 400 BadRequest', async () => {
    await expect(
      service.updateStatusById('adm-draft', { id: 'user-admin' }, 'SUSPENDED'),
    ).rejects.toThrow('Unsupported admission status "SUSPENDED"');
  });

  it('preserves confirmation replay when status is CONFIRMED', async () => {
    tx.admission.findUnique.mockResolvedValue({
      id: 'adm-conf',
      admissionStatus: 'CONFIRMED',
      studentId: 'stu-1',
      student: { id: 'stu-1', admissionId: 'adm-conf' },
      schoolId: 'school-1',
      isActive: true,
      deletedAt: null,
    });
    tx.student = {
      findUnique: jest.fn().mockResolvedValue({ id: 'stu-1', admissionId: 'adm-conf' }),
    };

    const result = await service.updateStatusById('adm-conf', { id: 'user-admin' }, 'CONFIRMED');
    expect(result.isReplay).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(tx.admission.update).not.toHaveBeenCalled();
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

describe('AdmissionService.create (AcademicYear Lifecycle & Status Guards)', () => {
  const baseDto = {
    schoolId: 'school-1',
    academicYearId: 'ay-1',
    programId: 'program-1',
    classId: 'class-1',
    sectionId: 'section-1',
    studentName: 'Student One',
    gender: 'MALE' as const,
    dateOfBirth: new Date('2018-05-15'),
    parentName: 'Parent One',
    parentRelation: 'FATHER' as const,
    parentPhone: '9876543210',
    addressLine1: '123 Main St',
    city: 'City',
    state: 'State',
    country: 'India',
    postalCode: '500001',
    createdById: 'user-1',
    selectedFeeComponentIds: ['fc-1'],
    components: [{ feeComponentId: 'fc-1', discountPercentage: '0.00' }],
  };

  const sampleFeeStructure = {
    id: 'fs-1',
    name: 'Standard Fee Structure',
    description: null,
    totalAmount: 1000,
    academicYearId: 'ay-1',
    programId: 'program-1',
    classId: 'class-1',
    gstPercentage: new Prisma.Decimal('18.00'),
    isActive: true,
    deletedAt: null,
    feeComponents: [
      {
        id: 'fc-1',
        name: 'Tuition',
        amount: 1000,
        discountApplicable: true,
        isMandatory: true,
        isActive: true,
        deletedAt: null,
      },
    ],
  };

  function setup(ayRow: any = { id: 'ay-1', status: AcademicYearStatus.DRAFT, isActive: true, deletedAt: null }) {
    const tx: any = {
      $queryRaw: jest.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('AcademicYear')) {
          return ayRow ? [ayRow] : [];
        }
        return [{ id: 'fs-1' }];
      }),
      admission: {
        create: jest.fn().mockResolvedValue({ id: 'adm-new', academicYearId: 'ay-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'adm-new',
          academicYearId: 'ay-1',
          feePaymentHeaders: [
            {
              id: 'fph-new',
              pricingVersion: 'V0_SNAPSHOTTED',
              feePaymentDetails: [
                {
                  id: 'fpd-new',
                  feeComponentId: 'fc-1',
                  nameSnapshot: 'Tuition',
                  originalAmount: new Prisma.Decimal(1000),
                  discountPercentage: new Prisma.Decimal(0),
                  discountAmount: new Prisma.Decimal(0),
                  taxableAmount: new Prisma.Decimal(1000),
                  gstPercentage: new Prisma.Decimal(18),
                  gstAmount: new Prisma.Decimal(180),
                  finalAmount: new Prisma.Decimal(1180),
                  totalAmountToBePaid: new Prisma.Decimal(1180),
                  amountPaid: new Prisma.Decimal(0),
                  discountApplicable: true,
                  isMandatory: true,
                  isIncluded: true,
                },
              ],
            },
          ],
        }),
      },
      feeStructure: {
        findUnique: jest.fn().mockResolvedValue(sampleFeeStructure),
      },
      feePaymentHeader: {
        create: jest.fn().mockResolvedValue({ id: 'fph-new' }),
      },
      feePaymentDetails: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const databaseService: any = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      section: {
        findUnique: jest.fn().mockResolvedValue({ id: 'section-1', classId: 'class-1' }),
      },
    };

    const repository: any = {
      generateSequenceNumber: jest.fn().mockResolvedValue({
        academicSeq: 'ADM-AY1-001',
        classCount: 1,
        schoolCode: 'school-1',
      }),
      findActiveFeeStructures: jest.fn().mockResolvedValue([sampleFeeStructure]),
    };

    const service = new AdmissionService(databaseService, repository);
    return { service, tx, repository, databaseService };
  }

  it('succeeds in DRAFT AcademicYear with future startDate', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.DRAFT,
      startDate: new Date('2028-06-01'),
      isActive: true,
      deletedAt: null,
    });
    const result = await service.create(baseDto as any);
    expect(result).toBeDefined();
    expect(tx.admission.create).toHaveBeenCalledTimes(1);
    expect(tx.feePaymentHeader.create).toHaveBeenCalledTimes(1);
  });

  it('succeeds in DRAFT AcademicYear with past startDate', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.DRAFT,
      startDate: new Date('2025-06-01'),
      isActive: true,
      deletedAt: null,
    });
    const result = await service.create(baseDto as any);
    expect(result).toBeDefined();
    expect(tx.admission.create).toHaveBeenCalledTimes(1);
    expect(tx.feePaymentHeader.create).toHaveBeenCalledTimes(1);
  });

  it('succeeds in ACTIVE AcademicYear', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.ACTIVE,
      isActive: true,
      deletedAt: null,
    });
    const result = await service.create(baseDto as any);
    expect(result).toBeDefined();
    expect(tx.admission.create).toHaveBeenCalledTimes(1);
    expect(tx.feePaymentHeader.create).toHaveBeenCalledTimes(1);
  });

  it('rejects with HTTP 409 ConflictException when AcademicYear is CLOSED', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.CLOSED,
      isActive: true,
      deletedAt: null,
    });
    await expect(service.create(baseDto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.admission.create).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.create).not.toHaveBeenCalled();
    expect(tx.feePaymentDetails.createMany).not.toHaveBeenCalled();
  });

  it('preserves rejection when AcademicYear is inactive', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.DRAFT,
      isActive: false,
      deletedAt: null,
    });
    await expect(service.create(baseDto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.admission.create).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.create).not.toHaveBeenCalled();
  });

  it('preserves rejection when AcademicYear is soft-deleted', async () => {
    const { service, tx } = setup({
      id: 'ay-1',
      status: AcademicYearStatus.DRAFT,
      isActive: true,
      deletedAt: new Date(),
    });
    await expect(service.create(baseDto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.admission.create).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.create).not.toHaveBeenCalled();
  });

  it('preserves rejection when AcademicYear does not exist', async () => {
    const { service, tx, repository } = setup();
    repository.generateSequenceNumber.mockRejectedValueOnce(
      new NotFoundException('Academic year with id "ay-1" not found'),
    );
    await expect(service.create(baseDto as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.admission.create).not.toHaveBeenCalled();
    expect(tx.feePaymentHeader.create).not.toHaveBeenCalled();
  });
});
