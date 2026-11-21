import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { parseMoney } from "../../common/money/money.util.js";
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
    const gstPercentage = this.parseAndValidateGstPercentage(dto.gstPercentage);

    try {
      return await this.databaseService.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AcademicYear" WHERE "id" = ${dto.academicYearId} FOR SHARE`;
        const academicYear = await tx.academicYear.findUnique({
          where: { id: dto.academicYearId },
        });
        if (!academicYear || academicYear.isActive === false || academicYear.deletedAt)
          throw new NotFoundException(
            `Academic year with ID "${dto.academicYearId}" does not exist.`,
          );
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
            gstPercentage,
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
        const preCheck = await tx.feeStructure.findUnique({
          where: { id },
          include: { academicYear: true },
        });
        if (!preCheck) throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
        if (!preCheck.isActive || preCheck.deletedAt)
          throw new ConflictException("Fee structure is inactive.");

        const ayId = preCheck.academicYearId ?? preCheck.academicYear?.id;
        if ((dto as any).academicYearId !== undefined && (dto as any).academicYearId !== ayId) {
          throw new BadRequestException("FeeStructure cannot be reassigned to a different AcademicYear.");
        }
        if ((dto as any).programId !== undefined && (dto as any).programId !== preCheck.programId) {
          throw new BadRequestException("FeeStructure cannot be reassigned to a different Program.");
        }
        if ((dto as any).classId !== undefined && (dto as any).classId !== preCheck.classId) {
          throw new BadRequestException("FeeStructure cannot be reassigned to a different Class.");
        }

        if (ayId) {
          const ayRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT id, status FROM "AcademicYear" WHERE id = ${ayId} FOR SHARE
          `;
          const academicYear = (await tx.academicYear.findUnique({
            where: { id: ayId },
          })) ?? preCheck.academicYear;
          if (!academicYear || academicYear.isActive === false || academicYear.deletedAt) {
            throw new NotFoundException(`Academic year with ID "${ayId}" does not exist.`);
          }
          const ayStatus = ayRows.length > 0 && ayRows[0].status ? ayRows[0].status : (academicYear as any)?.status;
          if (ayStatus && ayStatus !== 'DRAFT') {
            throw new ConflictException(
              "Fee structure can only be modified in DRAFT academic years",
            );
          }
        }

        await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
        await this.assertNotConsumed(tx, id);

        if (dto.isActive === false) await this.assertNoHistoricalReferences(tx, id);

        let gstPercentage: Prisma.Decimal | undefined = undefined;
        if (dto.gstPercentage !== undefined) {
          gstPercentage = this.parseAndValidateGstPercentage(dto.gstPercentage);
        }

        return tx.feeStructure.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(gstPercentage !== undefined && { gstPercentage }),
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
      const preCheck = await tx.feeStructure.findUnique({
        where: { id },
        include: { academicYear: true },
      });
      if (!preCheck)
        throw new NotFoundException(`Fee structure with ID "${id}" does not exist.`);
      if (!preCheck.isActive || preCheck.deletedAt)
        throw new ConflictException("Fee structure already deleted.");

      const ayId = preCheck.academicYearId ?? preCheck.academicYear?.id;
      let academicYear: any = null;
      if (ayId) {
        const ayRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM "AcademicYear" WHERE id = ${ayId} FOR SHARE
        `;
        academicYear = (await tx.academicYear.findUnique({
          where: { id: ayId },
        })) ?? preCheck.academicYear;
        const ayStatus = ayRows.length > 0 && ayRows[0].status ? ayRows[0].status : (academicYear as any)?.status;
        if (ayStatus && ayStatus !== 'DRAFT') {
          throw new ConflictException(
            "Fee structure can only be deleted in DRAFT academic years",
          );
        }
      }

      await tx.$queryRaw`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
      await this.assertNotConsumed(tx, id);
      await this.assertNoHistoricalReferences(tx, id);

      return tx.feeStructure.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), deletedById: actorUserId },
        include: this.readRelations(false),
      });
    });
  }

  private async assertNotConsumed(tx: Prisma.TransactionClient, id: string) {
    const consumption = await tx.feePaymentHeader.findFirst({
      where: { feeStructureId: id },
    });
    if (consumption) {
      throw new ConflictException(
        "Fee structure is permanently frozen because it has been consumed by admissions.",
      );
    }
  }

  private parseAndValidateGstPercentage(gstInput?: string | null): Prisma.Decimal {
    if (gstInput === undefined || gstInput === null || gstInput === "") {
      return new Prisma.Decimal("0.00");
    }
    const gst = parseMoney(gstInput, "gstPercentage");
    if (gst.lt(0) || gst.gt(100)) {
      throw new BadRequestException("GST percentage must be between 0.00 and 100.00 inclusive.");
    }
    if (gst.decimalPlaces() > 2) {
      throw new BadRequestException("GST percentage cannot have more than 2 decimal places.");
    }
    return gst;
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
