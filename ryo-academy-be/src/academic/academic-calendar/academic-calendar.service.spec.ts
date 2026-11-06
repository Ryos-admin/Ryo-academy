import { BadRequestException } from '@nestjs/common';
import { AcademicCalendarService } from './academic-calendar.service.js';
import { WeekdayDto } from './dto/seed-academic-calendar.dto.js';
import { DayType } from '../../../generated/prisma/enums.js';

describe('AcademicCalendarService', () => {
  const db = {
    academicCalendar: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    academicYear: {
      findUnique: jest.fn(),
    },
  } as any;

  let service: AcademicCalendarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AcademicCalendarService(db);
  });

  describe('generateCalendarRecords', () => {
    it('generates correct date records for a date range without transactions', () => {
      const records = service.generateCalendarRecords({
        academicYearId: 'year-1',
        startDate: '2026-06-01', // Monday
        endDate: '2026-06-07',   // Sunday
        weeklyOffDays: [WeekdayDto.SATURDAY, WeekdayDto.SUNDAY],
      });

      expect(records).toHaveLength(7);
      expect(records[0]).toMatchObject({
        academicYearId: 'year-1',
        dayType: DayType.WORKING_DAY,
        title: 'Working Day',
        isWorkingDay: true,
      });
      // Saturday is index 5
      expect(records[5]).toMatchObject({
        academicYearId: 'year-1',
        dayType: DayType.WEEKEND,
        title: 'Weekend',
        isWorkingDay: false,
      });
      // Sunday is index 6
      expect(records[6]).toMatchObject({
        academicYearId: 'year-1',
        dayType: DayType.WEEKEND,
        title: 'Weekend',
        isWorkingDay: false,
      });
    });

    it('throws BadRequestException if startDate is after endDate', () => {
      expect(() =>
        service.generateCalendarRecords({
          academicYearId: 'year-1',
          startDate: '2026-06-10',
          endDate: '2026-06-01',
          weeklyOffDays: [],
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('seed', () => {
    it('inserts records via createMany without opening an interactive transaction', async () => {
      db.academicCalendar.createMany.mockResolvedValue({ count: 7 });

      const result = await service.seed({
        academicYearId: 'year-1',
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        weeklyOffDays: [WeekdayDto.SUNDAY],
      });

      expect(db.academicCalendar.createMany).toHaveBeenCalledWith({
        data: expect.any(Array),
        skipDuplicates: true,
      });
      expect(result).toEqual({
        academicYearId: 'year-1',
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        created: 7,
        existing: 0,
      });
    });
  });
});
