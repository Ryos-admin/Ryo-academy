import {
  getKolkataBusinessDateUtc,
  hasAcademicYearStarted,
  isAcademicYearActiveOnBusinessDate,
} from './kolkata-business-date.js';

describe('Kolkata business-date boundaries', () => {
  it('uses the Asia/Kolkata calendar date across UTC midnight', () => {
    expect(getKolkataBusinessDateUtc(new Date('2026-05-31T19:00:00.000Z')).toISOString())
      .toBe('2026-06-01T00:00:00.000Z');
  });

  it('treats start and end dates as inclusive', () => {
    const start = new Date('2026-06-01T00:00:00.000Z');
    const end = new Date('2027-05-31T00:00:00.000Z');
    expect(isAcademicYearActiveOnBusinessDate(start, end, new Date('2026-06-01T00:00:00.000Z'))).toBe(true);
    expect(isAcademicYearActiveOnBusinessDate(start, end, new Date('2027-05-31T00:00:00.000Z'))).toBe(true);
    expect(isAcademicYearActiveOnBusinessDate(start, end, new Date('2027-06-01T00:00:00.000Z'))).toBe(false);
    expect(hasAcademicYearStarted(start, new Date('2026-06-01T00:00:00.000Z'))).toBe(true);
  });
});
