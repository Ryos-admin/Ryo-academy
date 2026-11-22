import { Prisma } from '../../../generated/prisma/client.js';
import { AdmissionInstallmentScheduleService } from './admission-installment-schedule.service.js';

const service = new AdmissionInstallmentScheduleService({} as any, {} as any, {} as any);

function txFor(schedule: any) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    admission: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admission-1' }) },
    feePaymentHeader: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'header-1', netAmount: new Prisma.Decimal(100), installmentSchedule: schedule,
      }]),
    },
  };
}

describe('confirmation installment validation', () => {
  it('allows zero net without a schedule', async () => {
    const tx = txFor({ installmentSchedule: null });
    tx.feePaymentHeader.findMany.mockResolvedValue([{
      id: 'header-1', netAmount: new Prisma.Decimal(0), installmentSchedule: null,
    }]);
    await expect(service.confirmAdmissionSchedules(tx, 'admission-1', undefined, new Map([['header-1', new Prisma.Decimal(0)]]))).resolves.toBeUndefined();
  });

  it('rejects existing schedule history for a zero-net obligation', async () => {
    const tx = txFor({ id: 'schedule-1', installments: [] });
    await expect(service.confirmAdmissionSchedules(tx, 'admission-1', undefined, new Map([['header-1', new Prisma.Decimal(0)]]))).rejects.toThrow('must not have an installment schedule');
  });

  it('requires a schedule for positive net', async () => {
    const tx = txFor(null);
    await expect(service.confirmAdmissionSchedules(tx, 'admission-1', undefined, new Map([['header-1', new Prisma.Decimal(100)]]))).rejects.toThrow('requires an existing installment schedule');
  });

  it('accepts an existing schedule whose header and installment totals match', async () => {
    const tx = txFor({
      id: 'schedule-1', totalAmount: new Prisma.Decimal(100),
      installments: [{ sequence: 1, amount: new Prisma.Decimal(100) }],
    });
    await expect(service.confirmAdmissionSchedules(tx, 'admission-1', undefined, new Map([['header-1', new Prisma.Decimal(100)]]))).resolves.toBeUndefined();
  });

  it('rejects a mismatched schedule without creating or changing schedule rows', async () => {
    const tx = txFor({
      id: 'schedule-1', totalAmount: new Prisma.Decimal(90),
      installments: [{ sequence: 1, amount: new Prisma.Decimal(90) }],
    });
    await expect(service.confirmAdmissionSchedules(tx, 'admission-1', undefined, new Map([['header-1', new Prisma.Decimal(100)]]))).rejects.toThrow('does not match validated header net obligation');
  });
});
