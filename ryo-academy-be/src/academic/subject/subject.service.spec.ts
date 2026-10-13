import { SubjectService } from './subject.service.js';

describe('SubjectService soft deletion', () => {
  const db = {
    class: { findFirst: jest.fn() },
    subjects: { findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes the subject and active assignments in one transaction', async () => {
    db.subjects.findFirst.mockResolvedValue({ id: 'subject-1', isActive: true, deletedAt: null });
    db.user.findUnique.mockResolvedValue({ schoolId: 'school-1' });
    const tx = {
      teachingAssignment: { updateMany: jest.fn() },
      subjects: { update: jest.fn().mockResolvedValue({ id: 'subject-1', isActive: false }) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
    const service = new SubjectService(db);

    await service.remove('subject-1', 'actor-1');

    expect(tx.teachingAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { subjectId: 'subject-1', isActive: true, deletedAt: null }, data: { isActive: false, deletedAt: expect.any(Date), deletedById: 'actor-1' } }));
    expect(tx.subjects.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'subject-1' }, data: { isActive: false, deletedAt: expect.any(Date), deletedById: 'actor-1' } }));
  });
});
