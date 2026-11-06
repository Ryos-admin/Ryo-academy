import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { AdmissionService } from './admission.service.js';
import { AdmissionRepository } from './admission.repository.js';
import { DatabaseService } from '../../database/database.service.js';
import type { CreateAdmissionDto } from './dto/create-admission.dto.js';

const components = [
  {
    id: 'tuition', name: 'Tuition', description: 'Core tuition',
    amount: new Prisma.Decimal('1000.00'), discountApplicable: true, isMandatory: true,
  },
  {
    id: 'library', name: 'Library', description: null,
    amount: new Prisma.Decimal('250.50'), discountApplicable: false, isMandatory: false,
  },
];

const master = {
  id: 'master-1', name: 'Standard Fees', description: 'Annual fees',
  totalAmount: new Prisma.Decimal('9999.00'),
  academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
  feeComponents: components,
};

const dto = (selectedFeeComponentIds: string[] = ['tuition']): CreateAdmissionDto => ({
  schoolId: 'school-1', academicYearId: 'year-1', programId: 'program-1',
  classId: 'class-1', sectionId: 'section-1', selectedFeeComponentIds,
  studentName: 'Test Student', gender: 'MALE' as any,
  dateOfBirth: new Date('2015-05-05'), parentName: 'Parent',
  parentRelation: 'FATHER' as any, parentPhone: '9800000000',
  parentAlternatePhone: '9800000001', parentEmail: 'parent@example.com',
  addressLine1: '1 Test St', addressLine2: '', city: 'Pune', state: 'Maharashtra',
  country: 'India', postalCode: '411001', createdById: 'user-1',
});

function build(masterMatches: unknown[] = [master], detailError?: Error) {
  let detailRows: any[] = [];
  let pendingWrites: string[] = [];
  let committedWrites: string[] = [];
  const tx = {
    admission: {
      create: jest.fn().mockImplementation(async () => {
        pendingWrites.push('admission');
        return { id: 'admission-1', academicYearId: 'year-1' };
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
        feePaymentHeaders: [{
          feePaymentDetails: detailRows.map((row, index) => ({ ...row, id: `detail-${index + 1}` })),
        }],
      })),
    },
    feePaymentHeader: { create: jest.fn().mockImplementation(async () => {
      pendingWrites.push('header');
      return { id: 'header-1' };
    }) },
    feePaymentDetails: {
      createMany: jest.fn().mockImplementation(async ({ data }: { data: any[] }) => {
        pendingWrites.push('details');
        if (detailError) throw detailError;
        detailRows = data;
      }),
    },
  };
  const transaction = jest.fn(async (work: (client: any) => Promise<unknown>) => {
    pendingWrites = [];
    try {
      const result = await work(tx);
      committedWrites = [...pendingWrites];
      return result;
    } catch (error) {
      pendingWrites = [];
      detailRows = [];
      throw error;
    }
  });
  const database = {
    section: { findUnique: jest.fn().mockResolvedValue({ id: 'section-1', classId: 'class-1' }) },
    $transaction: transaction,
  } as unknown as DatabaseService;
  const repository = {
    generateSequenceNumber: jest.fn().mockResolvedValue({
      academicSeq: 'ADM-2026-27-1', classCount: 0, schoolCode: 'school-1',
    }),
    findActiveFeeStructures: jest.fn().mockResolvedValue(masterMatches),
  } as unknown as AdmissionRepository;
  return {
    service: new AdmissionService(database, repository),
    repository,
    transaction,
    tx,
    get committedWrites() { return committedWrites; },
    get detailRows() { return detailRows; },
  };
}

describe('applicable fee configuration preview', () => {
  it('returns the unique active master and decimal-string component amounts', async () => {
    const h = build();
    const result = await h.service.getApplicableFeeConfiguration({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    });

    expect(result.feeStructure).toMatchObject({
      id: 'master-1', name: 'Standard Fees', totalAmount: '9999',
    });
    expect(result.components).toEqual([
      expect.objectContaining({
        id: 'tuition', originalAmount: '1000', isMandatory: true,
        isDiscountApplicable: true, initiallySelected: true, locked: true,
      }),
      expect.objectContaining({
        id: 'library', originalAmount: '250.5', isMandatory: false,
        isDiscountApplicable: false, initiallySelected: true, locked: false,
      }),
    ]);
    expect(h.repository.findActiveFeeStructures).toHaveBeenCalledWith({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    });
  });

  it('returns not found when no active master matches', async () => {
    await expect(build([]).service.getApplicableFeeConfiguration({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed when multiple active masters match', async () => {
    await expect(build([master, master]).service.getApplicableFeeConfiguration({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found when the matching master has no active components', async () => {
    await expect(build([{ ...master, feeComponents: [] }]).service.getApplicableFeeConfiguration({
      academicYearId: 'year-1', programId: 'program-1', classId: 'class-1',
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('selected-component admission creation', () => {
  it('creates all active snapshots and totals only selected components, ignoring master total', async () => {
    const h = build();
    const result = await h.service.create(dto(['tuition']));

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.repository.findActiveFeeStructures).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: 'year-1', programId: 'program-1', classId: 'class-1' }),
      h.tx,
    );
    expect(h.committedWrites).toEqual(['admission', 'header', 'details']);
    expect(h.tx.feePaymentHeader.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feeStructureId: 'master-1',
        grossAmount: expect.any(Prisma.Decimal),
        netAmount: expect.any(Prisma.Decimal),
        totalFeeAmount: expect.any(Prisma.Decimal),
        discountAmount: expect.any(Prisma.Decimal),
        totalPaidAmount: expect.any(Prisma.Decimal),
        totalDueAmount: expect.any(Prisma.Decimal),
      }),
    });
    const header = h.tx.feePaymentHeader.create.mock.calls[0][0].data;
    expect(header.grossAmount.eq('1000')).toBe(true);
    expect(header.netAmount.eq('1000')).toBe(true);
    expect(header.totalFeeAmount.eq('1000')).toBe(true);
    expect(header.totalDueAmount.eq('1000')).toBe(true);
    expect(header.discountAmount.isZero()).toBe(true);
    expect(header.totalPaidAmount.isZero()).toBe(true);

    expect(h.detailRows).toHaveLength(2);
    expect(h.detailRows.map(({ feeComponentId, isIncluded }) => [feeComponentId, isIncluded])).toEqual([
      ['tuition', true], ['library', false],
    ]);
    for (const row of h.detailRows) {
      expect(row.isActive).toBe(true);
      expect(row.discountAmount.isZero()).toBe(true);
      expect(row.finalAmount.eq(row.originalAmount)).toBe(true);
      expect(row.totalAmountToBePaid.eq(row.originalAmount)).toBe(true);
      expect(row.amountPaid.isZero()).toBe(true);
    }
    expect(result.feeConfiguration.grossAmount).toBe('1000');
    expect(result.feeConfiguration.components).toHaveLength(2);
    expect(result.feeConfiguration.components[1].included).toBe(false);
  });

  it.each(['unknown-id', 'component-from-another-master', 'inactive-component'])(
    'rejects selected ID %s when it is absent from the active resolved master', async (id) => {
      const h = build();
      await expect(h.service.create(dto(['tuition', id]))).rejects.toBeInstanceOf(BadRequestException);
      expect(h.tx.admission.create).not.toHaveBeenCalled();
      expect(h.tx.feePaymentHeader.create).not.toHaveBeenCalled();
    },
  );

  it('rejects omission of an active mandatory component before writes', async () => {
    const h = build();
    await expect(h.service.create(dto(['library']))).rejects.toThrow('must be selected');
    expect(h.tx.admission.create).not.toHaveBeenCalled();
  });

  it('allows a selected zero-amount component and keeps a zero header total', async () => {
    const zeroMaster = { ...master, feeComponents: [{ ...components[0], amount: new Prisma.Decimal(0) }] };
    const h = build([zeroMaster]);
    await h.service.create(dto(['tuition']));
    expect(h.tx.feePaymentHeader.create.mock.calls[0][0].data.grossAmount.isZero()).toBe(true);
  });

  it('propagates a snapshot-write failure through the interactive transaction', async () => {
    const failure = new Error('snapshot insert failed');
    const h = build([master], failure);
    await expect(h.service.create(dto())).rejects.toBe(failure);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.admission.create).toHaveBeenCalledTimes(1);
    expect(h.tx.feePaymentHeader.create).toHaveBeenCalledTimes(1);
    expect(h.committedWrites).toEqual([]);
    expect(h.detailRows).toEqual([]);
  });
});
