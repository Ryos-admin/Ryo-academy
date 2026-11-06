import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { parseMoney } from "../../common/money/money.util.js";
import { hasAcademicYearStarted } from "../../common/date/kolkata-business-date.js";
import { DatabaseService } from "../../database/database.service.js";
import { FeeStructureDto } from "./dto/fee-structure.dto.js";
import { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";

@Injectable()
export class FeeStructureService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(dto: FeeStructureDto) {
    if (!dto.feeComponents?.length) {
      throw new BadRequestException("At least one fee component is required.");
    }
    const componentAmounts = dto.feeComponents.map((item) => {
      const amount = parseMoney(item.amount, "fee component amount");
      if (amount.lte(0))
        throw new BadRequestException("Every fee component amount must be greater than zero.");
      return amount;
    });
    this.assertUniqueComponentNames(dto.feeComponents.map(({ name }) => name));
    const totalAmount = componentAmounts.reduce(
      (sum, amount) => sum.plus(amount),
      new Prisma.Decimal(0),
    );

    try {
      return await this.databaseService.$transaction(async (tx) => {
        const academicYear = await tx.academicYear.findUnique({
          where: { id: dto.academicYearId },
        });
        if (!academicYear)
          throw new NotFoundException(
            `Academic year with ID "${dto.academicYearId}" does not exist.`,
          );
        // if (hasAcademicYearStarted(academicYear.startDate)) {
        //   throw new ConflictException(
        //     "A fee structure cannot be created on or after the academic-year start date.",
        //   );
        // }
        const program = await tx.program.findFirst({
          where: { id: dto.programId, academicYearId: dto.academicYearId },
        });
        if (!program)
          throw new NotFoundException(
            `Program with ID "${dto.programId}" does not belong to the selected academic year.`,
          );
        const classEntity = await tx.class.findFirst({
          where: { id: dto.classId, programId: dto.programId },
        });
        if (!classEntity)
          throw new NotFoundException(
            `Class with ID "${dto.classId}" does not belong to the selected program.`,
          );

        const master = await tx.feeStructure.create({
          data: {
            name: dto.name,
            description: dto.description,
            academicYearId: dto.academicYearId,
            programId: dto.programId,
            classId: dto.classId,
            totalAmount,
          },
        });
        await tx.feeComponent.createMany({
          data: dto.feeComponents.map((item, index) => ({
            name: item.name,
            description: item.description,
            amount: componentAmounts[index],
            feeStructureId: master.id,
            discountApplicable: item.discountApplicable ?? false,
            isMandatory: item.isMandatory ?? true,
          })),
        });
        return tx.feeStructure.findUniqueOrThrow({
          where: { id: master.id },
          include: { feeComponents: true },
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "Fee structure or component already exists for the selected scope.",
        );
      }
      throw error;
    }
  }

  async find() {
    return this.databaseService.feeStructure.findMany({
      where: { isActive: true },
      orderBy: [{ academicYearId: "asc" }, { name: "asc" }],
      include: this.readRelations(true),
    });
  }

  async findById(id: string) {
    const feeStructure = await this.databaseService.feeStructure.findUnique({
      where: { id },
      include: this.readRelations(false),
    });
    if (!feeStructure) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
    return feeStructure;
  }

  async update(id: string, dto: UpdateFeeStructureDto) {
    try {
      return await this.databaseService.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
        const existing = await tx.feeStructure.findUnique({
          where: { id },
          include: { academicYear: true },
        });
        if (!existing) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
        if (!existing.isActive || existing.deletedAt)
          throw new ConflictException("Fee structure is inactive.");
        if (hasAcademicYearStarted(existing.academicYear.startDate)) {
          throw new ConflictException(
            "Fee structure metadata is frozen on or after the academic-year start date.",
          );
        }
        if (dto.isActive === false) await this.assertNoHistoricalReferences(tx, id);

        return tx.feeStructure.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
          include: this.readRelations(false),
        });
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "Fee structure already exists for the selected academic year, program, and class.",
        );
      }
      throw error;
    }
  }

  async delete(id: string, actorUserId: string) {
    return this.databaseService.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
      const feeStructure = await tx.feeStructure.findUnique({
        where: { id },
        include: { academicYear: true },
      });
      if (!feeStructure)
        throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
      if (!feeStructure.isActive || feeStructure.deletedAt)
        throw new ConflictException("Fee structure already deleted.");

      await this.assertNoHistoricalReferences(tx, id);
      // if (hasAcademicYearStarted(feeStructure.academicYear.startDate)) {
      //   throw new ConflictException('Fee structure changes are blocked on or after the academic-year start date.');
      // }

      return tx.feeStructure.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), deletedById: actorUserId },
        include: this.readRelations(false),
      });
    });
  }

  private async assertNoHistoricalReferences(tx: Prisma.TransactionClient, id: string) {
    const header = await tx.feePaymentHeader.findFirst({ where: { feeStructureId: id } });
    if (header)
      throw new ConflictException("Fee structure cannot be deleted while payment headers exist.");
    const detail = await tx.feePaymentDetails.findFirst({
      where: { feeComponent: { feeStructureId: id } },
    });
    if (detail)
      throw new ConflictException("Fee structure cannot be deleted while payment details exist.");
  }

  private assertUniqueComponentNames(names: string[]) {
    if (new Set(names).size !== names.length) {
      throw new ConflictException("Fee component names must be unique within a fee structure.");
    }
  }

  private readRelations(activeComponents: boolean) {
    return {
      academicYear: { select: { id: true, name: true } },
      program: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      feeComponents: {
        ...(activeComponents ? { where: { isActive: true } } : {}),
        orderBy: { name: "asc" as const },
      },
    };
  }
}
