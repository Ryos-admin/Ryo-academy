import { BadRequestException } from '@nestjs/common';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { Prisma } from '../../../generated/prisma/client.js';
import './decimal-precision.js';

export const MONEY_STRING_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
export const DECIMAL_STRING_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function IsMoneyString(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isMoneyString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && MONEY_STRING_PATTERN.test(value),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be a decimal string with no more than two fractional digits.`,
      },
    });
  };
}

export function IsDecimalString(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isDecimalString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && DECIMAL_STRING_PATTERN.test(value),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be a decimal string without exponent notation.`,
      },
    });
  };
}

export function parseDecimalString(value: unknown, field = 'Value'): Prisma.Decimal {
  if (typeof value !== 'string' || !DECIMAL_STRING_PATTERN.test(value)) {
    throw new BadRequestException(
      `${field} must be a decimal string without exponent notation.`,
    );
  }
  return new Prisma.Decimal(value);
}

export function parseMoney(value: unknown, field = 'Amount'): Prisma.Decimal {
  if (typeof value !== 'string' || !MONEY_STRING_PATTERN.test(value)) {
    throw new BadRequestException(
      `${field} must be a decimal string with no more than two fractional digits.`,
    );
  }
  return parseDecimalString(value, field);
}

export function serializeMoney(
  value: Prisma.Decimal | null | undefined,
): string | null {
  return value == null ? null : value.toFixed();
}
