import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdmissionService } from './admission.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AdmissionRepository } from './admission.repository.js';

const EXISTING = {
  id: 'adm-1',
  admissionStatus: 'CONFIRMED',
  classId: 'class-1',
  sectionId: 'section-1',
  studentName: 'Original Name',
};

describe('AdmissionService.findById (BUG-6: missing record must 404)', () => {
  const buildFind = (result: unknown) => {
    const findUnique = jest.fn().mockResolvedValue(result);
    const databaseService = {
      admission: { findUnique },
    } as unknown as DatabaseService;
    const repository = {} as unknown as AdmissionRepository;
    return { service: new AdmissionService(databaseService, repository), findUnique };
  };

  it('returns the admission when it exists', async () => {
    const record = { ...EXISTING, student: { id: 'stu-1', studentNumber: 'S-1', studentName: 'Original Name' } };
    const { service } = buildFind(record);
    await expect(service.findById('adm-1')).resolves.toEqual(record);
  });

  it('preserves the student include in the successful response', async () => {
    const { service, findUnique } = buildFind(EXISTING);
    await service.findById('adm-1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'adm-1' }) }),
    );
  });

  it('throws NotFoundException when the admission does not exist', async () => {
    const { service } = buildFind(null);
    await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses the module\'s existing not-found message', async () => {
    const { service } = buildFind(null);
    let caught: unknown;
    try {
      await service.findById('missing-id');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).message).toBe(
      'Admission with id "missing-id" not found',
    );
  });

  it('does not convert an unexpected database error into a 404', async () => {
    const boom = new Error('connection terminated unexpectedly');
    const findUnique = jest.fn().mockRejectedValue(boom);
    const databaseService = { admission: { findUnique } } as unknown as DatabaseService;
    const service = new AdmissionService(databaseService, {} as unknown as AdmissionRepository);
    let caught: unknown;
    try {
      await service.findById('adm-1');
    } catch (error) {
      caught = error;
    }
    // Must surface unchanged (=> HTTP 500), not be masked as a 404.
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(NotFoundException);
  });
});

describe('AdmissionService.updateById (partial update)', () => {
  let service: AdmissionService;
  let admissionUpdate: jest.Mock;
  let sectionFindUnique: jest.Mock;

  beforeEach(() => {
    admissionUpdate = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...EXISTING, ...data }),
    );
    sectionFindUnique = jest.fn().mockResolvedValue({ id: 'section-1', classId: 'class-1' });

    const databaseService = {
      admission: { findUnique: jest.fn().mockResolvedValue(EXISTING), update: admissionUpdate },
      section: { findUnique: sectionFindUnique },
    } as unknown as DatabaseService;

    const admissionRepository = {
      getFeePaymentByAdmissionId: jest.fn().mockResolvedValue(null),
      updateFeePaymentDet: jest.fn(),
    } as unknown as AdmissionRepository;

    service = new AdmissionService(databaseService, admissionRepository);
  });

  it('updates only the fields present in the patch', async () => {
    await service.updateById('adm-1', { studentName: 'Renamed' });
    expect(admissionUpdate).toHaveBeenCalledWith({
      where: { id: 'adm-1' },
      data: { studentName: 'Renamed' },
    });
  });

  it('does not treat an omitted classId as a class change on a confirmed admission', async () => {
    await expect(
      service.updateById('adm-1', { studentName: 'Renamed' }),
    ).resolves.toBeDefined();
    expect(sectionFindUnique).not.toHaveBeenCalled();
  });

  it('still refuses a real class change on a confirmed admission', async () => {
    await expect(
      service.updateById('adm-1', { classId: 'class-2', sectionId: 'section-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the section against the stored class when only sectionId is patched', async () => {
    await service.updateById('adm-1', { sectionId: 'section-1' });
    expect(sectionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'section-1' } }),
    );
  });

  it('rejects a patch with no updateable fields instead of performing a no-op', async () => {
    await expect(service.updateById('adm-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(admissionUpdate).not.toHaveBeenCalled();
  });
});
