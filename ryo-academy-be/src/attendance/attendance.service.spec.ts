import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { DatabaseService } from '../database/database.service.js';

const ASSIGNMENT = {
  classId: 'class-1',
  sectionId: 'section-1',
  class: { program: { academicYearId: 'year-1' } },
};

const RECORD = {
  id: 'att-1',
  academicYearId: 'year-1',
  classId: 'class-1',
  sectionId: 'section-1',
  takenBy: 'staff-1',
};

type Harness = {
  service: AttendanceService;
  findMany: jest.Mock;
  findFirst: jest.Mock;
  assignmentFindMany: jest.Mock;
  assignmentFindFirst: jest.Mock;
  staffFindUnique: jest.Mock;
};

function build(staffRow: unknown): Harness {
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest
    .fn()
    .mockResolvedValue({ ...RECORD, status: 'DRAFT', children: [] });
  const assignmentFindMany = jest
    .fn()
    .mockResolvedValue([ASSIGNMENT, { ...ASSIGNMENT, classId: 'class-2' }]);
  const assignmentFindFirst = jest.fn().mockResolvedValue({ id: 'ta-1' });
  const staffFindUnique = jest.fn().mockResolvedValue(staffRow);

  const db = {
    staff: { findUnique: staffFindUnique },
    teachingAssignment: {
      findMany: assignmentFindMany,
      findFirst: assignmentFindFirst,
    },
    attendanceLogMaster: { findMany, findFirst },
  } as unknown as DatabaseService;

  return {
    service: new AttendanceService(db),
    findMany,
    findFirst,
    assignmentFindMany,
    assignmentFindFirst,
    staffFindUnique,
  };
}

describe('AttendanceService read authorization and scoping', () => {
  describe('GET /attendance (findAll)', () => {
    it('lets a COLLEGE_ADMIN (ATTENDANCE_READ, no staff profile) read school-wide', async () => {
      const h = build(null); // administrator: no staff row at all
      await h.service.findAll('admin-1', {});
      const where = h.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(where).toMatchObject({ deletedAt: null });
      expect(h.assignmentFindMany).not.toHaveBeenCalled();
    });

    it('narrows a STAFF member to their own teaching assignments', async () => {
      const h = build({ id: 'staff-1', status: true });
      await h.service.findAll('staff-user-1', {});
      const where = h.findMany.mock.calls[0][0].where;
      expect(h.assignmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { staffId: 'staff-1' } }),
      );
      expect(where.OR).toEqual([
        { academicYearId: 'year-1', classId: 'class-1', sectionId: 'section-1' },
        { academicYearId: 'year-1', classId: 'class-2', sectionId: 'section-1' },
      ]);
    });

    it('rejects a user whose staff profile exists but is not active', async () => {
      const h = build({ id: 'staff-9', status: false });
      await expect(h.service.findAll('staff-user-9', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(h.findMany).not.toHaveBeenCalled();
    });

    it('keeps applying query filters to the administrator read', async () => {
      const h = build(null);
      await h.service.findAll('admin-1', { classId: 'class-7' });
      expect(h.findMany.mock.calls[0][0].where).toMatchObject({
        deletedAt: null,
        classId: 'class-7',
      });
    });
  });

  describe('GET /attendance/:id (findOne)', () => {
    it('lets an administrator read a record without an assignment check', async () => {
      const h = build(null);
      await expect(h.service.findOne('admin-1', 'att-1')).resolves.toBeDefined();
      expect(h.assignmentFindFirst).not.toHaveBeenCalled();
    });

    it('still scopes a staff member to assigned class and section', async () => {
      const h = build({ id: 'staff-1', status: true });
      await expect(h.service.findOne('staff-user-1', 'att-1')).resolves.toBeDefined();
      expect(h.assignmentFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            staffId: 'staff-1',
            classId: 'class-1',
            sectionId: 'section-1',
            class: { program: { academicYearId: 'year-1' } },
          },
        }),
      );
    });

    it('forbids a staff member reading an unassigned record', async () => {
      const h = build({ id: 'staff-1', status: true });
      h.assignmentFindFirst.mockResolvedValue(null);
      await expect(h.service.findOne('staff-user-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('still 404s a missing record', async () => {
      const h = build(null);
      h.findFirst.mockResolvedValue(null);
      await expect(h.service.findOne('admin-1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('writes and self-service still require an active staff profile', () => {
    it('rejects create for a user with no staff profile', async () => {
      const h = build(null);
      await expect(
        h.service.create('admin-1', { date: '2026-01-01' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects submit for a user with no staff profile', async () => {
      const h = build(null);
      await expect(h.service.submit('admin-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects remove for a user with no staff profile', async () => {
      const h = build(null);
      await expect(h.service.remove('admin-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects /attendance/my for a user with no staff profile', async () => {
      const h = build(null);
      await expect(h.service.findMy('admin-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
