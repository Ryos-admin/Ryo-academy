import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolsService } from './schools.service.js';
import { DatabaseService } from '../database/database.service.js';

describe('SchoolsService', () => {
  let service: SchoolsService;
  let db: {
    user: { findUnique: jest.Mock };
    school: { findUnique: jest.Mock; update: jest.Mock };
    academicYear: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn() },
      school: { findUnique: jest.fn(), update: jest.fn() },
      academicYear: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new SchoolsService(db as unknown as DatabaseService);
  });

  describe('resolveActiveSchool (Canonical Tenant Resolution)', () => {
    it('resolves active school for a valid active user and active school', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: 'school-1',
        isActive: true,
        deletedAt: null,
      });
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        isActive: true,
      });

      const schoolId = await service.resolveActiveSchool('u-1');
      expect(schoolId).toBe('school-1');
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        select: { id: true, schoolId: true, isActive: true, deletedAt: true },
      });
      expect(db.school.findUnique).toHaveBeenCalledWith({
        where: { id: 'school-1' },
        select: { id: true, isActive: true },
      });
    });

    it('rejects when user does not exist', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.resolveActiveSchool('non-existent')).rejects.toThrow(
        new ForbiddenException('User is inactive or deleted'),
      );
    });

    it('rejects when user is inactive', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: 'school-1',
        isActive: false,
        deletedAt: null,
      });
      await expect(service.resolveActiveSchool('u-1')).rejects.toThrow(
        new ForbiddenException('User is inactive or deleted'),
      );
    });

    it('rejects when user is soft-deleted', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: 'school-1',
        isActive: true,
        deletedAt: new Date('2026-10-01'),
      });
      await expect(service.resolveActiveSchool('u-1')).rejects.toThrow(
        new ForbiddenException('User is inactive or deleted'),
      );
    });

    it('rejects when user has no associated schoolId', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: null,
        isActive: true,
        deletedAt: null,
      });
      await expect(service.resolveActiveSchool('u-1')).rejects.toThrow(
        new ForbiddenException('A school-scoped user is required'),
      );
    });

    it('rejects when school does not exist', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: 'school-missing',
        isActive: true,
        deletedAt: null,
      });
      db.school.findUnique.mockResolvedValue(null);
      await expect(service.resolveActiveSchool('u-1')).rejects.toThrow(
        new ForbiddenException('School is inactive or not found'),
      );
    });

    it('rejects when school is inactive', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u-1',
        schoolId: 'school-inactive',
        isActive: true,
        deletedAt: null,
      });
      db.school.findUnique.mockResolvedValue({
        id: 'school-inactive',
        isActive: false,
      });
      await expect(service.resolveActiveSchool('u-1')).rejects.toThrow(
        new ForbiddenException('School is inactive or not found'),
      );
    });
  });

  describe('getConfiguration', () => {
    it('throws NotFoundException if school does not exist', async () => {
      db.school.findUnique.mockResolvedValue(null);
      await expect(service.getConfiguration('school-x')).rejects.toThrow(
        new NotFoundException('School not found'),
      );
    });

    it('returns unconfigured status when activeAcademicYearId is null', async () => {
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: null,
        activeAcademicYear: null,
      });

      const res = await service.getConfiguration('school-1');
      expect(res).toEqual({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: null,
        activeAcademicYear: null,
        isConfigured: false,
        isInvalid: false,
      });
    });

    it('returns configured status with year summary when activeAcademicYear is valid and active', async () => {
      const now = new Date();
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-1',
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-05-31'),
          isActive: true,
          deletedAt: null,
        },
      });

      const res = await service.getConfiguration('school-1');
      expect(res).toEqual({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-1',
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-05-31'),
          isActive: true,
        },
        isConfigured: true,
        isInvalid: false,
      });
    });

    it('marks configuration as invalid if configured academic year was soft-deleted', async () => {
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-deleted',
        activeAcademicYear: {
          id: 'ay-deleted',
          name: 'AY 2025-26',
          startDate: new Date('2025-06-01'),
          endDate: new Date('2026-05-31'),
          isActive: true,
          deletedAt: new Date('2026-10-01'),
        },
      });

      const res = await service.getConfiguration('school-1');
      expect(res.isConfigured).toBe(false);
      expect(res.isInvalid).toBe(true);
      expect(res.activeAcademicYearId).toBeNull();
      expect(res.activeAcademicYear).toBeNull();
    });

    it('marks configuration as invalid if configured academic year was deactivated', async () => {
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-inactive',
        activeAcademicYear: {
          id: 'ay-inactive',
          name: 'AY 2025-26',
          startDate: new Date('2025-06-01'),
          endDate: new Date('2026-05-31'),
          isActive: false,
          deletedAt: null,
        },
      });

      const res = await service.getConfiguration('school-1');
      expect(res.isConfigured).toBe(false);
      expect(res.isInvalid).toBe(true);
      expect(res.activeAcademicYearId).toBeNull();
      expect(res.activeAcademicYear).toBeNull();
    });
  });

  describe('updateConfiguration', () => {
    it('throws NotFoundException if target academic year does not exist', async () => {
      db.academicYear.findUnique.mockResolvedValue(null);
      await expect(
        service.updateConfiguration('school-1', { activeAcademicYearId: 'ay-missing' }),
      ).rejects.toThrow(new NotFoundException('Academic year not found'));
      expect(db.school.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if academic year belongs to a different school (Cross-School Rejection)', async () => {
      db.academicYear.findUnique.mockResolvedValue({
        id: 'ay-foreign',
        schoolId: 'foreign-school-99',
        name: 'AY 2026-27',
        isActive: true,
        deletedAt: null,
      });

      await expect(
        service.updateConfiguration('school-1', { activeAcademicYearId: 'ay-foreign' }),
      ).rejects.toThrow(new BadRequestException('Academic year does not belong to this school'));
      expect(db.school.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if academic year is soft-deleted', async () => {
      db.academicYear.findUnique.mockResolvedValue({
        id: 'ay-deleted',
        schoolId: 'school-1',
        name: 'AY 2026-27',
        isActive: true,
        deletedAt: new Date('2026-10-01'),
      });

      await expect(
        service.updateConfiguration('school-1', { activeAcademicYearId: 'ay-deleted' }),
      ).rejects.toThrow(
        new BadRequestException('Cannot configure a soft-deleted or inactive academic year'),
      );
      expect(db.school.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if academic year is inactive', async () => {
      db.academicYear.findUnique.mockResolvedValue({
        id: 'ay-inactive',
        schoolId: 'school-1',
        name: 'AY 2026-27',
        isActive: false,
        deletedAt: null,
      });

      await expect(
        service.updateConfiguration('school-1', { activeAcademicYearId: 'ay-inactive' }),
      ).rejects.toThrow(
        new BadRequestException('Cannot configure a soft-deleted or inactive academic year'),
      );
      expect(db.school.update).not.toHaveBeenCalled();
    });

    it('successfully updates school activeAcademicYearId without mutating AcademicYear entity', async () => {
      db.academicYear.findUnique.mockResolvedValue({
        id: 'ay-valid',
        schoolId: 'school-1',
        name: 'AY 2026-27',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-05-31'),
        isActive: true,
        deletedAt: null,
      });

      db.school.update.mockResolvedValue({
        id: 'school-1',
        activeAcademicYearId: 'ay-valid',
      });

      // getConfiguration mock response after update
      db.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-valid',
        activeAcademicYear: {
          id: 'ay-valid',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01'),
          endDate: new Date('2027-05-31'),
          isActive: true,
          deletedAt: null,
        },
      });

      const res = await service.updateConfiguration('school-1', {
        activeAcademicYearId: 'ay-valid',
      });

      expect(db.school.update).toHaveBeenCalledWith({
        where: { id: 'school-1' },
        data: { activeAcademicYearId: 'ay-valid' },
      });

      // AcademicYear must NOT be mutated
      expect(db.academicYear.update).not.toHaveBeenCalled();

      expect(res.isConfigured).toBe(true);
      expect(res.activeAcademicYearId).toBe('ay-valid');
      expect(res.activeAcademicYear?.name).toBe('AY 2026-27');
    });
  });
});
