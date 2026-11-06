import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProgramService } from './program.service.js';
import { DayOfWeek } from '../../../generated/prisma/client.js';

describe('ProgramService.createPrgm', () => {
  const db = {
    academicYear: { findUnique: jest.fn() },
    program: { create: jest.fn() },
  } as any;

  let service: ProgramService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProgramService(db);
  });

  const validDto = {
    name: 'Day-Care Program',
    academicYear: 'ay-uuid-1',
    isPrimary: true,
    daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY],
    startTime: '08:00',
    endTime: '15:00',
  };

  it('creates program successfully with valid DayOfWeek weekdays', async () => {
    db.academicYear.findUnique.mockResolvedValue({ id: 'ay-uuid-1', name: '2026-27' });
    db.program.create.mockResolvedValue({
      id: 'program-uuid-1',
      name: 'Day-Care Program',
      academicYearId: 'ay-uuid-1',
      isPrimary: true,
      daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY],
      startTime: '08:00',
      endTime: '15:00',
      isActive: true,
    });

    const result = await service.createPrgm(validDto);

    expect(db.academicYear.findUnique).toHaveBeenCalledWith({
      where: { id: 'ay-uuid-1', isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });
    expect(db.program.create).toHaveBeenCalledWith({
      data: {
        name: 'Day-Care Program',
        academicYear: { connect: { id: 'ay-uuid-1' } },
        isPrimary: true,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY],
        startTime: '08:00',
        endTime: '15:00',
      },
    });
    expect(result.daysOfWeek).toEqual([DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]);
  });

  it('throws NotFoundException when academic year does not exist', async () => {
    db.academicYear.findUnique.mockResolvedValue(null);

    await expect(service.createPrgm(validDto)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.program.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when startTime >= endTime', async () => {
    db.academicYear.findUnique.mockResolvedValue({ id: 'ay-uuid-1', name: '2026-27' });

    const invalidTimes = {
      ...validDto,
      startTime: '15:00',
      endTime: '08:00',
    };

    await expect(service.createPrgm(invalidTimes)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.program.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when program name already exists for academic year (P2002)', async () => {
    db.academicYear.findUnique.mockResolvedValue({ id: 'ay-uuid-1', name: '2026-27' });
    db.program.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.createPrgm(validDto)).rejects.toBeInstanceOf(BadRequestException);
  });
});
