import { Test, TestingModule } from '@nestjs/testing';
import { ClassService } from './class.service';
import { DatabaseService } from '../../database/database.service';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ClassService.remove', () => {
  let service: ClassService;
  let dbMock: Partial<DatabaseService>;

  const actorUserId = 'actor-1';
  const classId = 'class-1';

  beforeEach(async () => {
    dbMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as any,
      class: {
        findUnique: jest.fn().mockResolvedValue({
          id: classId,
          programId: 'prog-1',
          program: { academicYear: { schoolId: 'school-1' } },
        } as any),
        update: jest.fn().mockResolvedValue({ id: classId } as any),
      } as any,
      admission: {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any,
      attendanceLogMaster: {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassService, { provide: DatabaseService, useValue: dbMock }],
    }).compile();

    service = module.get<ClassService>(ClassService);
  });

  it('should soft‑delete when no blocking records', async () => {
    const result = await service.remove(classId, actorUserId);
    expect(result).toBeDefined();
    expect(dbMock.class!.update).toHaveBeenCalledWith({
      where: { id: classId },
      data: { isActive: false, deletedAt: expect.any(Date), deletedById: actorUserId },
    });
  });

  it('should block when active admission exists', async () => {
    (dbMock.admission!.findFirst as jest.Mock).mockResolvedValue({ id: 'adm-1' });
    await expect(service.remove(classId, actorUserId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('should allow deletion when only CANCELLED admissions exist', async () => {
    // Mock admission to return null (no DRAFT/CONFIRMED) even if a CANCELLED record could exist.
    (dbMock.admission!.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.remove(classId, actorUserId);
    expect(result).toBeDefined();
    expect(dbMock.class!.update).toHaveBeenCalledWith({
      where: { id: classId },
      data: { isActive: false, deletedAt: expect.any(Date), deletedById: actorUserId },
    });
  });

  it('should throw NotFoundException when class already soft‑deleted', async () => {
    // Simulate class record exists but is already soft‑deleted (isActive false)
    (dbMock.class!.findUnique as jest.Mock).mockResolvedValue({
      id: classId,
      programId: 'prog-1',
      program: { academicYear: { schoolId: 'school-1' } },
      isActive: false,
    } as any);
    await expect(service.remove(classId, actorUserId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
