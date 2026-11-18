import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeeManagementService } from './fee-management.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SchoolsService } from '../schools/schools.service.js';
import { AdmissionStatus } from '../../generated/prisma/enums.js';

describe('FeeManagementService', () => {
  let service: FeeManagementService;
  let db: {
    admission: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let schoolsService: {
    resolveActiveSchool: jest.Mock;
    getConfiguration: jest.Mock;
  };

  beforeEach(() => {
    db = {
      admission: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    schoolsService = {
      resolveActiveSchool: jest.fn(),
      getConfiguration: jest.fn(),
    };
    service = new FeeManagementService(
      db as unknown as DatabaseService,
      schoolsService as unknown as SchoolsService,
    );
  });

  describe('Tenant Resolution & Security', () => {
    it('propagates ForbiddenException if actor is inactive, soft-deleted, or lacks a school', async () => {
      schoolsService.resolveActiveSchool.mockRejectedValue(
        new ForbiddenException('User is inactive or deleted'),
      );

      await expect(
        service.getDashboard('u-inactive', { page: 1, pageSize: 25 }),
      ).rejects.toThrow(new ForbiddenException('User is inactive or deleted'));
      expect(db.admission.findMany).not.toHaveBeenCalled();
      expect(db.admission.count).not.toHaveBeenCalled();
    });

    it('propagates ForbiddenException if school is inactive or not found', async () => {
      schoolsService.resolveActiveSchool.mockRejectedValue(
        new ForbiddenException('School is inactive or not found'),
      );

      await expect(
        service.getDashboard('u-1', { page: 1, pageSize: 25 }),
      ).rejects.toThrow(new ForbiddenException('School is inactive or not found'));
      expect(db.admission.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Semantics (Unconfigured / Invalid / Valid)', () => {
    it('returns empty dashboard when school is unconfigured (activeAcademicYearId is null)', async () => {
      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: null,
        activeAcademicYear: null,
        isConfigured: false,
        isInvalid: false,
      });

      const res = await service.getDashboard('u-1', { page: 1, pageSize: 25 });

      expect(res).toEqual({
        configured: false,
        invalidConfiguration: false,
        activeAcademicYear: null,
        data: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      });
      expect(db.admission.findMany).not.toHaveBeenCalled();
      expect(db.admission.count).not.toHaveBeenCalled();
    });

    it('returns invalidConfiguration state when configured academic year is soft-deleted or inactive', async () => {
      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: null,
        activeAcademicYear: null,
        isConfigured: false,
        isInvalid: true,
      });

      const res = await service.getDashboard('u-1', { page: 1, pageSize: 25 });

      expect(res).toEqual({
        configured: false,
        invalidConfiguration: true,
        activeAcademicYear: null,
        data: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      });
      expect(db.admission.findMany).not.toHaveBeenCalled();
      expect(db.admission.count).not.toHaveBeenCalled();
    });

    it('returns valid confirmed admissions when school is properly configured', async () => {
      const start = new Date('2026-06-01');
      const end = new Date('2027-05-31');

      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-1',
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: start,
          endDate: end,
          isActive: true,
        },
        isConfigured: true,
        isInvalid: false,
      });

      const mockAdmissions = [
        {
          id: 'adm-1',
          admissionNumber: 'ADM-2026-001',
          studentName: 'Alice Smith',
          admissionStatus: AdmissionStatus.CONFIRMED,
          createdAt: new Date('2026-07-01'),
          program: { id: 'prog-1', name: 'Science' },
          class: { id: 'class-1', name: 'Grade 11' },
          section: { id: 'sec-1', name: 'A' },
          student: { id: 'st-1', studentNumber: 'ST-001', studentName: 'Alice Smith' },
        },
      ];

      db.admission.findMany.mockResolvedValue(mockAdmissions);
      db.admission.count.mockResolvedValue(1);

      const res = await service.getDashboard('u-1', { page: 1, pageSize: 25 });

      expect(res).toEqual({
        configured: true,
        invalidConfiguration: false,
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: start,
          endDate: end,
        },
        data: mockAdmissions,
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      });

      // Verify exact where clause scoping
      expect(db.admission.findMany).toHaveBeenCalledWith({
        where: {
          schoolId: 'school-1',
          academicYearId: 'ay-1',
          admissionStatus: AdmissionStatus.CONFIRMED,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          admissionNumber: true,
          admissionSequence: true,
          admissionStatus: true,
          studentName: true,
          confirmedAt: true,
          createdAt: true,
          program: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          student: { select: { id: true, studentNumber: true, studentName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 25,
      });

      expect(db.admission.count).toHaveBeenCalledWith({
        where: {
          schoolId: 'school-1',
          academicYearId: 'ay-1',
          admissionStatus: AdmissionStatus.CONFIRMED,
          isActive: true,
          deletedAt: null,
        },
      });
    });
  });

  describe('Filtering & Searching', () => {
    beforeEach(() => {
      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
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
      db.admission.findMany.mockResolvedValue([]);
      db.admission.count.mockResolvedValue(0);
    });

    it('applies trimmed search across studentName, admissionNumber, and student.studentName', async () => {
      await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
        search: '  John Doe  ',
      });

      const expectedWhere = {
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
        isActive: true,
        deletedAt: null,
        OR: [
          { studentName: { contains: 'John Doe', mode: 'insensitive' } },
          { admissionNumber: { contains: 'John Doe', mode: 'insensitive' } },
          { student: { studentName: { contains: 'John Doe', mode: 'insensitive' } } },
        ],
      };

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(db.admission.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('ignores empty or whitespace-only search string', async () => {
      await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
        search: '    ',
      });

      const expectedWhere = {
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
        isActive: true,
        deletedAt: null,
      };

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(db.admission.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('applies classId filter', async () => {
      await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
        classId: 'class-uuid-1',
      });

      const expectedWhere = {
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
        isActive: true,
        deletedAt: null,
        classId: 'class-uuid-1',
      };

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(db.admission.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('applies programId filter', async () => {
      await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
        programId: 'prog-uuid-1',
      });

      const expectedWhere = {
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
        isActive: true,
        deletedAt: null,
        programId: 'prog-uuid-1',
      };

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(db.admission.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('combines search, classId, and programId filters', async () => {
      await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
        search: 'Alice',
        classId: 'class-uuid-1',
        programId: 'prog-uuid-1',
      });

      const expectedWhere = {
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        admissionStatus: AdmissionStatus.CONFIRMED,
        isActive: true,
        deletedAt: null,
        OR: [
          { studentName: { contains: 'Alice', mode: 'insensitive' } },
          { admissionNumber: { contains: 'Alice', mode: 'insensitive' } },
          { student: { studentName: { contains: 'Alice', mode: 'insensitive' } } },
        ],
        classId: 'class-uuid-1',
        programId: 'prog-uuid-1',
      };

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(db.admission.count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });

  describe('Pagination & Edge Cases', () => {
    beforeEach(() => {
      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
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
      db.admission.findMany.mockResolvedValue([]);
      db.admission.count.mockResolvedValue(55);
    });

    it('calculates correct skip and take for page 3 with pageSize 10', async () => {
      const res = await service.getDashboard('u-1', {
        page: 3,
        pageSize: 10,
      });

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(res.page).toBe(3);
      expect(res.pageSize).toBe(10);
      expect(res.total).toBe(55);
      expect(res.totalPages).toBe(6); // Math.ceil(55 / 10) = 6
    });

    it('falls back to defaults if page or pageSize are <= 0 or missing in plain query object', async () => {
      const res = await service.getDashboard('u-1', {
        page: 0,
        pageSize: 0,
      } as any);

      expect(db.admission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 25,
        }),
      );
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(25);
    });

    it('returns totalPages = 0 when total is 0', async () => {
      db.admission.count.mockResolvedValue(0);

      const res = await service.getDashboard('u-1', {
        page: 1,
        pageSize: 25,
      });

      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
    });
  });

  describe('DATA-MIN-01 Remediation: Explicit Projection & PII Minimization', () => {
    it('uses explicit select projection and excludes sensitive PII fields', async () => {
      schoolsService.resolveActiveSchool.mockResolvedValue('school-1');
      schoolsService.getConfiguration.mockResolvedValue({
        schoolId: 'school-1',
        schoolName: 'Ryo Academy',
        schoolCode: 'RYO',
        activeAcademicYearId: 'ay-1',
        activeAcademicYear: {
          id: 'ay-1',
          name: 'AY 2026-27',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
        },
        isConfigured: true,
        isInvalid: false,
      });

      db.admission.findMany.mockResolvedValue([]);
      db.admission.count.mockResolvedValue(0);

      await service.getDashboard('u-1', { page: 1, pageSize: 25 });

      expect(db.admission.findMany).toHaveBeenCalled();
      const findManyCall = db.admission.findMany.mock.calls[0][0];

      // Verify that findMany was called with an explicit `select` object and NO `include`
      expect(findManyCall.include).toBeUndefined();
      expect(findManyCall.select).toBeDefined();

      const select = findManyCall.select;

      // 1. Authorized summary fields MUST be present
      expect(select.id).toBe(true);
      expect(select.admissionNumber).toBe(true);
      expect(select.admissionSequence).toBe(true);
      expect(select.admissionStatus).toBe(true);
      expect(select.studentName).toBe(true);
      expect(select.confirmedAt).toBe(true);
      expect(select.createdAt).toBe(true);

      // 2. Sensitive PII fields MUST NOT be selected
      expect(select.dateOfBirth).toBeUndefined();
      expect(select.gender).toBeUndefined();
      expect(select.aadhaarNumber).toBeUndefined();
      expect(select.bloodGroup).toBeUndefined();
      expect(select.parentName).toBeUndefined();
      expect(select.parentRelation).toBeUndefined();
      expect(select.parentPhone).toBeUndefined();
      expect(select.parentAlternatePhone).toBeUndefined();
      expect(select.parentEmail).toBeUndefined();
      expect(select.permanentAddress).toBeUndefined();
      expect(select.presentAddress).toBeUndefined();
      expect(select.emergencyContactName).toBeUndefined();
      expect(select.emergencyContactNumber).toBeUndefined();
      expect(select.createdById).toBeUndefined();
      expect(select.confirmedById).toBeUndefined();
      expect(select.cancelledById).toBeUndefined();

      // 3. Nested relations must have their own strict projection
      expect(select.program).toEqual({ select: { id: true, name: true } });
      expect(select.class).toEqual({ select: { id: true, name: true } });
      expect(select.section).toEqual({ select: { id: true, name: true } });
      expect(select.student).toEqual({
        select: { id: true, studentNumber: true, studentName: true },
      });
    });
  });
});
