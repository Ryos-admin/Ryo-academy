import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import {
  getKolkataBusinessDateUtc,
  toUtcDateOnly,
} from "../../common/date/kolkata-business-date.js";
import { parseMoney } from "../../common/money/money.util.js";
import { DatabaseService } from "../../database/database.service.js";
import { CreateFeeComponentDto } from "./dto/create-fee-component.dto.js";
import { UpdateFeeComponentDto } from "./dto/update-fee-component.dto.js";

@Injectable()
export class FeeComponentService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(dto: CreateFeeComponentDto) {
    const amount = parseMoney(dto.amount, "amount");
    if (amount.lte(0))
      throw new BadRequestException("Fee component amount must be greater than zero.");

    try {
      return await this.databaseService.$transaction(async (tx) => {
        const master = await this.lockAndReadMaster(tx, dto.feeStructureId);
        if (!master) throw new NotFoundException("Fee structure does not exist.");
        if (!master.isActive || master.deletedAt)
          throw new ConflictException("Fee structure is inactive.");
        this.assertComponentAdditionAllowed(master.academicYear.endDate);
        this.assertMasterTotalMatches(master);

        const duplicate = await tx.feeComponent.findFirst({
          where: { feeStructureId: master.id, name: dto.name },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException(
            `Fee component with name "${dto.name}" already exists for fee structure.`,
          );

        const component = await tx.feeComponent.create({
          data: {
            name: dto.name,
            description: dto.description,
            amount,
            feeStructureId: master.id,
            discountApplicable: dto.discountApplicable ?? false,
            isMandatory: dto.isMandatory ?? true,
          },
        });
        
        await this.recomputeMasterTotal(tx, master.id);
        return component;
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          `Fee component with name "${dto.name}" already exists for fee structure.`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFeeComponentDto) {
    try {
      return await this.databaseService.$transaction(async (tx) => {
        const component = await tx.feeComponent.findUnique({
          where: { id },
          select: { feeStructureId: true },
        });
        if (!component)
          throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
        if (
          (dto as any).feeStructureId !== undefined &&
          (dto as any).feeStructureId !== component.feeStructureId
        ) {
          throw new BadRequestException(
            "FeeComponent cannot be reassigned to a different FeeStructure.",
          );
        }
        const master = await this.lockAndReadMaster(tx, component.feeStructureId);
        if (!master) throw new NotFoundException("Fee structure does not exist.");
        if (!master.isActive || master.deletedAt)
          throw new ConflictException("Fee structure is inactive.");

        const activeComponent = master.feeComponents.find((item: any) => item.id === id);
        if (!activeComponent)
          throw new NotFoundException(`Active fee component with ID "${id}" does not exist.`);
        const amount = dto.amount === undefined ? undefined : parseMoney(dto.amount, "amount");
        if (amount !== undefined && amount.lte(0))
          throw new BadRequestException("Fee component amount must be greater than zero.");

        if (master.isConsumed) {
          // Reject component amount decreases on consumed structures
          if (amount !== undefined && amount.lt(activeComponent.amount)) {
            throw new BadRequestException(
              "COMPONENT_AMOUNT_DECREASE_PROHIBITED_ON_CONSUMED_STRUCTURE: Component amount cannot be decreased on a consumed fee structure.",
            );
          }

          // Reject discountApplicable: false -> true on consumed structures
          if (!activeComponent.discountApplicable && dto.discountApplicable === true) {
            throw new BadRequestException(
              "DISCOUNT_APPLICABILITY_INCREASE_PROHIBITED: Cannot enable discount applicability on a consumed fee structure component.",
            );
          }
        }

        this.assertMasterTotalMatches(master);

        // A discountApplicable: true -> false transition grandfathers existing concessions with requiresReview
        if (activeComponent.discountApplicable === true && dto.discountApplicable === false) {
          if (typeof tx.admissionFeeConcession?.findMany === "function") {
            const concessionsToReview = await tx.admissionFeeConcession.findMany({
              where: {
                feePaymentDetails: {
                  feeComponentId: id,
                },
              },
              select: { id: true },
            });
            if (concessionsToReview.length > 0) {
              await tx.admissionFeeConcession.updateMany({
                where: {
                  id: { in: concessionsToReview.map((c: any) => c.id) },
                },
                data: { requiresReview: true },
              });
            }
          }
        }

        const updated = await tx.feeComponent.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(amount !== undefined && { amount }),
            ...(dto.discountApplicable !== undefined && {
              discountApplicable: dto.discountApplicable,
            }),
            ...(dto.isMandatory !== undefined && { isMandatory: dto.isMandatory }),
          },
        });
        if (amount !== undefined) await this.recomputeMasterTotal(tx, master.id);
        return updated;
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          "A fee component with that exact name already exists for this fee structure.",
        );
      }
      throw error;
    }
  }

  async delete(id: string, actorUserId: string) {
    return this.databaseService.$transaction(async (tx) => {
      const component = await tx.feeComponent.findUnique({
        where: { id },
        select: { feeStructureId: true },
      });
      if (!component) throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
      const master: any = await this.lockAndReadMaster(tx, component.feeStructureId);
      if (!master) throw new NotFoundException("Fee structure does not exist.");
      if (!master.isActive || master.deletedAt)
        throw new ConflictException("Fee structure is inactive.");

      const activeComponent = master.feeComponents.find((item: any) => item.id === id);
      if (!activeComponent) throw new ConflictException("Fee component already deleted.");

      if (master.isConsumed) {
        // Deactivation must reject when an applicable DRAFT or CONFIRMED admission has an outstanding balance attributable to the component
        const referencingDetails =
          typeof tx.feePaymentDetails?.findMany === "function"
            ? await tx.feePaymentDetails.findMany({
                where: {
                  feeComponentId: id,
                  isIncluded: true,
                  feePaymentHeader: {
                    admission: {
                      admissionStatus: { in: ["DRAFT", "CONFIRMED"] },
                    },
                  },
                },
                select: {
                  id: true,
                  amountPaid: true,
                  totalAmountToBePaid: true,
                },
              })
            : [];

        const hasOutstandingBalance = referencingDetails.some((d: any) => {
          const paid = new Prisma.Decimal(d.amountPaid.toString());
          const total = new Prisma.Decimal(d.totalAmountToBePaid.toString());
          return total.minus(paid).gt(0);
        });

        if (hasOutstandingBalance) {
          throw new ConflictException(
            "COMPONENT_DEACTIVATION_REDUCES_ADMISSION_OBLIGATION: Fee component cannot be deactivated while applicable admissions have an outstanding balance attributable to it.",
          );
        }
      } else {
        const detail = await tx.feePaymentDetails.findFirst({ where: { feeComponentId: id } });
        if (detail)
          throw new ConflictException("Fee component cannot be deleted while payment details exist.");
      }

      this.assertMasterTotalMatches(master);

      const deleted = await tx.feeComponent.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date(), deletedById: actorUserId },
      });
      await this.recomputeMasterTotal(tx, master.id);
      return deleted;
    });
  }

  async findAll() {
    return this.databaseService.feeComponent.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    const feeComponent = await this.databaseService.feeComponent.findUnique({ where: { id } });
    if (!feeComponent) throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
    return feeComponent;
  }

  private async lockAndReadMaster(tx: Prisma.TransactionClient, id: string) {
    const preCheck = await tx.feeStructure.findUnique({
      where: { id },
      include: { academicYear: true },
    });
    if (!preCheck) return null;

    const ayId = preCheck.academicYearId ?? preCheck.academicYear?.id;
    if (ayId) {
      const ayRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "AcademicYear" WHERE id = ${ayId} FOR SHARE
      `;
      const ayStatus = ayRows.length > 0 && ayRows[0].status ? ayRows[0].status : (preCheck.academicYear as any)?.status;
      if (ayStatus && ayStatus === 'CLOSED') {
        throw new ConflictException('Fee components cannot be modified in CLOSED academic years');
      }
    }

    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) return null;

    const consumed =
      typeof tx.feePaymentHeader?.findFirst === "function"
        ? await tx.feePaymentHeader.findFirst({ where: { feeStructureId: id } })
        : null;

    const master = await tx.feeStructure.findUnique({
      where: { id },
      include: {
        academicYear: true,
        feeComponents: { where: { isActive: true } },
      },
    });
    if (!master) return null;

    return {
      ...master,
      isConsumed: Boolean(consumed),
    };
  }

  private assertMasterTotalMatches(master: {
    totalAmount: Prisma.Decimal;
    feeComponents: { amount: Prisma.Decimal }[];
  }) {
    const componentTotal = master.feeComponents.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0),
    );
    if (!componentTotal.equals(master.totalAmount)) {
      throw new ConflictException(
        "Stored fee structure total does not match active component amounts; reconcile before changing components.",
      );
    }
  }

  private async recomputeMasterTotal(tx: Prisma.TransactionClient, masterId: string) {
    const components = await tx.feeComponent.findMany({
      where: { feeStructureId: masterId, isActive: true },
      select: { amount: true },
    });
    const totalAmount = components.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0),
    );
    return tx.feeStructure.update({ where: { id: masterId }, data: { totalAmount } });
  }

  private assertComponentAdditionAllowed(endDate: Date) {
    const businessDate = getKolkataBusinessDateUtc();
    if (businessDate.getTime() > toUtcDateOnly(endDate).getTime()) {
      throw new ConflictException(
        "Fee components cannot be added after the academic-year end date.",
      );
    }
  }
}
