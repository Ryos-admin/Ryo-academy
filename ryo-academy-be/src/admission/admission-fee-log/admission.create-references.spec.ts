import { BadRequestException } from '@nestjs/common';
import { AdmissionService } from './admission.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { Gender, Relation } from '../../../generated/prisma/enums.js';
import type { CreateAdmissionDto } from './dto/create-admission.dto.js';

const DTO: CreateAdmissionDto = {
  schoolId: 'school-1',
  academicYearId: 'year-1',
  programId: 'program-1',
  classId: 'class-1',
  sectionId: 'section-1',
  studentName: 'Test Student',
  gender: Gender.MALE,
  dateOfBirth: new Date('2015-05-05'),
  parentName: 'Parent',
  parentRelation: Relation.FATHER,
  parentPhone: '9800000000',
  parentAlternatePhone: '9800000001',
  parentEmail: 'parent@example.com',
  addressLine1: '1 Test St',
  addressLine2: 'Suite 2',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  postalCode: '411001',
  createdById: 'user-1',
  feePaymentHeaders: {} as CreateAdmissionDto['feePaymentHeaders'],
};

type Harness = {
  service: AdmissionService;
  sectionFindUnique: jest.Mock;
  generateSequenceNumber: jest.Mock;
  findFeeStructurebyId: jest.Mock;
  transaction: jest.Mock;
};

function build(opts: {
  section?: { id: string; classId: string } | null;
  feeStructure?: unknown;
  sequenceError?: Error;
} = {}): Harness {
  const sectionFindUnique = jest
    .fn()
    .mockResolvedValue('section' in opts ? opts.section : { id: 'section-1', classId: 'class-1' });
  const generateSequenceNumber = jest.fn(
    opts.sequenceError
      ? () => Promise.reject(opts.sequenceError)
      : () =>
          Promise.resolve({ academicSeq: 'ADM-2026-27-1', classCount: 0, schoolCode: 'school-1' }),
  );
  const findFeeStructurebyId = jest
    .fn()
    .mockResolvedValue(
      'feeStructure' in opts
        ? opts.feeStructure
        : { id: 'fs-1', totalAmount: 100, feeComponents: [{ id: 'fc-1' }] },
    );
  const transaction = jest.fn();

  const db = {
    section: { findUnique: sectionFindUnique },
    $transaction: transaction,
  } as unknown as DatabaseService;

  const repository = {
    generateSequenceNumber,
    findFeeStructurebyId,
  } as unknown as AdmissionRepository;

  return { service: new AdmissionService(db, repository), sectionFindUnique, generateSequenceNumber, findFeeStructurebyId, transaction };
}

describe('AdmissionService.create referenced-record handling', () => {
  it('keeps rejecting a missing section with a controlled 400', async () => {
    const h = build({ section: null });
    let caught: unknown;
    try {
      await h.service.create({ ...DTO });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe(
      'Section with id "section-1" not found',
    );
    // Section is validated before any sequence generation.
    expect(h.generateSequenceNumber).not.toHaveBeenCalled();
  });

  it('keeps rejecting a section from another class with a controlled 400', async () => {
    const h = build({ section: { id: 'section-1', classId: 'class-OTHER' } });
    let caught: unknown;
    try {
      await h.service.create({ ...DTO });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe(
      'Section does not belong to the selected class',
    );
  });

  it('propagates the repository reference failure unchanged (no masking)', async () => {
    const h = build({
      sequenceError: new BadRequestException(
        'Kindly check given school / academic year / Program / Classes.',
      ),
    });
    await expect(h.service.create({ ...DTO })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('keeps the fee-structure business rule intact', async () => {
    const h = build({ feeStructure: null });
    let caught: unknown;
    try {
      await h.service.create({ ...DTO });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toBe(
      'An active Fee Structure with at least one active Fee Component is required.',
    );
  });
});
