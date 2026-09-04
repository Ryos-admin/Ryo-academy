import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { CreateSubjectDto } from './dto/create-subject.dto.js';
import { UpdateSubjectDto } from './dto/update-subject.dto.js';

@Injectable()
export class SubjectService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateSubjectDto) {
    const classExists = await this.db.class.findUnique({ where: { id: dto.classId }, select: { id: true } });
    if (!classExists) throw new NotFoundException(`Class with id "${dto.classId}" not found`);
    return this.db.subjects.create({ data: dto });
  }

  async findByClass(classId: string) {
    const classExists = await this.db.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!classExists) throw new NotFoundException(`Class with id "${classId}" not found`);
    return this.db.subjects.findMany({ where: { classId, isDeleted: false }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const subject = await this.db.subjects.findFirst({ where: { id, isDeleted: false } });
    if (!subject) throw new NotFoundException(`Subject with id "${id}" not found`);
    return subject;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id);
    return this.db.subjects.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.db.$transaction(async (tx) => {
      await tx.teachingAssignment.deleteMany({ where: { subjectId: id } });
      return tx.subjects.update({ where: { id }, data: { isDeleted: true } });
    });
  }
}
