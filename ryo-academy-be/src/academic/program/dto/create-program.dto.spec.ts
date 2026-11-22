import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProgramDto } from './create-program.dto.js';
import { DayOfWeek } from '../../../../generated/prisma/client.js';

// Mirrors the global ValidationPipe configured in src/main.ts
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const validate = (body: unknown): Promise<CreateProgramDto> =>
  pipe.transform(body, { type: 'body', metatype: CreateProgramDto });

const getErrorMessages = async (body: unknown): Promise<string[]> => {
  try {
    await validate(body);
    return [];
  } catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as { message?: string[] | string };
      if (Array.isArray(response.message)) {
        return response.message;
      }
      return response.message ? [response.message] : [];
    }
    throw error;
  }
};

describe('CreateProgramDto validation', () => {
  const validBasePayload = {
    name: 'Primary Day Care',
    academicYear: 'ay-uuid-1',
    isPrimary: true,
    startTime: '08:00',
    endTime: '15:00',
  };

  it('accepts valid weekdays (MONDAY, TUESDAY, THURSDAY)', async () => {
    const payload = {
      ...validBasePayload,
      daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.THURSDAY],
    };

    const result = await validate(payload);
    expect(result).toBeInstanceOf(CreateProgramDto);
    expect(result.daysOfWeek).toEqual(['MONDAY', 'TUESDAY', 'THURSDAY']);
  });

  it('accepts all valid DayOfWeek enum values', async () => {
    const payload = {
      ...validBasePayload,
      daysOfWeek: [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ],
    };

    const result = await validate(payload);
    expect(result).toBeInstanceOf(CreateProgramDto);
    expect(result.daysOfWeek).toHaveLength(7);
  });

  it('rejects an invalid weekday spelling ("THRUSDAY") at the DTO layer', async () => {
    const payload = {
      ...validBasePayload,
      daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THRUSDAY', 'FRIDAY'],
    };

    await expect(validate(payload)).rejects.toBeInstanceOf(BadRequestException);

    const messages = await getErrorMessages(payload);
    expect(messages.some((m) => m.includes('each value in daysOfWeek must be one of the following values'))).toBe(true);
  });

  it('rejects non-array daysOfWeek values (string, number, object)', async () => {
    const stringPayload = {
      ...validBasePayload,
      daysOfWeek: 'MONDAY',
    };
    await expect(validate(stringPayload)).rejects.toBeInstanceOf(BadRequestException);
    const stringMessages = await getErrorMessages(stringPayload);
    expect(stringMessages).toContain('daysOfWeek must be an array');

    const numberPayload = {
      ...validBasePayload,
      daysOfWeek: 12345,
    };
    await expect(validate(numberPayload)).rejects.toBeInstanceOf(BadRequestException);
    const numberMessages = await getErrorMessages(numberPayload);
    expect(numberMessages).toContain('daysOfWeek must be an array');
  });

  it('rejects an empty array of daysOfWeek', async () => {
    const payload = {
      ...validBasePayload,
      daysOfWeek: [],
    };

    await expect(validate(payload)).rejects.toBeInstanceOf(BadRequestException);
    const messages = await getErrorMessages(payload);
    expect(messages).toContain('daysOfWeek should not be empty');
  });

  it('rejects missing daysOfWeek', async () => {
    const payload = { ...validBasePayload };

    await expect(validate(payload)).rejects.toBeInstanceOf(BadRequestException);
    const messages = await getErrorMessages(payload);
    expect(messages).toContain('daysOfWeek must be an array');
  });
});
