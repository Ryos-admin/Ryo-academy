import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { FeeComponentService } from './fee-component.service.js';

const year = {
  id: 'year-1',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2027-05-31T00:00:00.000Z'),
};

function harness(initialAmount = '100.00', storedTotal = initialAmount) {
  let total = new Prisma.Decimal(storedTotal);
  let components: any[] = [{
    id: 'component-1', name: 'Tuition', amount: new Prisma.Decimal(initialAmount),
    feeStructureId: 'fs-1', isActive: true, deletedAt: null,
  }];
  const state = {
    get total() { return total; },
    get components() { return components; },
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'fs-1' }]),
    feeStructure: {
      findUnique: jest.fn().mockImplementation(async () => ({
        id: 'fs-1', isActive: true, deletedAt: null, totalAmount: total,
        academicYear: year,
        feeComponents: components.filter((item) => item.isActive),
      })),
      update: jest.fn().mockImplementation(async ({ data }) => {
        total = data.totalAmount;
        return { id: 'fs-1', totalAmount: total };
      }),
    },
    feeComponent: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const item = components.find((component) => component.id === where.id);
        return item ? { feeStructureId: item.feeStructureId } : null;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }) =>
        components.find((item) => item.feeStructureId === where.feeStructureId && item.name === where.name) ?? null,
      ),
      findMany: jest.fn().mockImplementation(async () => components.filter((item) => item.isActive)),
      create: jest.fn().mockImplementation(async ({ data }) => {
        const created = { id: `component-${components.length + 1}`, ...data, isActive: true, deletedAt: null };
        components = [...components, created];
        return created;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        components = components.map((item) => item.id === where.id ? { ...item, ...data } : item);
        return components.find((item) => item.id === where.id);
      }),
    },
    feePaymentDetails: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const db: any = {
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => {
      const originalComponents = [...components];
      const originalTotal = total;
      try {
        return await callback(tx);
      } catch (error) {
        components = originalComponents;
        total = originalTotal;
        throw error;
      }
    }),
    feeComponent: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  return { db, tx, state, service: new FeeComponentService(db) };
}

describe('FeeComponentService mutation consistency', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('adds a component and recomputes total inside one parent-locked transaction', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    const { db, tx, state, service } = harness();
    await service.create({ feeStructureId: 'fs-1', name: 'Library', amount: '25.25' } as any);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(state.total.toFixed()).toBe('125.25');
    expect(tx.feeStructure.update).toHaveBeenCalledTimes(1);
  });

  it('rejects an existing total mismatch before adding or changing records', async () => {
    const { tx, state, service } = harness('100.00', '90.00');
    await expect(service.create({ feeStructureId: 'fs-1', name: 'Library', amount: '25.00' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeComponent.create).not.toHaveBeenCalled();
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
    expect(state.components).toHaveLength(1);
  });

  it('rolls back a component insert when master-total persistence fails', async () => {
    const { db, tx, state, service } = harness();
    tx.feeStructure.update.mockRejectedValueOnce(new Error('master update failed'));
    await expect(service.create({ feeStructureId: 'fs-1', name: 'Library', amount: '25.00' } as any))
      .rejects.toThrow('master update failed');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(state.components).toHaveLength(1);
    expect(state.total.toFixed()).toBe('100');
  });

  it('allows adding during the inclusive academic-year window and blocks after endDate', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-05-31T12:00:00.000Z'));
    const active = harness();
    await active.service.create({ feeStructureId: 'fs-1', name: 'Library', amount: '10.00' } as any);
    expect(active.state.total.toFixed()).toBe('110');

    jest.setSystemTime(new Date('2027-05-31T18:30:00.000Z'));
    const expired = harness();
    await expect(expired.service.create({ feeStructureId: 'fs-1', name: 'Library', amount: '10.00' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(expired.tx.feeComponent.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate exact names and leaves differently cased or spaced names distinct', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const duplicate = harness();
    await expect(duplicate.service.create({ feeStructureId: 'fs-1', name: 'Tuition', amount: '10.00' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(duplicate.tx.feeComponent.create).not.toHaveBeenCalled();

    const distinct = harness();
    await distinct.service.create({ feeStructureId: 'fs-1', name: 'tuition ', amount: '10.00' } as any);
    expect(distinct.state.total.toFixed()).toBe('110');
  });

  it('recomputes total after amount update and rejects a stale total without writes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const valid = harness();
    await valid.service.update('component-1', { amount: '120.00' } as any);
    expect(valid.state.total.toFixed()).toBe('120');

    const stale = harness('100.00', '90.00');
    await expect(stale.service.update('component-1', { amount: '120.00' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(stale.tx.feeComponent.update).not.toHaveBeenCalled();
    expect(stale.tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('rejects metadata-only updates when the stored master total is stale', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { tx, service } = harness('100.00', '90.00');
    await expect(service.update('component-1', { name: 'Renamed Tuition' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeComponent.update).not.toHaveBeenCalled();
    expect(tx.feeComponent.create).not.toHaveBeenCalled();
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('allows metadata-only updates when the stored master total is consistent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { tx, state, service } = harness();
    await service.update('component-1', { name: 'Renamed Tuition' } as any);
    expect(tx.feeComponent.update).toHaveBeenCalledWith({
      where: { id: 'component-1' },
      data: { name: 'Renamed Tuition' },
    });
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
    expect(state.total.toFixed()).toBe('100');
  });

  it('blocks existing-component edits during the year, including metadata-only edits', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    const { tx, service } = harness();
    await expect(service.update('component-1', { name: 'New name' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeComponent.update).not.toHaveBeenCalled();
  });

  it.each([
    ['during', '2026-06-01T12:00:00.000Z'],
    ['after', '2027-05-31T18:30:00.000Z'],
  ])('blocks component amount edits and soft deletion %s the academic year', async (_label, now) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const editing = harness();
    await expect(editing.service.update('component-1', { amount: '120.00' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(editing.tx.feeComponent.update).not.toHaveBeenCalled();

    const deleting = harness();
    await expect(deleting.service.delete('component-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(deleting.tx.feeComponent.update).not.toHaveBeenCalled();
  });

  it('recomputes after soft deletion while preserving the referenced-detail guard', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const valid = harness();
    await valid.service.delete('component-1', 'actor-1');
    expect(valid.state.total.toFixed()).toBe('0');

    const referenced = harness();
    referenced.tx.feePaymentDetails.findFirst.mockResolvedValue({ id: 'detail-1' });
    await expect(referenced.service.delete('component-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(referenced.tx.feeComponent.update).not.toHaveBeenCalled();
    expect(referenced.tx.feeStructure.update).not.toHaveBeenCalled();
  });

  it('rejects stale total before soft deletion without changing either record', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const { tx, state, service } = harness('100.00', '99.00');
    await expect(service.delete('component-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.feeComponent.update).not.toHaveBeenCalled();
    expect(tx.feeStructure.update).not.toHaveBeenCalled();
    expect(state.components[0].isActive).toBe(true);
  });

  it('retains not-found behavior', async () => {
    const { service } = harness();
    await expect(service.update('missing', {} as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
