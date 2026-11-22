import { Prisma } from '../../../generated/prisma/client.js';
import { validate } from 'class-validator';
import { IsDecimalString, IsMoneyString, parseDecimalString, parseMoney, serializeMoney } from './money.util.js';

class MoneyInput {
  @IsMoneyString()
  amount!: string;
}

class DecimalInput {
  @IsDecimalString()
  value!: string;
}

describe('money boundary', () => {
  it.each([
    ['0', '0'],
    ['0.00', '0'],
    ['1', '1'],
    ['1.2', '1.2'],
    ['1.20', '1.2'],
    ['999999999999999999999999.99', '999999999999999999999999.99'],
  ])('parses %s as Decimal without binary conversion', (input, expected) => {
    expect(parseMoney(input).toString()).toBe(expected);
  });

  it.each([
    '1.234',
    '',
    '   ',
    'one',
    'NaN',
    'Infinity',
    '1e2',
    ' 1.00',
    '1.00 ',
  ])('rejects invalid decimal text %j', (input) => {
    expect(() => parseMoney(input)).toThrow();
  });

  it('rejects numeric JSON values instead of stringifying a lossy number', () => {
    expect(() => parseMoney(0.1 + 0.2)).toThrow();
  });

  it('rejects numeric JSON at the DTO validator boundary', async () => {
    const input = Object.assign(new MoneyInput(), { amount: 0.1 + 0.2 });
    expect(await validate(input)).toHaveLength(1);
  });

  it('preserves arbitrary decimal precision for percentage values while rejecting non-string forms', async () => {
    expect(parseDecimalString('12.34567890123456789').toString()).toBe('12.34567890123456789');
    expect(await validate(Object.assign(new DecimalInput(), { value: '12.34567890123456789' }))).toHaveLength(0);
    for (const value of [12.5, '1e2', ' 12.5']) {
      expect(() => parseDecimalString(value)).toThrow();
      expect(await validate(Object.assign(new DecimalInput(), { value }))).toHaveLength(1);
    }
  });

  it('adds and subtracts decimal strings without binary floating-point artifacts', () => {
    expect(parseMoney('0.10').plus(parseMoney('0.20')).toFixed()).toBe('0.3');
    expect(parseMoney('1.00').minus(parseMoney('0.90')).toFixed()).toBe('0.1');
  });

  it('serializes exact decimal strings without exponent notation and keeps nulls', () => {
    expect(serializeMoney(new Prisma.Decimal('999999999999999999999999.99'))).toBe(
      '999999999999999999999999.99',
    );
    expect(serializeMoney(new Prisma.Decimal('1.20'))).toBe('1.2');
    expect(serializeMoney(null)).toBeNull();
    expect(
      JSON.stringify({ amount: new Prisma.Decimal('999999999999999999999999.99'), label: 'fee' }),
    ).toBe('{"amount":"999999999999999999999999.99","label":"fee"}');
  });

  it('configures sufficient Decimal precision for wide monetary values', () => {
    expect(Prisma.Decimal.precision).toBe(100);
    expect(Prisma.Decimal.toExpNeg).toBe(-1000);
    expect(Prisma.Decimal.toExpPos).toBe(1000);
    expect(
      new Prisma.Decimal('999999999999999999999999999999999999999999999999999999999999999.99')
        .plus('0.01')
        .toFixed(),
    ).toBe('1000000000000000000000000000000000000000000000000000000000000000');
  });
});
