import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateAdmissionDto } from './update-admission.dto.js';

// Mirrors the global pipe configured in src/main.ts exactly, so these tests
// exercise the real whitelist / forbidNonWhitelisted behaviour.
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const validate = (body: unknown): Promise<UpdateAdmissionDto> =>
  pipe.transform(body, { type: 'body', metatype: UpdateAdmissionDto });

const messagesOf = async (body: unknown): Promise<string[]> => {
  try {
    await validate(body);
    return [];
  } catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as { message?: string[] };
      return response.message ?? [];
    }
    throw error;
  }
};

describe('UpdateAdmissionDto (PATCH /admission/:id)', () => {
  it('accepts a partial patch containing a single updateable field', async () => {
    await expect(validate({ studentName: 'Ada Lovelace' })).resolves.toBeInstanceOf(
      UpdateAdmissionDto,
    );
  });

  it('accepts a patch containing gender', async () => {
    const result = await validate({ gender: 'FEMALE' });
    expect(result.gender).toBe('FEMALE');
  });

  it('accepts a patch containing parentRelation', async () => {
    const result = await validate({ parentRelation: 'MOTHER' });
    expect(result.parentRelation).toBe('MOTHER');
  });

  it('accepts a patch containing multiple fields', async () => {
    const result = await validate({
      studentName: 'Grace Hopper',
      gender: 'FEMALE',
      parentRelation: 'GUARDIAN',
      city: 'Arlington',
    });
    expect(result).toMatchObject({
      studentName: 'Grace Hopper',
      gender: 'FEMALE',
      parentRelation: 'GUARDIAN',
      city: 'Arlington',
    });
  });

  it('rejects an unknown field via forbidNonWhitelisted', async () => {
    await expect(validate({ notAField: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await messagesOf({ notAField: 'x' })).toContain(
      'property notAField should not exist',
    );
  });

  it('does not reject a patch that omits every optional field', async () => {
    // An empty body is a DTO-level no-op; the service is what rejects it, so
    // validation itself must not be the thing that fails here.
    await expect(validate({})).resolves.toBeInstanceOf(UpdateAdmissionDto);
  });

  it('still rejects invalid values for the supplied fields', async () => {
    expect(await messagesOf({ gender: 'ROBOT' })).toContain(
      'gender must be one of the following values: MALE, FEMALE, OTHER',
    );
    expect(await messagesOf({ parentRelation: 'SIBLING' })).toContain(
      'parentRelation must be one of the following values: FATHER, MOTHER, GUARDIAN',
    );
    expect(await messagesOf({ parentEmail: 'not-an-email' })).toContain(
      'parentEmail must be an email',
    );
    expect(await messagesOf({ dateOfBirth: 'not-a-date' })).not.toHaveLength(0);
  });

  it('converts an ISO date string into a Date instance', async () => {
    const result = await validate({ dateOfBirth: '2010-05-15' });
    expect(result.dateOfBirth).toBeInstanceOf(Date);
  });
});
