import { BadRequestException, ConflictException } from '@nestjs/common';
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
      academicCalendar: { updateMany: jest.fn(), deleteMany: jest.fn() },
      teachingAssignment: { updateMany: jest.fn() },
      academicYear: { update: jest.fn().mockResolvedValue({ id: 'year-1', isActive: false }) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
    const service = new AcademicYearService(db);

    await service.remove('year-1', 'actor-1');

    expect(tx.teachingAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: { in: ['class-1'] }, deletedAt: null }, data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }) }));
    expect(tx.academicCalendar.deleteMany).toHaveBeenCalled();
    expect(tx.section.updateMany).toHaveBeenCalled();
    expect(tx.class.updateMany).toHaveBeenCalled();
    expect(tx.program.updateMany).toHaveBeenCalled();
    expect(tx.academicYear.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'year-1' }, data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }) }));
  });
});

describe('AcademicYearService creation and calendar transaction', () => {
  const db = {
    academicYear: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const calendarService = {
    generateCalendarRecords: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('atomically creates academic year and bulk-inserts calendar within the same transaction', async () => {
    db.academicYear.findFirst.mockResolvedValue(null);
    const createdYear = { id: 'year-new', schoolId: 'school-1', name: '2026-2027', startDate: new Date('2026-06-01'), endDate: new Date('2027-05-31'), isActive: true };
    const calendarRecords = [
      { academicYearId: 'year-new', date: new Date('2026-06-01'), dayType: 'WORKING_DAY', title: 'Working Day', isWorkingDay: true },
    ];
    calendarService.generateCalendarRecords.mockReturnValue(calendarRecords);

    const tx = {
      academicYear: { create: jest.fn().mockResolvedValue(createdYear), update: jest.fn() },
      academicCalendar: { updateMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    const service = new AcademicYearService(db, calendarService);
    const result = await service.create({
      schoolId: 'school-1',
      name: '2026-2027',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
      weeklyOffDays: [] as any,
    });

    expect(result).toEqual(createdYear);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.academicYear.create).toHaveBeenCalledTimes(1);
    expect(calendarService.generateCalendarRecords).toHaveBeenCalledWith(expect.objectContaining({
      academicYearId: 'year-new',
    }));
    expect(tx.academicCalendar.createMany).toHaveBeenCalledWith({
      data: calendarRecords,
      skipDuplicates: true,
    });
  });

  it('propagates error and rolls back when calendar insertion fails', async () => {
    db.academicYear.findFirst.mockResolvedValue(null);
    const createdYear = { id: 'year-new', schoolId: 'school-1', name: '2026-2027' };
    calendarService.generateCalendarRecords.mockReturnValue([{ academicYearId: 'year-new' }]);

    const txError = new Error('Database insertion failed');
    const tx = {
      academicYear: { create: jest.fn().mockResolvedValue(createdYear) },
      academicCalendar: { updateMany: jest.fn(), createMany: jest.fn().mockRejectedValue(txError) },
    };
    db.$transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    const service = new AcademicYearService(db, calendarService);
    await expect(service.create({
      schoolId: 'school-1',
      name: '2026-2027',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
      weeklyOffDays: [] as any,
    })).rejects.toThrow('Database insertion failed');

    expect(tx.academicCalendar.createMany).toHaveBeenCalled();
  });

  it('rejects creation if active academic year with same name exists', async () => {
    db.academicYear.findFirst.mockResolvedValue({ id: 'year-1', isActive: true });
    const service = new AcademicYearService(db, calendarService);

    await expect(service.create({
      schoolId: 'school-1',
      name: '2026-2027',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-05-31'),
      weeklyOffDays: [] as any,
    })).rejects.toBeInstanceOf(ConflictException);

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('AcademicYearService startDate immutability', () => {
  afterEach(() => jest.useRealTimers());

  function setup() {
    const existing = {
      id: 'year-1',
      name: '2026-2027',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z'),
      isActive: true,
      deletedAt: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'year-1' }]),
      academicYear: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
      },
    };
    const db: any = {
      $transaction: jest.fn((callback: (tx: typeof tx) => unknown) => callback(tx)),
    };
    return { db, tx, service: new AcademicYearService(db), existing };
  }

  it('allows changing startDate before the existing start date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:29:00.000Z'));
    const { db, tx, service } = setup();
    await service.update('year-1', { startDate: new Date('2026-06-02T00:00:00.000Z') } as any);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.academicYear.update).toHaveBeenCalledWith({
      where: { id: 'year-1' },
      data: { startDate: new Date('2026-06-02T00:00:00.000Z') },
    });
  });

  it.each([
    ['on startDate', '2026-05-31T18:30:00.000Z'],
    ['after startDate', '2026-06-02T12:00:00.000Z'],
  ])('rejects an actual startDate change %s', async (_label, now) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const { tx, service } = setup();
    await expect(service.update('year-1', { startDate: new Date('2026-06-03T00:00:00.000Z') } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.academicYear.update).not.toHaveBeenCalled();
  });

  it('allows omitting or resubmitting the exact existing startDate after start', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    const omitted = setup();
    await omitted.service.update('year-1', { name: 'Renamed' } as any);
    expect(omitted.tx.academicYear.update).toHaveBeenCalledWith({ where: { id: 'year-1' }, data: { name: 'Renamed' } });

    const unchanged = setup();
    await unchanged.service.update('year-1', { startDate: new Date(unchanged.existing.startDate) } as any);
    expect(unchanged.tx.academicYear.update).toHaveBeenCalledWith({
      where: { id: 'year-1' },
      data: { startDate: unchanged.existing.startDate },
    });
  });

  it('retains start-before-end validation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T18:29:00.000Z'));
    const { tx, service } = setup();
    await expect(service.update('year-1', { endDate: new Date('2026-05-01T00:00:00.000Z') } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.academicYear.update).not.toHaveBeenCalled();
  });
});
