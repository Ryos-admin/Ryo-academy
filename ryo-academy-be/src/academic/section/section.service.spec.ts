import { Test, TestingModule } from '@nestjs/testing';
import { SectionService } from './section.service';
import { DatabaseService } from '../../database/database.service';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('SectionService.remove', () => {
  let service: SectionService;
  let dbMock: Partial<DatabaseService>;

  const actorUserId = 'actor-1';
  const sectionId = 'section-1';

  beforeEach(async () => {
    dbMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as any,
      section: {
        findUnique: jest.fn().mockResolvedValue({
          id: sectionId,
          classId: 'class-1',
          class: { program: { academicYear: { schoolId: 'school-1' } } },
        } as any),
        update: jest.fn().mockResolvedValue({ id: sectionId } as any),
      } as any,
      admission: {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any,
      attendanceLogMaster: {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [SectionService, { provide: DatabaseService, useValue: dbMock }],
    }).compile();

    service = module.get<SectionService>(SectionService);
  });

  it('should soft‑delete when no blocking records', async () => {
    const result = await service.remove(sectionId, actorUserId);
    expect(result).toBeDefined();
    expect(dbMock.section!.update).toHaveBeenCalledWith({
      where: { id: sectionId },
      data: { isActive: false, deletedAt: expect.any(Date), deletedById: actorUserId },
    });
  });

  it('should block when active admission exists', async () => {
    (dbMock.admission!.findFirst as jest.Mock).mockResolvedValue({ id: 'adm-1' });
    await expect(service.remove(sectionId, actorUserId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('should allow deletion when only CANCELLED admissions exist', async () => {
    // Mock admission to return null (no DRAFT/CONFIRMED) even if a CANCELLED record could exist.
    (dbMock.admission!.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.remove(sectionId, actorUserId);
    expect(result).toBeDefined();
    expect(dbMock.section!.update).toHaveBeenCalledWith({
      where: { id: sectionId },
      data: { isActive: false, deletedAt: expect.any(Date), deletedById: actorUserId },
    });
  });

  it('should throw NotFoundException when section already soft‑deleted', async () => {
    // Simulate section record exists but is already soft‑deleted (isActive false)
    (dbMock.section!.findUnique as jest.Mock).mockResolvedValue({
      id: sectionId,
      classId: 'class-1',
      class: { program: { academicYear: { schoolId: 'school-1' } } },
      isActive: false,
    } as any);
    await expect(service.remove(sectionId, actorUserId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
