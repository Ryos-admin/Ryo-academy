import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ApplicableFeeConfigurationQueryDto,
  CreateAdmissionDto,
} from './create-admission.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

const validAdmission = {
  academicYearId: 'year-1', programId: 'program-1', classId: 'class-1', sectionId: 'section-1',
  selectedFeeComponentIds: ['component-1'], studentName: 'Test Student', gender: 'MALE',
  dateOfBirth: '2015-05-05', parentName: 'Parent', parentRelation: 'FATHER',
  parentPhone: '9800000000', parentAlternatePhone: '9800000001',
  parentEmail: 'parent@example.com', addressLine1: 'Address', addressLine2: '',
  city: 'Pune', state: 'Maharashtra', country: 'India', postalCode: '411001', createdById: 'user-1',
};

describe('CreateAdmissionDto selected fee components', () => {
  const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateAdmissionDto });

  it('requires selectedFeeComponentIds', async () => {
    const { selectedFeeComponentIds: _selected, ...body } = validAdmission;
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty selection', async () => {
    await expect(validate({ ...validAdmission, selectedFeeComponentIds: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicated component IDs', async () => {
    await expect(validate({ ...validAdmission, selectedFeeComponentIds: ['component-1', 'component-1'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects client-supplied fee header totals and snapshots', async () => {
    await expect(validate({ ...validAdmission, feePaymentHeaders: { grossAmount: '10.00' } })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ApplicableFeeConfigurationQueryDto', () => {
  const validate = (query: unknown) => pipe.transform(query, {
    type: 'query', metatype: ApplicableFeeConfigurationQueryDto,
  });

  it('requires all three dimensions', async () => {
    await expect(validate({ academicYearId: 'year-1', programId: 'program-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts complete string identifiers', async () => {
    await expect(validate({ academicYearId: 'year-1', programId: 'program-1', classId: 'class-1' }))
      .resolves.toBeInstanceOf(ApplicableFeeConfigurationQueryDto);
  });

  it('rejects non-string dimensions', async () => {
    await expect(validate({ academicYearId: 123, programId: 'program-1', classId: 'class-1' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
