import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { PasswordService } from '../../security/password/password.service.js';
import { UsersService } from '../../users/users.service.js';
import { CreateStaffDto, createTeachingAssignmentDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto, UpdateTeachingAssignmentDto } from './dto/update-staff.dto.js';

@Injectable()
export class StaffService {
  constructor(private readonly db: DatabaseService, private readonly password: PasswordService, private readonly users: UsersService) {}
  findAllStaff() { return this.db.staff.findMany({ orderBy: [{ firstName: 'asc' }] }); }
  async findStaffById(id: string) { const staff = await this.db.staff.findUnique({ where: { id }, include: { teachingAssignments: true } }); if (!staff) throw new NotFoundException(`Staff with id "${id}" not found`); return staff; }
  async createStaff(dto: CreateStaffDto) {
    if (await this.db.staff.findFirst({ where: { staffCode: dto.staffCode } })) throw new ConflictException(`Staff with code "${dto.staffCode}" already exists`);
    if (await this.users.findByEmail(dto.staffCode)) throw new ConflictException('A user with this email already exists');
    const user = await this.users.create({ email: dto.staffCode.trim().toLowerCase(), passwordHash: await this.password.hash(process.env.USER_INITIAL_PASSWORD || 'temp'), firstName: dto.firstName.trim(), lastName: dto.lastName.trim() });
    return this.db.staff.create({ data: { staffCode: dto.staffCode, firstName: dto.firstName, lastName: dto.lastName, email: dto.email, phoneNumber: dto.phoneNumber, dateOfBirth: dto.dateOfBirth, userId: user.id } });
  }
  async updateStaff(id: string, dto: UpdateStaffDto) { await this.findStaffById(id); return this.db.staff.update({ where: { id }, data: dto }); }
  async findStaffByUserId(userId: string) { const staff = await this.db.staff.findUnique({ where: { userId } }); if (!staff) throw new NotFoundException('Staff profile not found'); return staff; }
  async updateStatus(id: string, status: boolean) { await this.findStaffById(id); return this.db.staff.update({ where: { id }, data: { status } }); }
  findAssignments() { return this.db.teachingAssignment.findMany({ include: { staff: true, subject: true, class: true, section: true } }); }
  findAssignmentsByStaff(staffId: string) { return this.db.teachingAssignment.findMany({ where: { staffId }, include: { subject: true, class: true, section: true } }); }
  async createAssignment(dto: createTeachingAssignmentDto) {
    const [staff, subject, section, cls] = await Promise.all([this.db.staff.findUnique({ where: { id: dto.staffId } }), this.db.subjects.findUnique({ where: { id: dto.subjectId } }), this.db.section.findUnique({ where: { id: dto.sectionId } }), this.db.class.findUnique({ where: { id: dto.classId } })]);
    if (!staff || !subject || subject.isDeleted || !cls || !section || section.classId !== dto.classId) throw new NotFoundException('Invalid staff, subject, class, or section');
    return this.db.teachingAssignment.create({ data: { staffId: dto.staffId, subjectId: dto.subjectId, classId: dto.classId, sectionId: dto.sectionId } });
  }
  async updateAssignment(id: string, dto: UpdateTeachingAssignmentDto) { if (!await this.db.teachingAssignment.findUnique({ where: { id } })) throw new NotFoundException('Teaching assignment not found'); return this.db.teachingAssignment.update({ where: { id }, data: { subjectId: dto.subjectId, classId: dto.classId, sectionId: dto.sectionId } }); }
  async deleteAssignment(id: string) { const r = await this.db.teachingAssignment.deleteMany({ where: { id } }); if (!r.count) throw new NotFoundException('Teaching assignment not found'); return { message: 'Teaching assignment deleted successfully' }; }
}
