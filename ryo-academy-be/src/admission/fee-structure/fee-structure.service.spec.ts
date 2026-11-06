import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { Prisma } from '../../../generated/prisma/client.js';
import { FeeStructureService } from './fee-structure.service.js';
import { FeeStructureDto } from './dto/fee-structure.dto.js';

const year = {
  id: 'year-1',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2027-05-31T00:00:00.000Z'),
};

function database() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'fs-1' }]),
    academicYear: { findUnique: jest.fn().mockResolvedValue(year) },
    program: { findFirst: jest.fn().mockResolvedValue({ id: 'program-1' }) },
    class: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }) },
    feeStructure: {
      create: jest.fn().mockResolvedValue({ id: 'fs-1' }),
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fs-1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'fs-1', isActive: true, deletedAt: null, totalAmount: new Prisma.Decimal(100), academicYear: year,
      }),
      update: jest.fn().mockResolvedValue({ id: 'fs-1' }),
    },
    feeComponent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    feePaymentHeader: { findFirst: jest.fn().mockResolvedValue(null) },
    feePaymentDetails: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const db = {
    $transaction: jest.fn((callback: (tx: typeof tx) => unknown) => callback(tx)),
  };
  return { db, tx };
}

const base = {
  name: 'Standard Fee',
  description: 'Annual fee',
  academicYearId: 'year-1',
  programId: 'program-1',
  classId: 'class-1',
};

describe('FeeStructureService create', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('rejects missing and empty component lists at service and DTO boundaries', async () => {
    const { db } = database();
    const service = new FeeStructureService(db as any);
    await expect(service.create({ ...base, feeComponents: [] } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(base as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();

    const missing = Object.assign(new FeeStructureDto(), base);
    const empty = Object.assign(new FeeStructureDto(), { ...base, feeComponents: [] });
    expect(await validate(missing)).not.toHaveLength(0);
    expect(await validate(empty)).not.toHaveLength(0);
  });

  it('derives total from component amounts and ignores a mismatched client total', async () => {
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);
    await service.create({
      ...base,
      totalAmount: '999999.00',
      feeComponents: [
        { name: 'Tuition', amount: '70.10' },
        { name: 'Library', amount: '29.90' },
      ],
    } as any);

    expect(tx.feeStructure.create.mock.calls[0][0].data.totalAmount.toFixed()).toBe('100');
    expect(tx.feeComponent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ name: 'Tuition', amount: expect.any(Prisma.Decimal) }),
        expect.objectContaining({ name: 'Library', amount: expect.any(Prisma.Decimal) }),
      ]),
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate exact component names but does not normalize case or whitespace', async () => {
    const { db } = database();
    const service = new FeeStructureService(db as any);
    const component = (name: string) => ({ name, amount: '10.00' });
    await expect(service.create({ ...base, feeComponents: [component('Tuition'), component('Tuition')] } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).not.toHaveBeenCalled();

    await service.create({ ...base, feeComponents: [component('Tuition'), component('tuition ')] } as any);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps nested master and component writes in one transaction and propagates nested failure', async () => {
    const { db, tx } = database();
    tx.feeComponent.createMany.mockRejectedValueOnce(new Error('component insert failed'));
    const service = new FeeStructureService(db as any);
    await expect(service.create({ ...base, feeComponents: [{ name: 'Tuition', amount: '100.00' }] } as any))
      .rejects.toThrow('component insert failed');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.feeStructure.create).toHaveBeenCalledTimes(1);
    expect(tx.feeComponent.createMany).toHaveBeenCalledTimes(1);
  });

  it('preserves duplicate master-scope conflict handling', async () => {
    const { db } = database();
    db.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    const service = new FeeStructureService(db as any);
    await expect(service.create({ ...base, feeComponents: [{ name: 'Tuition', amount: '100.00' }] } as any))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks creation on the academic-year start date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:30:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);
    await expect(service.create({ ...base, feeComponents: [{ name: 'Tuition', amount: '100.00' }] } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeStructure.create).not.toHaveBeenCalled();
  });
});

describe('FeeStructureService mutation guards', () => {
  afterEach(() => jest.useRealTimers());

  it('blocks metadata update on the start date and never writes totalAmount independently', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:30:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);
    await expect(service.update('fs-1', { name: 'New Name' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('ignores a client total in an allowed metadata update', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:29:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);
    await service.update('fs-1', { name: 'New Name', totalAmount: '999.00' } as any);
    expect(tx.feeStructure.update.mock.calls[0][0].data).toEqual({ name: 'New Name' });
  });

  it('rejects PATCH deactivation when any payment header references the master', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { db, tx } = database();
    tx.feePaymentHeader.findFirst.mockResolvedValue({ id: 'header-1', isActive: false });
    const service = new FeeStructureService(db as any);

    await expect(service.update('fs-1', { isActive: false } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentHeader.findFirst).toHaveBeenCalledWith({ where: { feeStructureId: 'fs-1' } });
    expect(tx.feePaymentDetails.findFirst).not.toHaveBeenCalled();
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('rejects PATCH deactivation when historical fee details reference the master', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { db, tx } = database();
    tx.feePaymentDetails.findFirst.mockResolvedValue({ id: 'detail-1' });
    const service = new FeeStructureService(db as any);

    await expect(service.update('fs-1', { isActive: false } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentHeader.findFirst).toHaveBeenCalledWith({ where: { feeStructureId: 'fs-1' } });
    expect(tx.feePaymentDetails.findFirst).toHaveBeenCalledWith({ where: { feeComponent: { feeStructureId: 'fs-1' } } });
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('allows PATCH deactivation for an unused master before the academic year starts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);

    await service.update('fs-1', { isActive: false } as any);
    expect(tx.feePaymentHeader.findFirst).toHaveBeenCalledWith({ where: { feeStructureId: 'fs-1' } });
    expect(tx.feePaymentDetails.findFirst).toHaveBeenCalledWith({ where: { feeComponent: { feeStructureId: 'fs-1' } } });
    expect(tx.feeStructure.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  it('keeps PATCH deactivation blocked at the academic-year start without writes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:30:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);

    await expect(service.update('fs-1', { isActive: false } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentHeader.findFirst).not.toHaveBeenCalled();
    expect(tx.feePaymentDetails.findFirst).not.toHaveBeenCalled();
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('does not apply the deactivation reference guard to isActive true and still rejects reactivation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { db, tx } = database();
    tx.feePaymentHeader.findFirst.mockResolvedValue({ id: 'header-1' });
    const service = new FeeStructureService(db as any);

    await service.update('fs-1', { isActive: true } as any);
    expect(tx.feePaymentHeader.findFirst).not.toHaveBeenCalled();
    expect(tx.feeStructure.update.mock.calls[0][0].data).toEqual({ isActive: true });

    tx.feeStructure.findUnique.mockResolvedValueOnce({
      id: 'fs-1', isActive: false, deletedAt: new Date(), totalAmount: new Prisma.Decimal(100), academicYear: year,
    });
    await expect(service.update('fs-1', { isActive: true } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeStructure.update).toHaveBeenCalledTimes(1);
  });

  it('retains the unfiltered used-master deletion guard', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:29:00.000Z'));
    const { db, tx } = database();
    tx.feePaymentHeader.findFirst.mockResolvedValue({ id: 'header-1', isActive: false });
    const service = new FeeStructureService(db as any);
    await expect(service.delete('fs-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentHeader.findFirst).toHaveBeenCalledWith({ where: { feeStructureId: 'fs-1' } });
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('retains the payment-detail guard for DELETE', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { db, tx } = database();
    tx.feePaymentDetails.findFirst.mockResolvedValue({ id: 'detail-1' });
    const service = new FeeStructureService(db as any);

    await expect(service.delete('fs-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentDetails.findFirst).toHaveBeenCalledWith({ where: { feeComponent: { feeStructureId: 'fs-1' } } });
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('blocks unused master deletion once the academic year has started', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    const { db, tx } = database();
    const service = new FeeStructureService(db as any);
    await expect(service.delete('fs-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feePaymentHeader.findFirst).toHaveBeenCalledWith({ where: { feeStructureId: 'fs-1' } });
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });
});
