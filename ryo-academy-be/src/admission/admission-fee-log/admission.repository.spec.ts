import { BadRequestException } from '@nestjs/common';
import { AdmissionRepository } from './admission.repository.js';
import { DatabaseService } from '../../database/database.service.js';

describe('AdmissionRepository.findActiveFeeStructures', () => {
  it('filters master dimensions and returns only active components in stable name order', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AdmissionRepository({ feeStructure: { findMany } } as unknown as DatabaseService);

    await repository.findActiveFeeStructures({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        academicYearId: 'year-1', programId: 'program-1', classId: 'class-1', isActive: true,
      },
      include: {
        feeComponents: { where: { isActive: true }, orderBy: { name: 'asc' } },
      },
    });
  });
});

const SCHOOL = { id: 'school-1', schoolCode: 'RYO' };
const YEAR = { id: 'year-1', name: '2026-27', schoolId: 'school-1' };
const PROGRAM = { id: 'program-1', name: 'Day Care' };
const CLASS_ENTITY = { id: 'class-1', name: 'Class-1A' };

type Harness = {
  repository: AdmissionRepository;
  programFindFirst: jest.Mock;
  classFindFirst: jest.Mock;
  academicYearFindFirst: jest.Mock;
  schoolFindUnique: jest.Mock;
};

function build(overrides: {
  school?: unknown;
  academicYear?: unknown;
  program?: unknown;
  classEntity?: unknown;
  programError?: Error;
} = {}): Harness {
  const schoolFindUnique = jest
    .fn()
    .mockResolvedValue('school' in overrides ? overrides.school : SCHOOL);
  const academicYearFindFirst = jest
    .fn()
    .mockResolvedValue('academicYear' in overrides ? overrides.academicYear : YEAR);
  const programFindFirst = jest.fn(
    overrides.programError
      ? () => Promise.reject(overrides.programError)
      : () =>
          Promise.resolve('program' in overrides ? overrides.program : PROGRAM),
  );
  const classFindFirst = jest
    .fn()
    .mockResolvedValue('classEntity' in overrides ? overrides.classEntity : CLASS_ENTITY);
  const count = jest.fn().mockResolvedValue(7);

  const db = {
    school: { findUnique: schoolFindUnique },
    academicYear: { findFirst: academicYearFindFirst },
    program: { findFirst: programFindFirst },
    class: { findFirst: classFindFirst },
    admission: { count },
  } as unknown as DatabaseService;

  return {
    repository: new AdmissionRepository(db),
    programFindFirst,
    classFindFirst,
    academicYearFindFirst,
    schoolFindUnique,
  };
}

const GUARD = 'Kindly check given school / academic year / Program / Classes.';

describe('AdmissionRepository.generateSequenceNumber', () => {
  it('still succeeds for a fully valid set of references', async () => {
    const h = build();
    const result = await h.repository.generateSequenceNumber(
      'school-1',
      'year-1',
      'program-1',
      'class-1',
    );
    expect(result.classCount).toBe(7);
    expect(result.academicSeq).toBeDefined();
    expect(result.schoolCode).toBeDefined();
  });

  it('returns a controlled 400 for a missing academic year', async () => {
    const h = build({ academicYear: null });
    await expect(
      h.repository.generateSequenceNumber('school-1', 'year-1', 'program-1', 'class-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a controlled 400 for a missing program', async () => {
    const h = build({ program: null });
    await expect(
      h.repository.generateSequenceNumber('school-1', 'year-1', 'program-1', 'class-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a controlled 400 for a program that belongs to another academic year', async () => {
    // This is the exact live failure: findFirst({ id, academicYearId }) misses.
    const h = build({ program: null });
    let caught: unknown;
    try {
      await h.repository.generateSequenceNumber(
        'school-1',
        'year-1',
        'program-other-year',
        'class-1',
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe(GUARD);
  });

  it('returns a controlled 400 for a missing class', async () => {
    const h = build({ classEntity: null });
    let caught: unknown;
    try {
      await h.repository.generateSequenceNumber(
        'school-1',
        'year-1',
        'program-1',
        'class-1',
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe(GUARD);
  });

  it('returns a controlled 400 for a missing school', async () => {
    const h = build({ school: null });
    await expect(
      h.repository.generateSequenceNumber('school-1', 'year-1', 'program-1', 'class-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does NOT convert an unexpected database failure into a client error', async () => {
    const boom = new Error('connection terminated unexpectedly');
    const h = build({ programError: boom });
    let caught: unknown;
    try {
      await h.repository.generateSequenceNumber(
        'school-1',
        'year-1',
        'program-1',
        'class-1',
      );
    } catch (error) {
      caught = error;
    }
    // The original error must surface untouched (=> HTTP 500), not be swallowed
    // into a 400 that would blame the client.
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(BadRequestException);
  });

  it('succeeds with a UUID-format school ID (H3 fix)', async () => {
    const uuid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
    const h = build({ school: { id: uuid, schoolCode: 'RYO' } });
    const result = await h.repository.generateSequenceNumber(
      uuid,
      'year-1',
      'program-1',
      'class-1',
    );
    expect(result.classCount).toBe(7);
    expect(result.academicSeq).toContain('RYO');
  });

  it('succeeds with a parenthesized school name/code format (H3 fix)', async () => {
    const h = build({ school: { id: 'school-1', schoolCode: 'RYO' } });
    const result = await h.repository.generateSequenceNumber(
      'Ryo Academy (RYO)',
      'year-1',
      'program-1',
      'class-1',
    );
    expect(result.classCount).toBe(7);
    expect(result.academicSeq).toContain('RYO');
  });
});

describe('AdmissionRepository.getFeePaymentByAdmissionId (C3 fix)', () => {
  it('returns a single typed header object with its fee payment details', async () => {
    const mockHeader = {
      id: 'header-1',
      admissionId: 'adm-1',
      feeStructureId: 'fs-1',
      totalFeeAmount: 100000,
      feePaymentDetails: [
        { id: 'det-1', nameSnapshot: 'Tuition', amountPaid: 0 },
      ],
    };
    const db = {
      feePaymentHeader: {
        findFirst: jest.fn().mockResolvedValue(mockHeader),
      },
    } as unknown as DatabaseService;

    const repo = new AdmissionRepository(db);
    const result = await repo.getFeePaymentByAdmissionId('adm-1');

    expect(result).toBeDefined();
    expect(result?.id).toBe('header-1');
    expect(result?.feeStructureId).toBe('fs-1');
    expect(Array.isArray(result?.feePaymentDetails)).toBe(true);
    expect(result?.feePaymentDetails.length).toBe(1);
    // Verifies it is NOT array-spread object like { '0': { ... } }
    expect((result as any)['0']).toBeUndefined();
  });

  it('returns null when no fee payment header exists for admission', async () => {
    const db = {
      feePaymentHeader: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as DatabaseService;

    const repo = new AdmissionRepository(db);
    const result = await repo.getFeePaymentByAdmissionId('adm-none');
    expect(result).toBeNull();
  });
});

describe('AdmissionRepository.updateFeePaymentDet (C3 transactional execution)', () => {
  it('updates existing header and details inside a single database transaction', async () => {
    const headerUpdate = jest.fn().mockResolvedValue({ id: 'header-1', feeStructureId: 'fs-1' });
    const detailUpdate = jest.fn().mockResolvedValue({ id: 'det-1' });
    const tx = {
      feePaymentHeader: {
        update: headerUpdate,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'header-1',
          feeStructureId: 'fs-1',
          feePaymentDetails: [{ id: 'det-1' }],
        }),
      },
      feePaymentDetails: {
        update: detailUpdate,
      },
    };
    const db = {
      $transaction: jest.fn((cb: any) => cb(tx)),
    } as unknown as DatabaseService;

    const repo = new AdmissionRepository(db);
    const dto: any = {
      id: 'header-1',
      feeStructureId: 'fs-1',
      totalPaidAmount: '50000',
      feePaymentDetails: [{ id: 'det-1', originalAmount: '50000', discountAmount: '0', amountPaid: '50000' }],
    };

    const result = await repo.updateFeePaymentDet(dto, 'fs-1');
    expect(db.$transaction).toHaveBeenCalled();
    expect(headerUpdate).toHaveBeenCalled();
    expect(detailUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'det-1' },
      }),
    );
    expect(result.id).toBe('header-1');
  });

  it('rolls back transaction if a detail update fails', async () => {
    const db = {
      $transaction: jest.fn(async (cb: any) => {
        const tx = {
          feePaymentHeader: {
            update: jest.fn().mockResolvedValue({ id: 'header-1' }),
          },
          feePaymentDetails: {
            update: jest.fn().mockRejectedValue(new Error('Detail DB write failed')),
          },
        };
        return cb(tx);
      }),
    } as unknown as DatabaseService;

    const repo = new AdmissionRepository(db);
    const dto: any = {
      id: 'header-1',
      feeStructureId: 'fs-1',
      feePaymentDetails: [{ id: 'det-1', originalAmount: '50000', discountAmount: '0', amountPaid: '50000' }],
    };

    await expect(repo.updateFeePaymentDet(dto, 'fs-1')).rejects.toThrow('Detail DB write failed');
  });
});
