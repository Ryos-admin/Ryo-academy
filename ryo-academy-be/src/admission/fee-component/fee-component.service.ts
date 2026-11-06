import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { getKolkataBusinessDateUtc, hasAcademicYearStarted, toUtcDateOnly } from '../../common/date/kolkata-business-date.js';
import { parseMoney } from '../../common/money/money.util.js';
import { DatabaseService } from '../../database/database.service.js';
import { CreateFeeComponentDto } from './dto/create-fee-component.dto.js';
import { UpdateFeeComponentDto } from './dto/update-fee-component.dto.js';

@Injectable()
export class FeeComponentService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(dto: CreateFeeComponentDto) {
    const amount = parseMoney(dto.amount, 'amount');
    if (amount.lte(0)) throw new BadRequestException('Fee component amount must be greater than zero.');

    try {
      return await this.databaseService.$transaction(async (tx) => {
        const master = await this.lockAndReadMaster(tx, dto.feeStructureId);
        if (!master) throw new NotFoundException('Fee structure does not exist.');
        if (!master.isActive || master.deletedAt) throw new ConflictException('Fee structure is inactive.');
        this.assertComponentAdditionAllowed(master.academicYear.startDate, master.academicYear.endDate);
        this.assertMasterTotalMatches(master);

        const duplicate = await tx.feeComponent.findFirst({
          where: { feeStructureId: master.id, name: dto.name },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException(`Fee component with name "${dto.name}" already exists for fee structure.`);

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
      if (error?.code === 'P2002') {
        throw new ConflictException(`Fee component with name "${dto.name}" already exists for fee structure.`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFeeComponentDto) {
    try {
      return await this.databaseService.$transaction(async (tx) => {
        const component = await tx.feeComponent.findUnique({ where: { id }, select: { feeStructureId: true } });
        if (!component) throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
        const master = await this.lockAndReadMaster(tx, component.feeStructureId);
        if (!master) throw new NotFoundException('Fee structure does not exist.');
        if (!master.isActive || master.deletedAt) throw new ConflictException('Fee structure is inactive.');
        this.assertExistingComponentEditAllowed(master.academicYear.startDate);

        const activeComponent = master.feeComponents.find((item) => item.id === id);
        if (!activeComponent) throw new NotFoundException(`Active fee component with ID "${id}" does not exist.`);
        const amount = dto.amount === undefined ? undefined : parseMoney(dto.amount, 'amount');
        if (amount !== undefined && amount.lte(0)) throw new BadRequestException('Fee component amount must be greater than zero.');

        this.assertMasterTotalMatches(master);
        const updated = await tx.feeComponent.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(amount !== undefined && { amount }),
            ...(dto.discountApplicable !== undefined && { discountApplicable: dto.discountApplicable }),
            ...(dto.isMandatory !== undefined && { isMandatory: dto.isMandatory }),
          },
        });
        if (amount !== undefined) await this.recomputeMasterTotal(tx, master.id);
        return updated;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('A fee component with that exact name already exists for this fee structure.');
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
      const master = await this.lockAndReadMaster(tx, component.feeStructureId);
      if (!master) throw new NotFoundException('Fee structure does not exist.');
      if (!master.isActive || master.deletedAt) throw new ConflictException('Fee structure is inactive.');
      this.assertExistingComponentEditAllowed(master.academicYear.startDate);

      const activeComponent = master.feeComponents.find((item) => item.id === id);
      if (!activeComponent) throw new ConflictException('Fee component already deleted.');
      const detail = await tx.feePaymentDetails.findFirst({ where: { feeComponentId: id } });
      if (detail) throw new ConflictException('Fee component cannot be deleted while payment details exist.');
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
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const feeComponent = await this.databaseService.feeComponent.findUnique({ where: { id } });
    if (!feeComponent) throw new NotFoundException(`Fee component with ID "${id}" does not exist.`);
    return feeComponent;
  }

  private async lockAndReadMaster(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FeeStructure" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) return null;
    return tx.feeStructure.findUnique({
      where: { id },
      include: {
        academicYear: true,
        feeComponents: { where: { isActive: true } },
      },
    });
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
      throw new ConflictException('Stored fee structure total does not match active component amounts; reconcile before changing components.');
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

  private assertExistingComponentEditAllowed(startDate: Date) {
    if (hasAcademicYearStarted(startDate)) {
      throw new ConflictException('Existing fee component definitions are frozen on or after the academic-year start date.');
    }
  }

  private assertComponentAdditionAllowed(startDate: Date, endDate: Date) {
    const businessDate = getKolkataBusinessDateUtc();
    if (businessDate.getTime() > toUtcDateOnly(endDate).getTime()) {
      throw new ConflictException('Fee components cannot be added after the academic-year end date.');
    }
  }
}
