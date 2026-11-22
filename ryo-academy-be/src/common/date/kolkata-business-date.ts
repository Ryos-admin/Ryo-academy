export function getKolkataBusinessDateUtc(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function isAcademicYearActiveOnBusinessDate(
  startDate: Date,
  endDate: Date,
  businessDate = getKolkataBusinessDateUtc(),
): boolean {
  const day = businessDate.getTime();
  return day >= toUtcDateOnly(startDate).getTime() && day <= toUtcDateOnly(endDate).getTime();
}

export function hasAcademicYearStarted(
  startDate: Date,
  businessDate = getKolkataBusinessDateUtc(),
): boolean {
  return businessDate.getTime() >= toUtcDateOnly(startDate).getTime();
}
