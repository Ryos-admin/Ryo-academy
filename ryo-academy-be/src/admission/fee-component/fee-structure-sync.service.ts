import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AdmissionStatus, InstallmentRowStatus, LineageEventType } from "../../../generated/prisma/enums.js";
import { AdmissionConcessionService } from "../fee-concession/admission-concession.service.js";
import { SyncFeeStructureDto } from "./dto/sync-fee-structure.dto.js";
import {
  getKolkataBusinessDateUtc,
  toUtcDateOnly,
} from "../../common/date/kolkata-business-date.js";

export enum ComponentChangeType {
  NEW_COMPONENT = "NEW_COMPONENT",
  AMOUNT_INCREASED = "AMOUNT_INCREASED",
  AMOUNT_DECREASED = "AMOUNT_DECREASED",
  COMPONENT_DEACTIVATED = "COMPONENT_DEACTIVATED",
  UNCHANGED = "UNCHANGED",
}

export interface SyncPreflightContext {
  feeStructureId: string;
  actorUserId: string;
  eligibleAdmissionIds: string[];
  admissions: Array<{ id: string; admissionStatus: AdmissionStatus; schoolId: string }>;
  headerIds: string[];
  scheduleIds: string[];
  master?: any;
  preflight?: PreflightSyncResult;
}

export interface PreflightSyncResult {
  feeStructureId: string;
  lockedAt: Date;
  eligibleAdmissionCount: number;
  admissionsWithScheduleCount: number;
  admissionsWithoutScheduleCount: number;
  fullySettledCount: number;
  eligibleAdmissionIds: string[];
}

export interface FeeStructureSyncExecutionResult {
  feeStructureId: string;
  synchronizedAt: Date;
  eligibleAdmissionCount: number;
  synchronizedAdmissionCount: number;
  admissionsWithScheduleCount: number;
  admissionsWithoutScheduleCount: number;
  caseAIncreasesCount: number;
  supplementaryRootsCreatedCount: number;
  detailsInsertedCount: number;
  detailsUpdatedCount: number;
}

export type SyncOperationCallback<T> = (
  tx: Prisma.TransactionClient,
  context: SyncPreflightContext,
) => Promise<T>;

/**
 * Validates and resolves supplementary due date according to strict business date rules:
 * - Exact YYYY-MM-DD syntax (no time, no timezone suffixes).
 * - Leap-year and calendar day correctness.
 * - Rejection of past dates relative to Kolkata business date.
 * - Defaulting to AcademicYear endDate.
 * - HTTP 409 ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED if default is past.
 */
export function resolveSupplementaryDueDate(
  dtoDateStr: string | undefined,
  academicYearEndDate: Date,
): Date {
  const kolkataNow = getKolkataBusinessDateUtc();

  if (dtoDateStr !== undefined && dtoDateStr !== null && dtoDateStr.trim() !== "") {
    // 1. Strict YYYY-MM-DD regex (no time, no timezone suffixes)
    const regex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
    if (!regex.test(dtoDateStr)) {
      throw new BadRequestException(
        "supplementaryDueDate must be in exact YYYY-MM-DD format (no time or timezone suffixes).",
      );
    }

    // 2. Calendar and leap-year validation
    const [y, m, d] = dtoDateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (
      dateObj.getUTCFullYear() !== y ||
      dateObj.getUTCMonth() !== m - 1 ||
      dateObj.getUTCDate() !== d
    ) {
      throw new BadRequestException("supplementaryDueDate must be a valid calendar date.");
    }

    // 3. Business date check
    if (dateObj.getTime() < kolkataNow.getTime()) {
      throw new BadRequestException("supplementaryDueDate cannot be in the past.");
    }

    return dateObj;
  }

  // 4. Default to AcademicYear endDate
  const defaultDate = toUtcDateOnly(academicYearEndDate);
  if (defaultDate.getTime() < kolkataNow.getTime()) {
    throw new ConflictException({
      code: "ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED",
      message:
        "Academic year has ended; an explicit future supplementaryDueDate is required.",
    });
  }

  return defaultDate;
}

@Injectable()
export class FeeStructureSyncService {
  private readonly logger = new Logger(FeeStructureSyncService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly admissionConcessionService: AdmissionConcessionService,
  ) {}

  /**
   * Classifies database/Prisma errors into canonical domain exceptions or sanitized errors.
   */
  public classifyDatabaseError(error: any): Error {
    if (error instanceof HttpException) {
      return error;
    }

    const code = error?.code;
    const message = typeof error?.message === "string" ? error.message : "";
    const metaCause = typeof error?.meta?.cause === "string" ? error.meta.cause : "";

    // 1. Direct concurrency / deadlock signals
    if (code === "P2034" || code === "40P01" || code === "55P03" || code === "40001") {
      return new ConflictException({
        code: "CONCURRENT_FINANCIAL_TRANSACTION",
        message: "Concurrent financial modification detected. Please retry the transaction.",
      });
    }

    // 2. Prisma P2028 Triage: Require verified lock-timeout evidence
    if (code === "P2028") {
      const lowerMsg = message.toLowerCase();
      const lowerCause = metaCause.toLowerCase();
      const isLockTimeout =
        lowerMsg.includes("lock timeout") ||
        lowerMsg.includes("canceling statement due to lock timeout") ||
        lowerMsg.includes("timed out") ||
        lowerCause.includes("lock timeout") ||
        lowerCause.includes("timed out") ||
        error?.meta?.database_error_code === "55P03";

      if (isLockTimeout) {
        return new ConflictException({
          code: "CONCURRENT_FINANCIAL_TRANSACTION",
          message: "Exclusive financial lock acquisition timed out due to concurrent activity. Please retry.",
        });
      }

      this.logger.error(`[P2028 Unverified Transaction Closure] Non-lock failure: ${message}`);
      return new InternalServerErrorException({
        code: "TRANSACTION_EXECUTION_FAILED",
        message: "A database transaction error occurred during synchronization. Please retry the operation.",
      });
    }

    // 3. Unique constraint violations
    if (code === "P2002") {
      return new ConflictException({
        code: "DATABASE_UNIQUE_CONSTRAINT_VIOLATION",
        message: "A database unique constraint conflict occurred during synchronization.",
      });
    }

    // 4. Default sanitized internal error
    this.logger.error(`[Unhandled Database Error] ${code ? `Code: ${code} - ` : ""}${message}`);
    return new InternalServerErrorException({
      code: "INTERNAL_SYNCHRONIZATION_ERROR",
      message: "An unexpected error occurred during fee synchronization preflight.",
    });
  }

  /**
   * Primary transaction coordination and preflight entry point.
   * Executes within a single interactive Prisma transaction: { timeout: 30000, maxWait: 10000 }.
   * Strictly enforces:
   * 1. FeeStructure exclusive lock before admission discovery.
   * 2. DRAFT and CONFIRMED admissions discovery (CANCELLED excluded).
   * 3. Deterministic resource locking (ORDER BY id ASC).
   * 4. Pre-mutation integrity validation:
   *    - Paid projection invariant: SUM(amountPaid) == header.totalPaidAmount
   *    - Schedule invariant: schedule.totalAmount == header.netAmount == header.totalFeeAmount
   *    - Pending installment sum == header.totalDueAmount
   */
  async runInSyncCoordination<T = void>(
    feeStructureId: string,
    actorUserId: string,
    operation?: SyncOperationCallback<T>,
  ): Promise<{ preflight: PreflightSyncResult; result?: T }> {
    try {
      return await this.databaseService.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Step 1: Exclusive lock on master FeeStructure
          await this.lockFeeStructure(tx, feeStructureId);

          const master = await tx.feeStructure.findUnique({
            where: { id: feeStructureId },
            include: { academicYear: true },
          });

          if (!master) {
            throw new NotFoundException(`Fee structure with ID "${feeStructureId}" does not exist.`);
          }

          if (!master.isActive || master.deletedAt) {
            throw new ConflictException("Fee structure is inactive or deleted.");
          }

          // Step 2: Discover eligible admissions (DRAFT and CONFIRMED only; CANCELLED excluded)
          const eligibleAdmissions = await tx.admission.findMany({
            where: {
              admissionStatus: { in: [AdmissionStatus.DRAFT, AdmissionStatus.CONFIRMED] },
              feePaymentHeaders: { some: { feeStructureId, isActive: true } },
            },
            select: { id: true, admissionStatus: true, schoolId: true },
            orderBy: { id: "asc" },
          });

          const admissionIds = eligibleAdmissions.map((a) => a.id);
          const lockedAt = new Date();

          let admissionsWithScheduleCount = 0;
          let admissionsWithoutScheduleCount = 0;
          let fullySettledCount = 0;
          const headerIds: string[] = [];
          const scheduleIds: string[] = [];

          if (admissionIds.length > 0) {
            // Step 3: Deterministic lock on eligible Admissions (Level 2)
            await this.lockAdmissions(tx, admissionIds);

            // Step 4: Deterministic lock on active FeePaymentHeaders (Level 3)
            const activeHeaders = await tx.feePaymentHeader.findMany({
              where: {
                admissionId: { in: admissionIds },
                feeStructureId,
                isActive: true,
              },
              orderBy: { id: "asc" },
            });

            for (const h of activeHeaders) {
              headerIds.push(h.id);
            }

            if (headerIds.length > 0) {
              await this.lockHeaders(tx, headerIds);

              // Step 5: Deterministic lock on FeePaymentDetails (Level 4)
              await this.lockDetails(tx, headerIds);

              // Step 6: Discover and lock AdmissionInstallmentSchedules (Level 5)
              const schedules = await tx.admissionInstallmentSchedule.findMany({
                where: { feePaymentHeaderId: { in: headerIds } },
                orderBy: { id: "asc" },
              });

              for (const s of schedules) {
                scheduleIds.push(s.id);
              }

              if (scheduleIds.length > 0) {
                await this.lockSchedules(tx, scheduleIds);

                // Step 7: Deterministic lock on eligible pending, unsuperseded installments (Level 6)
                await this.lockPendingInstallments(tx, scheduleIds);
              }

              // Step 8: Pre-mutation financial integrity validation per admission
              const headersByAdmission = new Map<string, any>();
              for (const h of activeHeaders) {
                headersByAdmission.set(h.admissionId, h);
              }

              const schedulesByHeader = new Map<string, any>();
              for (const s of schedules) {
                schedulesByHeader.set(s.feePaymentHeaderId, s);
              }

              const allDetails = await tx.feePaymentDetails.findMany({
                where: { feePaymentHeaderId: { in: headerIds } },
              });

              const detailsByHeader = new Map<string, any[]>();
              for (const d of allDetails) {
                const list = detailsByHeader.get(d.feePaymentHeaderId) ?? [];
                list.push(d);
                detailsByHeader.set(d.feePaymentHeaderId, list);
              }

              const allInstallments = scheduleIds.length > 0
                ? await tx.admissionInstallment.findMany({
                    where: { scheduleId: { in: scheduleIds } },
                  })
                : [];

              const installmentsBySchedule = new Map<string, any[]>();
              for (const inst of allInstallments) {
                const list = installmentsBySchedule.get(inst.scheduleId) ?? [];
                list.push(inst);
                installmentsBySchedule.set(inst.scheduleId, list);
              }

              for (const admission of eligibleAdmissions) {
                const header = headersByAdmission.get(admission.id);
                if (!header) {
                  continue;
                }

                // Invariant 1: Paid Projection Invariant
                const details = detailsByHeader.get(header.id) ?? [];
                const sumPaid = details.reduce(
                  (sum, d) => sum.plus(new Prisma.Decimal(d.amountPaid.toString())),
                  new Prisma.Decimal(0),
                );
                const headerPaid = new Prisma.Decimal(header.totalPaidAmount.toString());

                if (!sumPaid.equals(headerPaid)) {
                  throw new ConflictException({
                    code: "PAID_PROJECTION_INTEGRITY_MISMATCH",
                    message: `Payment projection mismatch on admission "${admission.id}": header totalPaidAmount (₹${headerPaid}) does not match sum of details amountPaid (₹${sumPaid}).`,
                  });
                }

                const headerNet = new Prisma.Decimal(header.netAmount.toString());
                const headerDue = new Prisma.Decimal(header.totalDueAmount.toString());
                const headerFee = new Prisma.Decimal(header.totalFeeAmount.toString());

                // Invariant 2: Independent Header Balance Invariant
                const expectedDue = headerNet.minus(headerPaid);
                if (!headerDue.equals(expectedDue)) {
                  throw new ConflictException({
                    code: "HEADER_BALANCE_INTEGRITY_MISMATCH",
                    message: `Header due amount mismatch on admission "${admission.id}": expected ₹${expectedDue}, found ₹${headerDue}.`,
                  });
                }

                const schedule = schedulesByHeader.get(header.id);

                if (schedule) {
                  admissionsWithScheduleCount++;

                  // Invariant 3: Schedule Total Parity
                  const scheduleTotal = new Prisma.Decimal(schedule.totalAmount.toString());
                  if (!scheduleTotal.equals(headerNet) || !headerNet.equals(headerFee)) {
                    throw new ConflictException({
                      code: "SCHEDULE_INTEGRITY_VIOLATION",
                      message: `Schedule total mismatch on admission "${admission.id}": schedule total (₹${scheduleTotal}) does not match header net (₹${headerNet}).`,
                    });
                  }

                  // Invariant 4: Pending Installment Parity
                  const installments = installmentsBySchedule.get(schedule.id) ?? [];
                  const pendingLeaves = installments.filter(
                    (inst) => inst.status === InstallmentRowStatus.PENDING && inst.supersededAt === null,
                  );
                  const sumPending = pendingLeaves.reduce(
                    (sum, inst) => sum.plus(new Prisma.Decimal(inst.amount.toString())),
                    new Prisma.Decimal(0),
                  );

                  if (!sumPending.equals(headerDue)) {
                    throw new ConflictException({
                      code: "SCHEDULE_INTEGRITY_VIOLATION",
                      message: `Pending installment sum mismatch on admission "${admission.id}": pending installments (₹${sumPending}) do not match header totalDueAmount (₹${headerDue}).`,
                    });
                  }

                  if (headerDue.isZero() && pendingLeaves.length === 0) {
                    fullySettledCount++;
                  }
                } else {
                  admissionsWithoutScheduleCount++;
                  if (headerDue.isZero()) {
                    fullySettledCount++;
                  }
                }
              }
            }
          }

          const preflight: PreflightSyncResult = {
            feeStructureId,
            lockedAt,
            eligibleAdmissionCount: admissionIds.length,
            admissionsWithScheduleCount,
            admissionsWithoutScheduleCount,
            fullySettledCount,
            eligibleAdmissionIds: admissionIds,
          };

          // Step 9: Execute optional orchestration callback using the same tx client
          let result: T | undefined;
          if (operation) {
            const context: SyncPreflightContext = {
              feeStructureId,
              actorUserId,
              eligibleAdmissionIds: admissionIds,
              admissions: eligibleAdmissions,
              headerIds,
              scheduleIds,
              master,
              preflight,
            };
            result = await operation(tx, context);
          }

          return { preflight, result };
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      throw this.classifyDatabaseError(error);
    }
  }

  // --- Parameterized SQL Locking Helpers ---

  private async lockFeeStructure(tx: Prisma.TransactionClient, feeStructureId: string): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`
        SELECT "id" FROM "FeeStructure" 
        WHERE "id" = ${feeStructureId} 
        FOR UPDATE
      `;
    }
  }

  private async lockAdmissions(tx: Prisma.TransactionClient, admissionIds: string[]): Promise<void> {
    if (typeof tx.$queryRaw === "function" && admissionIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id", "admissionStatus", "schoolId" 
        FROM "Admission" 
        WHERE "id" IN (${Prisma.join(admissionIds)}) 
        ORDER BY "id" ASC 
        FOR UPDATE
      `;
    }
  }

  private async lockHeaders(tx: Prisma.TransactionClient, headerIds: string[]): Promise<void> {
    if (typeof tx.$queryRaw === "function" && headerIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id", "admissionId", "totalFeeAmount", "totalPaidAmount", "totalDueAmount" 
        FROM "FeePaymentHeader" 
        WHERE "id" IN (${Prisma.join(headerIds)}) 
        ORDER BY "id" ASC 
        FOR UPDATE
      `;
    }
  }

  private async lockDetails(tx: Prisma.TransactionClient, headerIds: string[]): Promise<void> {
    if (typeof tx.$queryRaw === "function" && headerIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id", "feePaymentHeaderId", "amountPaid", "totalAmountToBePaid" 
        FROM "FeePaymentDetails" 
        WHERE "feePaymentHeaderId" IN (${Prisma.join(headerIds)}) 
        ORDER BY "id" ASC 
        FOR UPDATE
      `;
    }
  }

  private async lockSchedules(tx: Prisma.TransactionClient, scheduleIds: string[]): Promise<void> {
    if (typeof tx.$queryRaw === "function" && scheduleIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id", "feePaymentHeaderId", "totalAmount", "installmentCount" 
        FROM "AdmissionInstallmentSchedule" 
        WHERE "id" IN (${Prisma.join(scheduleIds)}) 
        ORDER BY "id" ASC 
        FOR UPDATE
      `;
    }
  }

  private async lockPendingInstallments(tx: Prisma.TransactionClient, scheduleIds: string[]): Promise<void> {
    if (typeof tx.$queryRaw === "function" && scheduleIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id", "scheduleId", "amount", "sequence", "subSequence", "offsetAmount", "status" 
        FROM "AdmissionInstallment" 
        WHERE "scheduleId" IN (${Prisma.join(scheduleIds)}) 
          AND "status" = 'PENDING' 
          AND "supersededAt" IS NULL 
        ORDER BY "dueDate" ASC, "sequence" ASC, "subSequence" ASC, "id" ASC 
        FOR UPDATE
      `;
    }
  }

  // =========================================================================
  // SYNCHRONIZATION EXECUTION PIPELINE (TASK 3)
  // =========================================================================

  /**
   * Explicitly executes administrative synchronization of all applicable admissions
   * against the latest master Fee Components of the specified FeeStructure.
   */
  async executeSynchronization(
    feeStructureId: string,
    dto: SyncFeeStructureDto = {},
    actorUserId: string,
    callerSchoolId?: string,
  ): Promise<FeeStructureSyncExecutionResult> {
    const { preflight, result } = await this.runInSyncCoordination(
      feeStructureId,
      actorUserId,
      async (tx: Prisma.TransactionClient, context: SyncPreflightContext) => {
        const master = context.master ?? (await tx.feeStructure.findUniqueOrThrow({
          where: { id: feeStructureId },
          include: { academicYear: true },
        }));

        // Verify server-side school context
        if (
          callerSchoolId &&
          master.academicYear?.schoolId &&
          master.academicYear.schoolId !== callerSchoolId
        ) {
          throw new ForbiddenException(
            "You do not have permission to access or synchronize this fee structure.",
          );
        }

        // Validate and resolve supplementary due date
        const resolvedDueDate = resolveSupplementaryDueDate(
          dto.supplementaryDueDate,
          master.academicYear.endDate,
        );

        // Retrieve active master components
        const masterComponents = await tx.feeComponent.findMany({
          where: {
            feeStructureId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: { id: "asc" },
        });

        let synchronizedAdmissionCount = 0;
        let caseAIncreasesCount = 0;
        let supplementaryRootsCreatedCount = 0;
        let detailsInsertedCount = 0;
        let detailsUpdatedCount = 0;

        // Process each eligible admission
        for (const adm of context.admissions) {
          const header: any = await tx.feePaymentHeader.findFirst({
            where: {
              admissionId: adm.id,
              feeStructureId,
              isActive: true,
            },
            include: {
              feePaymentDetails: {
                include: { concession: true },
                orderBy: { id: "asc" },
              },
              installmentSchedule: {
                include: {
                  installments: {
                    include: {
                      allocations: true,
                      sourceTransferEdges: true,
                      resultTransferEdges: true,
                    },
                    orderBy: [{ sequence: "asc" }, { subSequence: "asc" }, { id: "asc" }],
                  },
                },
              },
            },
          });

          if (!header) continue;

          let admissionDelta = new Prisma.Decimal(0);
          const existingDetailsByCompId = new Map<string, any>(
            (header.feePaymentDetails ?? []).map((d: any) => [d.feeComponentId, d]),
          );

          // Reconcile master components against admission fee details
          for (const comp of masterComponents) {
            const compAmount = new Prisma.Decimal(comp.amount.toString());
            const existingDetail = existingDetailsByCompId.get(comp.id);

            if (!existingDetail) {
              // Missing active master component
              const isMandatory = Boolean(comp.isMandatory);
              const isIncluded = isMandatory; // new optional details default to isIncluded: false

              await tx.feePaymentDetails.create({
                data: {
                  feePaymentHeaderId: header.id,
                  feeComponentId: comp.id,
                  nameSnapshot: comp.name,
                  isActive: true,
                  isIncluded,
                  originalAmount: compAmount,
                  discountApplicable: comp.discountApplicable,
                  isMandatory,
                  discountPercentage: null,
                  discountAmount: new Prisma.Decimal(0),
                  taxableAmount: compAmount,
                  gstPercentage: null,
                  gstAmount: new Prisma.Decimal(0),
                  finalAmount: compAmount,
                  totalAmountToBePaid: compAmount,
                  amountPaid: new Prisma.Decimal(0),
                  paymentDate: new Date(),
                },
              });

              detailsInsertedCount++;
              if (isIncluded) {
                admissionDelta = admissionDelta.plus(compAmount);
              }
            } else {
              // Existing detail
              const detailOriginal = new Prisma.Decimal(existingDetail.originalAmount.toString());
              const amountIncreased = compAmount.gt(detailOriginal);
              const amountDecreased = compAmount.lt(detailOriginal);

              if (amountDecreased) {
                throw new ConflictException({
                  code: "COMPONENT_DECREASE_PROHIBITED",
                  message: `Decreasing component amount from ${detailOriginal} to ${compAmount} is prohibited.`,
                });
              }

              const isMandatoryDrift = Boolean(existingDetail.isMandatory) !== Boolean(comp.isMandatory);
              const discountApplicableDrift =
                Boolean(existingDetail.discountApplicable) !== Boolean(comp.discountApplicable);
              const nameDrift = existingDetail.nameSnapshot !== comp.name;
              const inclusionDrift = comp.isMandatory && !existingDetail.isIncluded;

              if (amountIncreased || isMandatoryDrift || discountApplicableDrift || nameDrift || inclusionDrift) {
                let discountAmount = new Prisma.Decimal(existingDetail.discountAmount.toString());
                let discountPercentage = existingDetail.discountPercentage;
                let taxableAmount: Prisma.Decimal;
                let gstAmount = new Prisma.Decimal((existingDetail.gstAmount ?? 0).toString());
                const gstPercentage = existingDetail.gstPercentage
                  ? new Prisma.Decimal(existingDetail.gstPercentage.toString())
                  : null;
                let totalAmountToBePaid: Prisma.Decimal;
                let finalAmount: Prisma.Decimal;

                let discountApplicable = comp.discountApplicable;
                // Preserve grandfathered concession identity
                if (!comp.discountApplicable && existingDetail.concession?.requiresReview === true) {
                  discountApplicable = false;
                }

                if (amountIncreased) {
                  // Upward amount adjustment: preserve PAYABLE absolute discount
                  if (existingDetail.concession) {
                    discountAmount = new Prisma.Decimal(existingDetail.discountAmount.toString());
                    discountPercentage = compAmount.gt(0)
                      ? discountAmount
                          .mul(100)
                          .div(compAmount)
                          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                      : new Prisma.Decimal(0);
                  } else {
                    discountAmount = new Prisma.Decimal(0);
                    discountPercentage = null;
                  }
                  taxableAmount = compAmount.minus(discountAmount);
                  if (gstPercentage && gstPercentage.gt(0)) {
                    gstAmount = taxableAmount
                      .mul(gstPercentage)
                      .div(100)
                      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
                  } else {
                    gstAmount = new Prisma.Decimal(0);
                  }
                  totalAmountToBePaid = taxableAmount.plus(gstAmount);
                  finalAmount = totalAmountToBePaid;
                } else {
                  taxableAmount = new Prisma.Decimal(
                    (existingDetail.taxableAmount ?? detailOriginal.minus(discountAmount)).toString(),
                  );
                  totalAmountToBePaid = new Prisma.Decimal(existingDetail.totalAmountToBePaid.toString());
                  finalAmount = new Prisma.Decimal(existingDetail.finalAmount.toString());
                }

                let isMandatory = comp.isMandatory;
                let isIncluded = existingDetail.isIncluded;
                if (isMandatory && !isIncluded) {
                  isIncluded = true;
                }

                await tx.feePaymentDetails.update({
                  where: { id: existingDetail.id },
                  data: {
                    nameSnapshot: comp.name,
                    originalAmount: compAmount,
                    discountPercentage,
                    discountAmount,
                    taxableAmount,
                    gstPercentage,
                    gstAmount,
                    totalAmountToBePaid,
                    finalAmount,
                    isMandatory,
                    isIncluded,
                    discountApplicable,
                  },
                });

                detailsUpdatedCount++;

                if (isIncluded) {
                  const oldPayable = existingDetail.isIncluded
                    ? new Prisma.Decimal(existingDetail.totalAmountToBePaid.toString())
                    : new Prisma.Decimal(0);
                  const newPayable = totalAmountToBePaid;
                  const delta = newPayable.minus(oldPayable);
                  if (delta.gt(0)) {
                    admissionDelta = admissionDelta.plus(delta);
                  }
                }
              }
            }
          }

          // Authoritative Recomputation
          await this.admissionConcessionService.recomputeV0(tx, header.id);

          // Assert snapshot consistency post-recompute
          const refreshedDetails = await tx.feePaymentDetails.findMany({
            where: { feePaymentHeaderId: header.id, isActive: true, isIncluded: true },
            include: { concession: true },
          });
          for (const d of refreshedDetails) {
            const orig = new Prisma.Decimal(d.originalAmount.toString());
            const disc = new Prisma.Decimal(d.discountAmount.toString());
            const pay = new Prisma.Decimal(d.totalAmountToBePaid.toString());
            const fin = new Prisma.Decimal(d.finalAmount.toString());
            if (
              orig.lt(0) ||
              pay.lt(0) ||
              pay.gt(orig) ||
              !orig.minus(disc).equals(pay) ||
              !fin.equals(pay)
            ) {
              throw new ConflictException("FINANCIAL_SNAPSHOT_INCONSISTENT");
            }
          }

          // Installment Schedule reconciliation
          if (admissionDelta.gt(0) && header.installmentSchedule) {
            const schedule = header.installmentSchedule;
            const allInstallments = schedule.installments ?? [];

            // Find eligible pending installments
            const pendingInstallments = allInstallments
              .filter(
                (inst: any) =>
                  inst.status === InstallmentRowStatus.PENDING && inst.supersededAt === null,
              )
              .sort((a: any, b: any) => {
                if (a.sequence !== b.sequence) return a.sequence - b.sequence;
                return a.subSequence - b.subSequence;
              });

            if (pendingInstallments.length > 0) {
              const lastPending = pendingInstallments[pendingInstallments.length - 1];

              // Check 9 conditions for Case A
              const isPending = lastPending.status === InstallmentRowStatus.PENDING;
              const isUnsuperseded = lastPending.supersededAt === null;
              const isRootSubseq = lastPending.subSequence === 0;
              const isRootInstallment = lastPending.rootInstallmentId === null;
              const isZeroOffset = new Prisma.Decimal(lastPending.offsetAmount.toString()).isZero();
              const hasZeroAllocations = (lastPending.allocations ?? []).length === 0;
              const hasZeroDescendants = !allInstallments.some(
                (inst: any) => inst.rootInstallmentId === lastPending.id,
              );
              const initialEdges = (lastPending.resultTransferEdges ?? []).filter(
                (edge: any) => edge.sourceInstallmentId === null,
              );
              const hasSingleInitialEdge = initialEdges.length === 1;
              const edgeAmountParity =
                hasSingleInitialEdge &&
                new Prisma.Decimal(initialEdges[0].amount.toString()).equals(
                  new Prisma.Decimal(lastPending.amount.toString()),
                );

              const isCaseA =
                isPending &&
                isUnsuperseded &&
                isRootSubseq &&
                isRootInstallment &&
                isZeroOffset &&
                hasZeroAllocations &&
                hasZeroDescendants &&
                hasSingleInitialEdge &&
                edgeAmountParity;

              if (isCaseA) {
                // CASE A: In-Place Root Increase
                const previousAmount = new Prisma.Decimal(lastPending.amount.toString());
                const newAmount = previousAmount.plus(admissionDelta);

                await tx.admissionInstallment.update({
                  where: { id: lastPending.id },
                  data: { amount: newAmount },
                });

                await tx.installmentLineageTransferEdge.update({
                  where: { id: initialEdges[0].id },
                  data: { amount: newAmount },
                });

                await tx.admissionInstallmentSchedule.update({
                  where: { id: schedule.id },
                  data: {
                    totalAmount: new Prisma.Decimal(schedule.totalAmount.toString()).plus(
                      admissionDelta,
                    ),
                  },
                });

                await tx.installmentLineageEvent.create({
                  data: {
                    scheduleId: schedule.id,
                    feePaymentId: null,
                    eventType: LineageEventType.FEE_REVISION,
                    description: JSON.stringify({
                      schemaVersion: 1,
                      variant: "IN_PLACE_ROOT_INCREASE",
                      installmentId: lastPending.id,
                      sequence: lastPending.sequence,
                      previousAmount: previousAmount.toFixed(2),
                      newAmount: newAmount.toFixed(2),
                      deltaAmount: admissionDelta.toFixed(2),
                    }),
                  },
                });

                caseAIncreasesCount++;
              } else {
                // CASE B: Split Leaf Protection -> Supplementary Root
                await this.createSupplementaryRoot(
                  tx,
                  schedule,
                  header.id,
                  allInstallments,
                  admissionDelta,
                  resolvedDueDate,
                );
                supplementaryRootsCreatedCount++;
              }
            } else {
              // CASE C: All Paid Protection -> Supplementary Root
              await this.createSupplementaryRoot(
                tx,
                schedule,
                header.id,
                allInstallments,
                admissionDelta,
                resolvedDueDate,
              );
              supplementaryRootsCreatedCount++;
            }
          }

          synchronizedAdmissionCount++;
        }

        return {
          feeStructureId,
          synchronizedAt: new Date(),
          eligibleAdmissionCount: context.admissions.length,
          synchronizedAdmissionCount,
          admissionsWithScheduleCount: context.preflight?.admissionsWithScheduleCount ?? 0,
          admissionsWithoutScheduleCount: context.preflight?.admissionsWithoutScheduleCount ?? 0,
          caseAIncreasesCount,
          supplementaryRootsCreatedCount,
          detailsInsertedCount,
          detailsUpdatedCount,
        };
      },
    );

    return result!;
  }

  private async createSupplementaryRoot(
    tx: Prisma.TransactionClient,
    schedule: any,
    feePaymentHeaderId: string,
    allInstallments: any[],
    deltaAmount: Prisma.Decimal,
    dueDate: Date,
  ): Promise<void> {
    const maxSequence = allInstallments.reduce(
      (max: number, inst: any) => Math.max(max, inst.sequence ?? 0),
      0,
    );
    const newSequence = maxSequence + 1;

    const supplementaryInst = await tx.admissionInstallment.create({
      data: {
        scheduleId: schedule.id,
        feePaymentHeaderId,
        sequence: newSequence,
        subSequence: 0,
        offsetAmount: new Prisma.Decimal(0),
        rootInstallmentId: null,
        label: `Supplementary Installment ${newSequence}`,
        amount: deltaAmount,
        dueDate,
        status: InstallmentRowStatus.PENDING,
      },
    });

    await tx.admissionInstallmentSchedule.update({
      where: { id: schedule.id },
      data: {
        totalAmount: new Prisma.Decimal(schedule.totalAmount.toString()).plus(deltaAmount),
        installmentCount: schedule.installmentCount + 1,
      },
    });

    const revisionEvent = await tx.installmentLineageEvent.create({
      data: {
        scheduleId: schedule.id,
        feePaymentId: null,
        eventType: LineageEventType.FEE_REVISION,
        description: JSON.stringify({
          schemaVersion: 1,
          variant: "SUPPLEMENTARY_ROOT",
          sequence: newSequence,
          amount: deltaAmount.toFixed(2),
          dueDate: dueDate.toISOString().slice(0, 10),
        }),
      },
    });

    await tx.installmentLineageTransferEdge.create({
      data: {
        eventId: revisionEvent.id,
        scheduleId: schedule.id,
        sourceInstallmentId: null,
        resultInstallmentId: supplementaryInst.id,
        amount: deltaAmount,
      },
    });
  }
}
