import { NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service.js';

describe('StaffService lifecycle', () => {
  const db = {
    staff: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    teachingAssignment: { updateMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const users = {} as any;
  const password = {} as any;

  beforeEach(() => jest.clearAllMocks());

  it('unassigns active teaching assignments and disables the linked user transactionally', async () => {
    db.staff.findFirst.mockResolvedValue({ id: 'staff-1', userId: 'user-1', status: true, isActive: true, deletedAt: null, user: { schoolId: 'school-1' } });
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    const tx = {
      teachingAssignment: { updateMany: jest.fn() },
      user: { update: jest.fn() },
      staff: { update: jest.fn().mockResolvedValue({ id: 'staff-1', isActive: false }) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
    const service = new StaffService(db, password, users);

    await service.updateStatus('staff-1', false, 'actor-1');

    expect(tx.teachingAssignment.updateMany).toHaveBeenCalledWith({
      where: { staffId: 'staff-1', deletedAt: null },
      data: { staffId: null },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isActive: false, deletedAt: expect.any(Date), deletedById: 'actor-1' },
    });
    expect(tx.staff.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: false, isActive: false, deletedAt: expect.any(Date) }) }));
  });

  it('does not rerun the cascade for an already inactive staff record', async () => {
    db.staff.findFirst.mockResolvedValue({ id: 'staff-1', userId: 'user-1', status: false, isActive: false, deletedAt: new Date('2026-01-01'), user: { schoolId: 'school-1' } });
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    const service = new StaffService(db, password, users);

    await service.updateStatus('staff-1', false, 'actor-1');

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown staff record', async () => {
    db.staff.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    const service = new StaffService(db, password, users);
    await expect(service.updateStatus('missing', false, 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
