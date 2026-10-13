import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { PasswordService } from "../../security/password/password.service.js";
import { UsersService } from "../../users/users.service.js";
import { CreateStaffDto, createTeachingAssignmentDto } from "./dto/create-staff.dto.js";
import { UpdateStaffDto, UpdateTeachingAssignmentDto } from "./dto/update-staff.dto.js";

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly password: PasswordService,
    private readonly users: UsersService,
  ) {}
  findAllStaff() {
    return this.db.staff.findMany({ where: { isActive: true, deletedAt: null }, orderBy: [{ firstName: "asc" }] });
  }
  async findStaffById(id: string) {
    const staff = await this.db.staff.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: { teachingAssignments: true },
    });
    if (!staff) throw new NotFoundException(`Staff with id "${id}" not found`);
    return staff;
  }
  async createStaff(dto: CreateStaffDto) {
    if (await this.db.staff.findFirst({ where: { staffCode: dto.staffCode } }))
      throw new ConflictException(`Staff with code "${dto.staffCode}" already exists`);
    if (await this.users.findByEmail(dto.staffCode))
      throw new ConflictException("A user with this email already exists");
    const user = await this.users.create({
      email: dto.staffCode.trim().toLowerCase(),
      passwordHash: await this.password.hash(process.env.USER_INITIAL_PASSWORD || "temp"),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
    });
    return this.db.staff.create({
      data: {
        staffCode: dto.staffCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        dateOfBirth: dto.dateOfBirth,
        userId: user.id,
      },
    });
  }
  async updateStaff(id: string, dto: UpdateStaffDto) {
    await this.findStaffById(id);
    return this.db.staff.update({ where: { id }, data: dto });
  }
  async findStaffByUserId(userId: string) {
    const staff = await this.db.staff.findUnique({ where: { userId } });
    if (!staff) throw new NotFoundException("Staff profile not found");
    return staff;
  }
  async updateStatus(id: string, status: boolean, actorUserId: string) {
    const actor = await this.db.user.findUnique({ where: { id: actorUserId }, select: { schoolId: true } });
    if (!actor?.schoolId) throw new ForbiddenException('A school-scoped user is required');
    const staff = await this.db.staff.findFirst({
      where: { id },
      select: { id: true, userId: true, status: true, isActive: true, deletedAt: true, user: { select: { schoolId: true } } },
    });
    if (!staff) throw new NotFoundException(`Staff with id "${id}" not found`);
    if (staff.user.schoolId !== actor.schoolId) throw new NotFoundException(`Staff with id "${id}" not found`);
    if (status) {
      return this.db.staff.update({ where: { id }, data: { status: true, isActive: true } });
    }
    if (!staff.isActive || staff.deletedAt) return staff;
    const deletedAt = new Date();
    return this.db.$transaction(async (tx) => {
      await tx.teachingAssignment.updateMany({
        where: { staffId: id, deletedAt: null },
        data: { staffId: null },
      });
      await tx.user.update({
        where: { id: staff.userId },
        data: { isActive: false, deletedAt, deletedById: actorUserId },
      });
      return tx.staff.update({
        where: { id },
        data: { status: false, isActive: false, deletedAt, deletedById: actorUserId },
      });
    });
  }
  findAssignments() {
    return this.db.teachingAssignment.findMany({
      where: { isActive: true, deletedAt: null },
      include: { staff: true, subject: true, class: true, section: true },
    });
  }
  findAssignmentsByStaff(staffId: string) {
    return this.db.teachingAssignment.findMany({
      where: { staffId, isActive: true, deletedAt: null },
      include: { subject: true, class: true, section: true },
    });
  }
  async createAssignment(dto: createTeachingAssignmentDto) {
    const [staff, subject, section, cls] = await Promise.all([
      this.db.staff.findFirst({ where: { id: dto.staffId, isActive: true, deletedAt: null } }),
      this.db.subjects.findFirst({ where: { id: dto.subjectId, isActive: true, deletedAt: null } }),
      this.db.section.findFirst({ where: { id: dto.sectionId, isActive: true, deletedAt: null } }),
      this.db.class.findFirst({ where: { id: dto.classId, isActive: true, deletedAt: null } }),
    ]);
    if (
      !staff ||
      !subject ||
      !subject.isActive ||
      !cls ||
      !section ||
      section.classId !== dto.classId
    )
      throw new NotFoundException("Invalid staff, subject, class, or section");
    return this.db.teachingAssignment.create({
      data: {
        staffId: dto.staffId,
        subjectId: dto.subjectId,
        classId: dto.classId,
        sectionId: dto.sectionId,
      },
    });
  }
  async updateAssignment(id: string, dto: UpdateTeachingAssignmentDto) {
    if (!(await this.db.teachingAssignment.findFirst({ where: { id, isActive: true, deletedAt: null } })))
      throw new NotFoundException("Teaching assignment not found");
    return this.db.teachingAssignment.update({
      where: { id },
      data: { subjectId: dto.subjectId, classId: dto.classId, sectionId: dto.sectionId },
    });
  }
  async deleteAssignment(id: string) {
    const r = await this.db.teachingAssignment.updateMany({ where: { id, isActive: true, deletedAt: null }, data: { isActive: false, deletedAt: new Date() } });
    if (!r.count) throw new NotFoundException("Teaching assignment not found");
    return { message: "Teaching assignment deleted successfully" };
  }
}
