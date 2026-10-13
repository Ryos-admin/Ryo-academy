import { ConflictException } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service.js';

describe('AcademicYearService soft deletion', () => {
  const db = {
    academicYear: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    admission: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('rejects deletion when an active confirmed enrollment exists before opening a transaction', async () => {
    db.academicYear.findFirst.mockResolvedValue({ id: 'year-1', isActive: true, deletedAt: null });
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    db.admission.findFirst.mockResolvedValue({ id: 'admission-1' });
    const service = new AcademicYearService(db);

    await expect(service.remove('year-1', 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('soft-deletes owned structures and assignments atomically when no active enrollment exists', async () => {
    db.academicYear.findFirst.mockResolvedValue({ id: 'year-1', isActive: true, deletedAt: null });
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    db.admission.findFirst.mockResolvedValue(null);
    const tx = {
      program: { findMany: jest.fn().mockResolvedValue([{ id: 'program-1' }],), updateMany: jest.fn() },
      class: { findMany: jest.fn().mockResolvedValue([{ id: 'class-1' }]), updateMany: jest.fn() },
      section: { updateMany: jest.fn() },
      academicCalendar: { updateMany: jest.fn() },
      teachingAssignment: { updateMany: jest.fn() },
      academicYear: { update: jest.fn().mockResolvedValue({ id: 'year-1', isActive: false }) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
    const service = new AcademicYearService(db);

    await service.remove('year-1', 'actor-1');

    expect(tx.teachingAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: { in: ['class-1'] }, deletedAt: null }, data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }) }));
    expect(tx.academicCalendar.updateMany).toHaveBeenCalled();
    expect(tx.section.updateMany).toHaveBeenCalled();
    expect(tx.class.updateMany).toHaveBeenCalled();
    expect(tx.program.updateMany).toHaveBeenCalled();
    expect(tx.academicYear.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'year-1' }, data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }) }));
  });
});
