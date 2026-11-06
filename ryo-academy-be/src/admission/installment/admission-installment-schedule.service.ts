import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import "../../common/money/decimal-precision.js";
import { ScheduleCalculatorService } from "./schedule-calculator.service.js";
import { InstallmentTemplateService } from "./installment-template.service.js";
import {
  AdmissionStatus,
  InstallmentRowStatus,
  InstallmentScheduleType,
  LineageEventType,
  Prisma,
} from "../../../generated/prisma/client.js";
import { CreateTemplateScheduleDto } from "./dto/create-template-schedule.dto.js";
import { CreateManualScheduleDto } from "./dto/create-manual-schedule.dto.js";
import { UpdateDraftScheduleDto } from "./dto/update-draft-schedule.dto.js";
import { PreviewScheduleDto } from "./dto/preview-schedule.dto.js";
import { parseMoney } from "../../common/money/money.util.js";
import { getKolkataBusinessDateUtc as getTodayKolkataDateUtc } from "../../common/date/kolkata-business-date.js";

const Decimal = Prisma.Decimal;

export { getTodayKolkataDateUtc };

@Injectable()
export class AdmissionInstallmentScheduleService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly calculatorService: ScheduleCalculatorService,
    private readonly templateService: InstallmentTemplateService,
  ) {}

  /**
   * Resolves the authoritative school ID for the requesting user.
   */
  private async resolveSchoolId(actorUserId?: string): Promise<string> {
    if (actorUserId) {
      const user = await this.databaseService.user.findUnique({
        where: { id: actorUserId },
        select: { schoolId: true },
      });
      if (user?.schoolId) {
        return user.schoolId;
      }
    }
    const defaultSchool = await this.databaseService.school.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!defaultSchool) {
      throw new BadRequestException("No active school found");
    }
    return defaultSchool.id;
  }

  /**
   * Validates access to the specified admission, enforcing school tenant isolation.
   */
  async getAdmissionWithAccess(admissionId: string, actorUserId?: string) {
    const resolvedSchoolId = await this.resolveSchoolId(actorUserId);
    const admission = await this.databaseService.admission.findUnique({
      where: { id: admissionId },
    });

    if (!admission || admission.schoolId !== resolvedSchoolId) {
      throw new NotFoundException(`Admission with id "${admissionId}" not found`);
    }

    return admission;
  }

  /**
   * Acquires row-level exclusive locks adhering strictly to the lock hierarchy:
   * Admission -> FeePaymentHeader -> AdmissionInstallmentSchedule -> AdmissionInstallment
   */
  private async lockAdmission(tx: any, admissionId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM "Admission" WHERE id = ${admissionId} FOR UPDATE`;
    }
  }

  private async lockHeader(tx: any, headerId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM "FeePaymentHeader" WHERE id = ${headerId} FOR UPDATE`;
    }
  }

  private async lockSchedule(tx: any, scheduleId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM "AdmissionInstallmentSchedule" WHERE id = ${scheduleId} FOR UPDATE`;
    }
  }

  private async lockInstallments(tx: any, scheduleId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM "AdmissionInstallment" WHERE "scheduleId" = ${scheduleId} ORDER BY sequence ASC, "subSequence" ASC FOR UPDATE`;
    }
  }

  /**
   * Resolves the active FeePaymentHeader for the admission.
   */
  private async resolveActiveHeader(
    tx: any,
    admissionId: string,
    requestedHeaderId?: string,
  ) {
    if (requestedHeaderId) {
      const header = await tx.feePaymentHeader.findFirst({
        where: { id: requestedHeaderId, admissionId, isActive: true },
      });
      if (!header) {
        throw new NotFoundException(
          `FeePaymentHeader "${requestedHeaderId}" not found for admission "${admissionId}".`,
        );
      }
      return header;
    }

    const header = await tx.feePaymentHeader.findFirst({
      where: { admissionId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!header) {
      throw new BadRequestException(
        `Admission "${admissionId}" does not have an active FeePaymentHeader.`,
      );
    }
    return header;
  }

  /**
   * Preview a schedule configuration (template or custom) against the admission's net obligation without persistence.
   */
  async preview(admissionId: string, dto: PreviewScheduleDto, actorUserId?: string) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);
    const header = await this.resolveActiveHeader(
      this.databaseService,
      admission.id,
      dto.feePaymentHeaderId,
    );

    const netAmount = new Decimal(header.netAmount.toString());

    if (dto.templateId) {
      const template = await this.templateService.findById(dto.templateId, actorUserId);
      if (!template.isActive) {
        throw new BadRequestException(
          "Deactivated installment template cannot be used for new schedule calculations.",
        );
      }
      if (!dto.firstDueDate) {
        throw new BadRequestException("firstDueDate is required when previewing a template schedule.");
      }

      const calculated = this.calculatorService.calculateSchedule(
        netAmount,
        {
          calculationType: template.calculationType,
          installmentCount: template.installmentCount,
          items: template.items,
        },
        dto.firstDueDate,
        dto.allowFinalAbsorption ?? false,
      );

      return {
        admissionId: admission.id,
        feePaymentHeaderId: header.id,
        scheduleType: InstallmentScheduleType.TEMPLATE,
        templateId: template.id,
        netAmount,
        installmentCount: calculated.installmentCount,
        installments: calculated.installments,
      };
    }

    if (dto.manualSchedule) {
      const manual = dto.manualSchedule;
      if (!manual.justification || !manual.justification.trim()) {
        throw new BadRequestException("Justification is mandatory for custom manual installment schedules.");
      }
      if (!manual.installments || manual.installments.length === 0) {
        throw new BadRequestException("Manual schedule must contain at least one installment.");
      }

      const sorted = [...manual.installments].sort((a, b) => a.sequence - b.sequence);
      let sum = new Decimal(0);

      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].sequence !== i + 1) {
          throw new BadRequestException(
            `Installment sequences must be contiguous starting from 1. Found ${sorted[i].sequence} at index ${i}.`,
          );
        }
        const amt = parseMoney(sorted[i].amount, 'installment amount');
        if (amt.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Installment sequence ${sorted[i].sequence} amount must be strictly positive.`,
          );
        }
        sum = sum.plus(amt);
      }

      if (!sum.equals(netAmount)) {
        throw new BadRequestException(
          `Total installment amount (₹${sum.toFixed(2)}) does not match header net obligation (₹${netAmount.toFixed(2)}).`,
        );
      }

      const previewInstallments = sorted.map((it) => ({
        sequence: it.sequence,
        subSequence: 0,
        label: it.label.trim(),
        amount: parseMoney(it.amount, 'installment amount'),
        dueDate: this.calculatorService.parseDateUtc(it.dueDate),
        dueDateFormatted: it.dueDate,
      }));

      return {
        admissionId: admission.id,
        feePaymentHeaderId: header.id,
        scheduleType: InstallmentScheduleType.CUSTOM,
        netAmount,
        installmentCount: previewInstallments.length,
        installments: previewInstallments,
      };
    }

    throw new BadRequestException("Either templateId or manualSchedule must be provided for preview.");
  }

  /**
   * Creates or replaces a DRAFT installment schedule using an active reusable template.
   */
  async createFromTemplate(
    admissionId: string,
    dto: CreateTemplateScheduleDto,
    actorUserId?: string,
  ) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);

    return this.databaseService.$transaction(async (tx) => {
      // 1. Lock Admission in established hierarchy
      await this.lockAdmission(tx, admission.id);

      const currentAdmission = await tx.admission.findUniqueOrThrow({
        where: { id: admission.id },
      });

      if (currentAdmission.admissionStatus !== AdmissionStatus.DRAFT) {
        throw new BadRequestException(
          `Installment schedule cannot be modified for admission in ${currentAdmission.admissionStatus} status. Only DRAFT admissions can be scheduled.`,
        );
      }

      // 2. Lock and resolve FeePaymentHeader
      const header = await this.resolveActiveHeader(tx, admission.id, dto.feePaymentHeaderId);
      await this.lockHeader(tx, header.id);

      // 3. Resolve active template
      const template = await tx.installmentTemplate.findFirst({
        where: { id: dto.templateId, schoolId: admission.schoolId },
        include: { items: { orderBy: { sequence: "asc" } } },
      });

      if (!template) {
        throw new NotFoundException(`Installment template with id "${dto.templateId}" not found`);
      }

      if (!template.isActive) {
        throw new BadRequestException(
          "Deactivated installment template cannot be used for new schedule calculations.",
        );
      }

      // 4. Calculate schedule amounts and due dates
      const netAmount = new Decimal(header.netAmount.toString());
      const calculated = this.calculatorService.calculateSchedule(
        netAmount,
        {
          calculationType: template.calculationType,
          installmentCount: template.installmentCount,
          items: template.items,
        },
        dto.firstDueDate,
        dto.allowFinalAbsorption ?? false,
      );

      // 5. Check if an existing schedule exists for this header
      const existingSchedule = await tx.admissionInstallmentSchedule.findUnique({
        where: { feePaymentHeaderId: header.id },
      });

      let scheduleId: string;

      if (existingSchedule) {
        scheduleId = existingSchedule.id;
        await this.lockSchedule(tx, scheduleId);
        await this.lockInstallments(tx, scheduleId);

        // Safe DRAFT replacement: delete existing draft transfer edges, events, and installments
        await tx.installmentLineageTransferEdge.deleteMany({ where: { scheduleId } });
        await tx.installmentLineageEvent.deleteMany({ where: { scheduleId } });
        await tx.admissionInstallment.deleteMany({ where: { scheduleId } });

        await tx.admissionInstallmentSchedule.update({
          where: { id: scheduleId },
          data: {
            templateId: template.id,
            scheduleType: InstallmentScheduleType.TEMPLATE,
            totalAmount: calculated.netAmount,
            installmentCount: calculated.installmentCount,
          },
        });
      } else {
        const created = await tx.admissionInstallmentSchedule.create({
          data: {
            schoolId: admission.schoolId,
            admissionId: admission.id,
            feePaymentHeaderId: header.id,
            templateId: template.id,
            scheduleType: InstallmentScheduleType.TEMPLATE,
            totalAmount: calculated.netAmount,
            installmentCount: calculated.installmentCount,
          },
        });
        scheduleId = created.id;
      }

      // 6. Create installment rows
      const createdInstallments: any[] = [];
      for (const item of calculated.installments) {
        const inst = await tx.admissionInstallment.create({
          data: {
            scheduleId,
            feePaymentHeaderId: header.id,
            sequence: item.sequence,
            subSequence: 0,
            offsetAmount: new Prisma.Decimal(0),
            label: item.label,
            amount: item.amount,
            dueDate: item.dueDate,
            status: InstallmentRowStatus.PENDING,
          },
        });
        createdInstallments.push(inst);
      }

      // 7. Create lineage event and initial transfer edges
      const lineageEvent = await tx.installmentLineageEvent.create({
        data: {
          scheduleId,
          eventType: LineageEventType.INITIAL_SCHEDULE,
          description: `Initial schedule created from template "${template.name}"`,
        },
      });

      for (const inst of createdInstallments) {
        await tx.installmentLineageTransferEdge.create({
          data: {
            eventId: lineageEvent.id,
            scheduleId,
            sourceInstallmentId: null,
            resultInstallmentId: inst.id,
            amount: inst.amount,
          },
        });
      }

      return tx.admissionInstallmentSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        include: {
          installments: {
            orderBy: [{ sequence: "asc" }, { subSequence: "asc" }],
          },
          template: true,
        },
      });
    });
  }

  /**
   * Creates or replaces a custom manual installment schedule without a template.
   * Requires a non-empty justification.
   */
  async createManual(
    admissionId: string,
    dto: CreateManualScheduleDto,
    actorUserId?: string,
  ) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);

    const justification = dto.justification?.trim();
    if (!justification) {
      throw new BadRequestException("Justification is mandatory for custom manual installment schedules.");
    }

    if (!dto.installments || dto.installments.length === 0) {
      throw new BadRequestException("Manual schedule must contain at least one installment.");
    }

    return this.databaseService.$transaction(async (tx) => {
      // 1. Lock Admission
      await this.lockAdmission(tx, admission.id);

      const currentAdmission = await tx.admission.findUniqueOrThrow({
        where: { id: admission.id },
      });

      if (currentAdmission.admissionStatus !== AdmissionStatus.DRAFT) {
        throw new BadRequestException(
          `Installment schedule cannot be modified for admission in ${currentAdmission.admissionStatus} status.`,
        );
      }

      // 2. Lock Header
      const header = await this.resolveActiveHeader(tx, admission.id, dto.feePaymentHeaderId);
      await this.lockHeader(tx, header.id);

      const netAmount = new Decimal(header.netAmount.toString());

      // 3. Validate installment items
      const sorted = [...dto.installments].sort((a, b) => a.sequence - b.sequence);
      let sum = new Decimal(0);
      const parsedItems: any[] = [];

      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].sequence !== i + 1) {
          throw new BadRequestException(
            `Installment sequences must be contiguous starting from 1. Found sequence ${sorted[i].sequence} at index ${i}.`,
          );
        }
        const amt = parseMoney(sorted[i].amount, 'installment amount');
        if (amt.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Installment sequence ${sorted[i].sequence} amount must be strictly positive (found ₹${amt.toFixed(2)}).`,
          );
        }
        sum = sum.plus(amt);

        const parsedDate = this.calculatorService.parseDateUtc(sorted[i].dueDate);
        parsedItems.push({
          sequence: sorted[i].sequence,
          label: sorted[i].label.trim(),
          amount: amt,
          dueDate: parsedDate,
        });
      }

      if (!sum.equals(netAmount)) {
        throw new BadRequestException(
          `Total installment amount (₹${sum.toFixed(2)}) does not match fee header net obligation (₹${netAmount.toFixed(2)}).`,
        );
      }

      // 4. Upsert Schedule
      const existingSchedule = await tx.admissionInstallmentSchedule.findUnique({
        where: { feePaymentHeaderId: header.id },
      });

      let scheduleId: string;

      if (existingSchedule) {
        scheduleId = existingSchedule.id;
        await this.lockSchedule(tx, scheduleId);
        await this.lockInstallments(tx, scheduleId);

        await tx.installmentLineageTransferEdge.deleteMany({ where: { scheduleId } });
        await tx.installmentLineageEvent.deleteMany({ where: { scheduleId } });
        await tx.admissionInstallment.deleteMany({ where: { scheduleId } });

        await tx.admissionInstallmentSchedule.update({
          where: { id: scheduleId },
          data: {
            templateId: null,
            scheduleType: InstallmentScheduleType.CUSTOM,
            totalAmount: sum,
            installmentCount: parsedItems.length,
          },
        });
      } else {
        const created = await tx.admissionInstallmentSchedule.create({
          data: {
            schoolId: admission.schoolId,
            admissionId: admission.id,
            feePaymentHeaderId: header.id,
            templateId: null,
            scheduleType: InstallmentScheduleType.CUSTOM,
            totalAmount: sum,
            installmentCount: parsedItems.length,
          },
        });
        scheduleId = created.id;
      }

      // 5. Insert installment rows
      const createdInstallments: any[] = [];
      for (const item of parsedItems) {
        const inst = await tx.admissionInstallment.create({
          data: {
            scheduleId,
            feePaymentHeaderId: header.id,
            sequence: item.sequence,
            subSequence: 0,
            offsetAmount: new Prisma.Decimal(0),
            label: item.label,
            amount: item.amount,
            dueDate: item.dueDate,
            status: InstallmentRowStatus.PENDING,
          },
        });
        createdInstallments.push(inst);
      }

      // 6. Create Lineage Event
      const lineageEvent = await tx.installmentLineageEvent.create({
        data: {
          scheduleId,
          eventType: LineageEventType.INITIAL_SCHEDULE,
          description: `Manual custom schedule created: ${justification}`,
        },
      });

      for (const inst of createdInstallments) {
        await tx.installmentLineageTransferEdge.create({
          data: {
            eventId: lineageEvent.id,
            scheduleId,
            sourceInstallmentId: null,
            resultInstallmentId: inst.id,
            amount: inst.amount,
          },
        });
      }

      return tx.admissionInstallmentSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        include: {
          installments: {
            orderBy: [{ sequence: "asc" }, { subSequence: "asc" }],
          },
        },
      });
    });
  }

  /**
   * Retrieves an admission's active installment schedule.
   */
  async getSchedule(
    admissionId: string,
    actorUserId?: string,
    feePaymentHeaderId?: string,
  ) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);
    const header = await this.resolveActiveHeader(
      this.databaseService,
      admission.id,
      feePaymentHeaderId,
    );

    const schedule = await this.databaseService.admissionInstallmentSchedule.findUnique({
      where: { feePaymentHeaderId: header.id },
      include: {
        installments: {
          orderBy: [{ sequence: "asc" }, { subSequence: "asc" }],
        },
        template: {
          select: {
            id: true,
            name: true,
            calculationType: true,
            isActive: true,
          },
        },
      },
    });

    return {
      admissionId: admission.id,
      admissionStatus: admission.admissionStatus,
      isFrozen: admission.admissionStatus === AdmissionStatus.CONFIRMED,
      header: {
        id: header.id,
        grossAmount: header.grossAmount,
        discountAmount: header.discountAmount,
        netAmount: header.netAmount,
        totalPaidAmount: header.totalPaidAmount,
        totalDueAmount: header.totalDueAmount,
      },
      schedule,
    };
  }

  /**
   * Updates / modifies a DRAFT schedule (adding, removing, reordering, or reallocating installments).
   * Atomically verifies that the mutated installment sum matches the header net obligation.
   */
  async updateDraftSchedule(
    admissionId: string,
    dto: UpdateDraftScheduleDto,
    actorUserId?: string,
  ) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);

    if (!dto.installments || dto.installments.length === 0) {
      throw new BadRequestException("Updated schedule must contain at least one installment.");
    }

    return this.databaseService.$transaction(async (tx) => {
      // 1. Lock Admission
      await this.lockAdmission(tx, admission.id);

      const currentAdmission = await tx.admission.findUniqueOrThrow({
        where: { id: admission.id },
      });

      if (currentAdmission.admissionStatus !== AdmissionStatus.DRAFT) {
        throw new BadRequestException(
          `Installment schedule cannot be modified after admission confirmation. Current status: ${currentAdmission.admissionStatus}.`,
        );
      }

      // 2. Lock Header
      const header = await this.resolveActiveHeader(tx, admission.id, dto.feePaymentHeaderId);
      await this.lockHeader(tx, header.id);

      // 3. Lock Schedule
      const schedule = await tx.admissionInstallmentSchedule.findUnique({
        where: { feePaymentHeaderId: header.id },
      });

      if (!schedule) {
        throw new NotFoundException(
          `No existing installment schedule found for admission "${admission.id}". Create a schedule first.`,
        );
      }

      await this.lockSchedule(tx, schedule.id);
      await this.lockInstallments(tx, schedule.id);

      const netAmount = new Decimal(header.netAmount.toString());

      // 4. Validate updated installments
      const sorted = [...dto.installments].sort((a, b) => a.sequence - b.sequence);
      let sum = new Decimal(0);
      const parsedItems: any[] = [];

      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].sequence !== i + 1) {
          throw new BadRequestException(
            `Installment sequences must be contiguous starting from 1. Found sequence ${sorted[i].sequence} at index ${i}.`,
          );
        }
        const amt = parseMoney(sorted[i].amount, 'installment amount');
        if (amt.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Installment sequence ${sorted[i].sequence} amount must be strictly positive (found ₹${amt.toFixed(2)}).`,
          );
        }
        sum = sum.plus(amt);

        const parsedDate = this.calculatorService.parseDateUtc(sorted[i].dueDate);
        parsedItems.push({
          sequence: sorted[i].sequence,
          label: sorted[i].label.trim(),
          amount: amt,
          dueDate: parsedDate,
        });
      }

      if (!sum.equals(netAmount)) {
        throw new BadRequestException(
          `Total installment amount (₹${sum.toFixed(2)}) does not match fee header net obligation (₹${netAmount.toFixed(2)}).`,
        );
      }

      // 5. Replace draft installments atomically
      await tx.installmentLineageTransferEdge.deleteMany({ where: { scheduleId: schedule.id } });
      await tx.installmentLineageEvent.deleteMany({ where: { scheduleId: schedule.id } });
      await tx.admissionInstallment.deleteMany({ where: { scheduleId: schedule.id } });

      await tx.admissionInstallmentSchedule.update({
        where: { id: schedule.id },
        data: {
          scheduleType: InstallmentScheduleType.CUSTOM,
          totalAmount: sum,
          installmentCount: parsedItems.length,
        },
      });

      const createdInstallments: any[] = [];
      for (const item of parsedItems) {
        const inst = await tx.admissionInstallment.create({
          data: {
            scheduleId: schedule.id,
            feePaymentHeaderId: header.id,
            sequence: item.sequence,
            subSequence: 0,
            offsetAmount: new Prisma.Decimal(0),
            label: item.label,
            amount: item.amount,
            dueDate: item.dueDate,
            status: InstallmentRowStatus.PENDING,
          },
        });
        createdInstallments.push(inst);
      }

      const reason = dto.reason?.trim() || "DRAFT installment schedule updated";
      const lineageEvent = await tx.installmentLineageEvent.create({
        data: {
          scheduleId: schedule.id,
          eventType: LineageEventType.INITIAL_SCHEDULE,
          description: reason,
        },
      });

      for (const inst of createdInstallments) {
        await tx.installmentLineageTransferEdge.create({
          data: {
            eventId: lineageEvent.id,
            scheduleId: schedule.id,
            sourceInstallmentId: null,
            resultInstallmentId: inst.id,
            amount: inst.amount,
          },
        });
      }

      return tx.admissionInstallmentSchedule.findUniqueOrThrow({
        where: { id: schedule.id },
        include: {
          installments: {
            orderBy: [{ sequence: "asc" }, { subSequence: "asc" }],
          },
        },
      });
    });
  }

  /**
   * Retrieves schedule history and lineage events for administrative inspection.
   */
  async getScheduleLineage(
    admissionId: string,
    actorUserId?: string,
    feePaymentHeaderId?: string,
  ) {
    const admission = await this.getAdmissionWithAccess(admissionId, actorUserId);
    const header = await this.resolveActiveHeader(
      this.databaseService,
      admission.id,
      feePaymentHeaderId,
    );

    const schedule = await this.databaseService.admissionInstallmentSchedule.findUnique({
      where: { feePaymentHeaderId: header.id },
      include: {
        lineageEvents: {
          orderBy: { createdAt: "asc" },
          include: {
            transferEdges: {
              include: {
                sourceInstallment: true,
                resultInstallment: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException(`No installment schedule found for admission "${admission.id}".`);
    }

    return {
      admissionId: admission.id,
      scheduleId: schedule.id,
      lineageEvents: schedule.lineageEvents,
    };
  }

  /**
   * Validates confirmation schedules against the already-validated fee net amounts.
   * Zero-net headers must have no schedule; positive-net headers need a matching schedule.
   */
  async confirmAdmissionSchedules(
    tx: any,
    admissionId: string,
    actorUserId?: string,
    validatedNets?: Map<string, Prisma.Decimal>,
  ): Promise<void> {
    const admission = await tx.admission.findUniqueOrThrow({
      where: { id: admissionId },
    });

    // 1. Lock and retrieve all active FeePaymentHeaders in deterministic ID order
    await tx.$queryRaw`SELECT id FROM "FeePaymentHeader" WHERE "admissionId" = ${admission.id} AND "isActive" = true ORDER BY id ASC FOR UPDATE`;

    const headers = await tx.feePaymentHeader.findMany({
      where: { admissionId: admission.id, isActive: true },
      orderBy: { id: "asc" },
      include: {
        installmentSchedule: {
          include: {
            installments: {
              orderBy: [{ sequence: "asc" }, { subSequence: "asc" }],
            },
          },
        },
      },
    });

    if (!headers || headers.length === 0) {
      return;
    }

    for (const header of headers) {
      const netAmount = validatedNets?.get(header.id) ?? new Decimal(header.netAmount.toString());

      if (netAmount.isZero()) {
        if (header.installmentSchedule?.installments.length) {
          throw new BadRequestException("Zero-net admission has existing installment rows.");
        }
        if (header.installmentSchedule) {
          throw new BadRequestException("Zero-net admission must not have an installment schedule.");
        }
        continue;
      }

      const schedule = header.installmentSchedule;
      if (!schedule) {
        throw new BadRequestException("Positive-net admission requires an existing installment schedule.");
      }

      await this.lockSchedule(tx, schedule.id);
      await this.lockInstallments(tx, schedule.id);
      const installments = schedule.installments;
      if (!installments?.length) throw new BadRequestException(`Installment schedule "${schedule.id}" contains no installments.`);
      let total = new Decimal(0);
      for (let i = 0; i < installments.length; i++) {
        if (installments[i].sequence !== i + 1) throw new BadRequestException(`Installment sequence gap in schedule "${schedule.id}".`);
        const amount = new Decimal(installments[i].amount.toString());
        if (amount.lte(0)) throw new BadRequestException(`Installment sequence ${installments[i].sequence} amount must be positive.`);
        total = total.plus(amount);
      }
      if (!total.equals(netAmount) || !new Decimal(schedule.totalAmount.toString()).equals(netAmount)) {
        throw new BadRequestException(`Installment schedule total does not match validated header net obligation (${netAmount.toFixed(2)}).`);
      }
    }
  }
}
