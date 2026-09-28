import { BadRequestException } from '@nestjs/common';
import { AdmissionRepository } from './admission.repository.js';
import { DatabaseService } from '../../database/database.service.js';

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
});
