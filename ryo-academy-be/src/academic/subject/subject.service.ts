import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { CreateSubjectDto } from './dto/create-subject.dto.js';
import { UpdateSubjectDto } from './dto/update-subject.dto.js';

@Injectable()
export class SubjectService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateSubjectDto) {
    const classExists = await this.db.class.findFirst({ where: { id: dto.classId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!classExists) throw new NotFoundException(`Class with id "${dto.classId}" not found`);
    return this.db.subjects.create({ data: dto });
  }

  async findByClass(classId: string) {
    const classExists = await this.db.class.findFirst({ where: { id: classId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!classExists) throw new NotFoundException(`Class with id "${classId}" not found`);
    return this.db.subjects.findMany({ where: { classId, isActive: true, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const subject = await this.db.subjects.findFirst({ where: { id, isActive: true, deletedAt: null } });
    if (!subject) throw new NotFoundException(`Subject with id "${id}" not found`);
    return subject;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id);
    return this.db.subjects.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string, actorUserId: string) {
    const actor = await this.db.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    if (!actor?.schoolId) throw new ForbiddenException('A school-scoped user is required');
    const subject = await this.db.subjects.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        class: { program: { academicYear: { schoolId: actor.schoolId } } },
      },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException(`Subject with id "${id}" not found`);
    return this.db.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.teachingAssignment.updateMany({ where: { subjectId: id, isActive: true, deletedAt: null }, data: { isActive: false, deletedAt, deletedById: actorUserId } });
      return tx.subjects.update({ where: { id }, data: { isActive: false, deletedAt, deletedById: actorUserId } });
    });
  }
}
