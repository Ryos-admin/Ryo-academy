import { Injectable, Logger } from '@nestjs/common';
import {
  AdmissionInstallment,
  AdmissionInstallmentSchedule,
  InstallmentLineageEvent,
  InstallmentLineageTransferEdge,
  InstallmentRowStatus,
  Prisma,
} from '../../../generated/prisma/client.js';
import '../../common/money/decimal-precision.js';
import { DatabaseService } from '../../database/database.service.js';

export class BackfillException extends Error {
  constructor(
    public readonly code: string,
    public readonly entityId: string,
    public readonly details: any = {},
    message?: string,
  ) {
    super(message ?? `Backfill exception [${code}] on entity ${entityId}: ${JSON.stringify(details)}`);
    this.name = 'BackfillException';
  }
}

export interface BackfillSummary {
  schedulesProcessed: number;
  installmentsBackfilled: number;
  exceptionsEncountered: number;
}

@Injectable()
export class HistoricalOffsetBackfillService {
  private readonly logger = new Logger(HistoricalOffsetBackfillService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Runs the complete backfill and interval validation across all schedules.
   * Persists a durable OffsetBackfillRun record before beginning the reconstruction transaction.
   * If any invariant fails, rolls back and logs durably to BackfillExceptionLog and OffsetBackfillRun via independent connection.
   */
  async runBackfill(migrationRunId: string, databaseUrl?: string): Promise<BackfillSummary> {
    const targetUrl = databaseUrl ?? process.env.DATABASE_URL;
    const independentDb = new DatabaseService({ getOrThrow: () => targetUrl } as any);
    await independentDb.$connect();

    // 1. Detect stale RUNNING records and mark as INTERRUPTED
    try {
      await independentDb.offsetBackfillRun.updateMany({
        where: { status: 'RUNNING' },
        data: {
          status: 'INTERRUPTED',
          completedAt: new Date(),
          failureDetails: {
            reason: 'Process interrupted prior to completion (detected on restart)',
            detectedAt: new Date().toISOString(),
          },
        },
      });
    } catch (e: any) {
      // If table doesn't exist yet (e.g. before migration), log warning and continue
      this.logger.warn(`Could not check stale OffsetBackfillRun records: ${e.message}`);
    }

    // 2. Persist durable RUNNING record before starting transaction
    let backfillRunId: string | null = null;
    try {
      const runRecord = await independentDb.offsetBackfillRun.create({
        data: {
          migrationRunId,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      backfillRunId = runRecord.id;
    } catch (e: any) {
      this.logger.warn(`Could not persist initial OffsetBackfillRun record: ${e.message}`);
    }

    let backfillError: any = null;
    let summary: BackfillSummary = {
      schedulesProcessed: 0,
      installmentsBackfilled: 0,
      exceptionsEncountered: 0,
    };

    try {
      summary = await independentDb.$transaction(async (tx) => {
        const schedules = await tx.admissionInstallmentSchedule.findMany({
          orderBy: { createdAt: 'asc' },
        });

        let totalInstallments = 0;

        for (const schedule of schedules) {
          // 1. Validate complete schedule-level graph inventory
          const { sequenceRoots, installmentsBySequence } = await this.validateScheduleLevelGraph(
            tx,
            schedule,
          );

          // 2. Validate Root obligations against schedule and header
          await this.validateRootObligations(tx, schedule, sequenceRoots);

          // 3. For each sequence, reconstruct offsets topologically
          for (let seq = 1; seq <= schedule.installmentCount; seq++) {
            const root = sequenceRoots.get(seq);
            if (!root) {
              throw new BackfillException('ERR_MISSING_EXPECTED_SEQUENCE', schedule.id, { missingSequence: seq });
            }

            const updatedCount = await this.backfillSequenceOffsets(tx, schedule, seq, root);
            totalInstallments += updatedCount;

            // 4. Validate active interval integrity
            const seqInstallments = await tx.admissionInstallment.findMany({
              where: { scheduleId: schedule.id, sequence: seq },
            });
            const allEdges = await tx.installmentLineageTransferEdge.findMany({
              where: { scheduleId: schedule.id },
            });

            this.validateSequenceIntervalIntegrity(
              seq,
              new Prisma.Decimal(root.amount.toString()),
              seqInstallments,
              allEdges,
            );
          }
        }

        return {
          schedulesProcessed: schedules.length,
          installmentsBackfilled: totalInstallments,
          exceptionsEncountered: 0,
        };
      });
    } catch (err: any) {
      backfillError = err;
    }

    if (backfillError) {
      summary.exceptionsEncountered++;
      let durableLoggingError: any = null;

      try {
        await this.logDurableFailure(independentDb, migrationRunId, backfillError);
        if (backfillRunId) {
          await independentDb.offsetBackfillRun.update({
            where: { id: backfillRunId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              failureDetails: {
                errorCode: backfillError.code ?? 'ERR_BACKFILL_FAILED',
                message: backfillError.message ?? String(backfillError),
                entityId: backfillError.entityId,
                details: backfillError.details,
              },
            },
          });
        }
      } catch (logErr: any) {
        durableLoggingError = logErr;
      }

      await independentDb.$disconnect();

      if (durableLoggingError) {
        throw new Error(
          `Backfill failed (${backfillError.message}) AND durable logging failed (${durableLoggingError.message})`,
        );
      }
      throw backfillError;
    }

    // Record successful completion
    if (backfillRunId) {
      try {
        await independentDb.offsetBackfillRun.update({
          where: { id: backfillRunId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            schedulesProcessed: summary.schedulesProcessed,
            totalBackfilled: summary.installmentsBackfilled,
          },
        });
      } catch (e: any) {
        this.logger.warn(`Could not update OffsetBackfillRun status to COMPLETED: ${e.message}`);
      }
    }

    await independentDb.$disconnect();
    return summary;
  }

  /**
   * Validates schedule-level inventory completeness, edge cardinalities, conservation, and cycles.
   */
  async validateScheduleLevelGraph(
    tx: Prisma.TransactionClient,
    schedule: AdmissionInstallmentSchedule,
  ): Promise<{
    sequenceRoots: Map<number, AdmissionInstallment>;
    installmentsBySequence: Map<number, AdmissionInstallment[]>;
  }> {
    const scheduleId = schedule.id;

    const allEvents = await tx.installmentLineageEvent.findMany({
      where: { scheduleId },
      include: { transferEdges: true },
    });

    const allEdges = await tx.installmentLineageTransferEdge.findMany({
      where: { scheduleId },
    });

    const allInstallments = await tx.admissionInstallment.findMany({
      where: { scheduleId },
    });

    // 0. Installment Sequence Bounds Validation
    for (const inst of allInstallments) {
      if (inst.sequence < 1 || inst.sequence > schedule.installmentCount) {
        throw new BackfillException('ERR_SEQUENCE_OUT_OF_BOUNDS', inst.id, {
          sequence: inst.sequence,
          installmentCount: schedule.installmentCount,
        });
      }
    }

    const instMap = new Map(allInstallments.map((i) => [i.id, i]));
    const eventMap = new Map(allEvents.map((e) => [e.id, e]));

    // 1. Initial Schedule Event Cardinality
    const initialEvents = allEvents.filter((e) => e.eventType === 'INITIAL_SCHEDULE');
    if (initialEvents.length !== 1) {
      throw new BackfillException('ERR_INITIAL_EVENT_CARDINALITY', scheduleId, {
        expected: 1,
        found: initialEvents.length,
      });
    }
    const initialEvent = initialEvents[0];

    // 2. Event-Specific Edge Cardinality & Conservation Checks
    const validatedEventIds = new Set<string>();
    const validatedEdgeIds = new Set<string>();

    for (const ev of allEvents) {
      if (validatedEventIds.has(ev.id)) {
        throw new BackfillException('ERR_DUPLICATE_EVENT_PROCESSING', ev.id, {});
      }
      validatedEventIds.add(ev.id);

      if (ev.eventType === 'INITIAL_SCHEDULE') {
        if (ev.transferEdges.length !== schedule.installmentCount) {
          throw new BackfillException('ERR_INITIAL_EDGE_CARDINALITY', ev.id, {
            expected: schedule.installmentCount,
            found: ev.transferEdges.length,
          });
        }
        for (const edge of ev.transferEdges) {
          if (edge.sourceInstallmentId !== null) {
            throw new BackfillException('ERR_INITIAL_EDGE_HAS_SOURCE', edge.id, {
              sourceId: edge.sourceInstallmentId,
            });
          }
          const result = instMap.get(edge.resultInstallmentId);
          if (!result || !result.amount.equals(edge.amount)) {
            throw new BackfillException('ERR_INITIAL_EDGE_AMOUNT_MISMATCH', edge.id, {});
          }
          validatedEdgeIds.add(edge.id);
        }
      } else if (ev.eventType === 'PAYMENT_AUTO_SPLIT') {
        if (ev.transferEdges.length !== 2) {
          throw new BackfillException('ERR_SPLIT_EDGE_CARDINALITY', ev.id, {
            expected: 2,
            found: ev.transferEdges.length,
          });
        }
        const [e1, e2] = ev.transferEdges;
        if (!e1.sourceInstallmentId || e1.sourceInstallmentId !== e2.sourceInstallmentId) {
          throw new BackfillException('ERR_SPLIT_SOURCE_MISMATCH', ev.id, {});
        }
        const source = instMap.get(e1.sourceInstallmentId);
        if (!source) throw new BackfillException('ERR_MISSING_SOURCE_INSTALLMENT', e1.id, {});
        if (!source.amount.equals(e1.amount.plus(e2.amount))) {
          throw new BackfillException('ERR_SPLIT_CONSERVATION_MISMATCH', ev.id, {
            sourceAmount: source.amount,
            edgeSum: e1.amount.plus(e2.amount),
          });
        }
        validatedEdgeIds.add(e1.id);
        validatedEdgeIds.add(e2.id);
      } else if (ev.eventType === 'REVERSAL_RESTORE') {
        if (ev.transferEdges.length !== 1) {
          throw new BackfillException('ERR_RESTORE_EDGE_CARDINALITY', ev.id, {
            expected: 1,
            found: ev.transferEdges.length,
          });
        }
        const e = ev.transferEdges[0];
        if (!e.sourceInstallmentId) throw new BackfillException('ERR_RESTORE_MISSING_SOURCE', e.id, {});
        const source = instMap.get(e.sourceInstallmentId);
        if (!source) throw new BackfillException('ERR_MISSING_SOURCE_INSTALLMENT', e.id, {});
        if (!source.amount.equals(e.amount)) {
          throw new BackfillException('ERR_RESTORE_CONSERVATION_MISMATCH', ev.id, {
            sourceAmount: source.amount,
            edgeAmount: e.amount,
          });
        }
        validatedEdgeIds.add(e.id);
      } else {
        throw new BackfillException('ERR_UNSUPPORTED_EVENT_TYPE', ev.id, { eventType: ev.eventType });
      }
    }

    if (validatedEventIds.size !== allEvents.length) {
      throw new BackfillException('ERR_EVENT_OMITTED_FROM_VALIDATION', scheduleId, {});
    }
    if (validatedEdgeIds.size !== allEdges.length) {
      throw new BackfillException('ERR_EDGE_OMITTED_FROM_VALIDATION', scheduleId, {});
    }

    // 3. Establish Sequence Roots
    const sequenceRoots = new Map<number, AdmissionInstallment>();
    for (const edge of initialEvent.transferEdges) {
      const rootInst = instMap.get(edge.resultInstallmentId)!;
      if (rootInst.rootInstallmentId !== null) {
        throw new BackfillException('ERR_ROOT_CONVENTION_VIOLATION', rootInst.id, {
          rootInstallmentId: rootInst.rootInstallmentId,
        });
      }
      if (sequenceRoots.has(rootInst.sequence)) {
        throw new BackfillException('ERR_DUPLICATE_SEQUENCE_ROOT', edge.id, { sequence: rootInst.sequence });
      }
      sequenceRoots.set(rootInst.sequence, rootInst);
    }

    for (let s = 1; s <= schedule.installmentCount; s++) {
      if (!sequenceRoots.has(s)) {
        throw new BackfillException('ERR_MISSING_EXPECTED_SEQUENCE', scheduleId, { missingSequence: s });
      }
    }

    // 4. Validate Sequence Subgraphs (Kahn's Topological Traversal)
    const installmentsBySequence = new Map<number, AdmissionInstallment[]>();

    for (let s = 1; s <= schedule.installmentCount; s++) {
      const root = sequenceRoots.get(s)!;
      const seqInstallments = allInstallments.filter((i) => i.sequence === s);
      installmentsBySequence.set(s, seqInstallments);

      const adj = new Map<string, string[]>();
      const inDegree = new Map<string, number>();
      seqInstallments.forEach((i) => {
        adj.set(i.id, []);
        inDegree.set(i.id, 0);
      });

      for (const inst of seqInstallments) {
        const outEdges = allEdges.filter((e) => e.sourceInstallmentId === inst.id);
        for (const e of outEdges) {
          const dest = instMap.get(e.resultInstallmentId);
          if (!dest || dest.sequence !== s) {
            throw new BackfillException('ERR_CROSS_SEQUENCE_EDGE', e.id, {});
          }
          adj.get(inst.id)!.push(dest.id);
          inDegree.set(dest.id, (inDegree.get(dest.id) ?? 0) + 1);
        }
      }

      if (inDegree.get(root.id) !== 0) {
        throw new BackfillException('ERR_ROOT_HAS_INCOMING_EDGES', root.id, {});
      }

      for (const inst of seqInstallments) {
        if (inst.id === root.id) continue;
        if (inDegree.get(inst.id) !== 1) {
          throw new BackfillException('ERR_INVALID_IN_DEGREE', inst.id, { inDegree: inDegree.get(inst.id) });
        }
        if (inst.rootInstallmentId !== root.id) {
          throw new BackfillException('ERR_DESCENDANT_ROOT_MISMATCH', inst.id, {
            expected: root.id,
            actual: inst.rootInstallmentId,
          });
        }
      }

      // Kahn's Topological Sort
      const queue: string[] = [root.id];
      let visited = 0;
      while (queue.length > 0) {
        const u = queue.shift()!;
        visited++;
        for (const v of adj.get(u)!) {
          const d = inDegree.get(v)! - 1;
          inDegree.set(v, d);
          if (d === 0) queue.push(v);
        }
      }

      if (visited !== seqInstallments.length) {
        throw new BackfillException('ERR_CYCLE_OR_UNREACHABLE_NODE', scheduleId, { sequence: s });
      }
    }

    return { sequenceRoots, installmentsBySequence };
  }

  /**
   * Validates that root amounts equal sequence obligations, and reconcile to schedule and header totals.
   */
  async validateRootObligations(
    tx: Prisma.TransactionClient,
    schedule: AdmissionInstallmentSchedule,
    sequenceRoots: Map<number, AdmissionInstallment>,
  ): Promise<void> {
    const header = await tx.feePaymentHeader.findUnique({
      where: { id: schedule.feePaymentHeaderId },
    });

    if (!header) {
      throw new BackfillException('ERR_SCHEDULE_HEADER_NOT_FOUND', schedule.id, {
        headerId: schedule.feePaymentHeaderId,
      });
    }

    let rootSum = new Prisma.Decimal(0);
    for (const [seq, root] of sequenceRoots.entries()) {
      rootSum = rootSum.plus(new Prisma.Decimal(root.amount.toString()));
    }

    const scheduleTotal = new Prisma.Decimal(schedule.totalAmount.toString());
    const headerTotal = new Prisma.Decimal(header.totalFeeAmount.toString());
    const netAmount = new Prisma.Decimal(header.netAmount.toString());

    if (!rootSum.equals(scheduleTotal)) {
      throw new BackfillException('ERR_ROOT_SUM_SCHEDULE_MISMATCH', schedule.id, {
        rootSum: rootSum.toString(),
        scheduleTotal: scheduleTotal.toString(),
      });
    }

    if (!scheduleTotal.equals(headerTotal) || !scheduleTotal.equals(netAmount)) {
      throw new BackfillException('ERR_SCHEDULE_HEADER_OBLIGATION_MISMATCH', schedule.id, {
        scheduleTotal: scheduleTotal.toString(),
        headerTotal: headerTotal.toString(),
        netAmount: netAmount.toString(),
      });
    }

    if (!headerTotal.equals(netAmount)) {
      throw new BackfillException('ERR_HEADER_TOTAL_NET_MISMATCH', header.id, {
        headerTotal: headerTotal.toString(),
        netAmount: netAmount.toString(),
      });
    }
  }

  /**
   * Runs a single-schedule backfill within an atomic transaction.
   * Returns { success, error?, installmentsUpdated } — never throws.
   * On failure the transaction is rolled back and the error is logged durably
   * via an independent DB connection so the BackfillExceptionLog write survives
   * the rollback.
   *
   * This is the per-schedule entry point used by integration tests and by ad-hoc
   * operational tooling. The bulk migration runner `runBackfill` calls the lower-
   * level `backfillSequenceOffsets` directly inside its own transaction.
   */
  async backfillScheduleOffsets(scheduleId: string): Promise<{
    success: boolean;
    error?: string;
    installmentsUpdated: number;
  }> {
    let installmentsUpdated = 0;

    try {
      installmentsUpdated = await this.db.$transaction(async (tx) => {
        const schedule = await tx.admissionInstallmentSchedule.findUnique({
          where: { id: scheduleId },
        });
        if (!schedule) {
          throw new BackfillException('ERR_SCHEDULE_NOT_FOUND', scheduleId);
        }

        const { sequenceRoots } = await this.validateScheduleLevelGraph(tx, schedule);
        await this.validateRootObligations(tx, schedule, sequenceRoots);

        let total = 0;
        for (let seq = 1; seq <= schedule.installmentCount; seq++) {
          const root = sequenceRoots.get(seq);
          if (!root) {
            throw new BackfillException('ERR_MISSING_EXPECTED_SEQUENCE', scheduleId, {
              missingSequence: seq,
            });
          }

          const updatedCount = await this.backfillSequenceOffsets(tx, schedule, seq, root);
          total += updatedCount;

          const seqInstallments = await tx.admissionInstallment.findMany({
            where: { scheduleId: schedule.id, sequence: seq },
          });
          const allEdges = await tx.installmentLineageTransferEdge.findMany({
            where: { scheduleId: schedule.id },
          });
          this.validateSequenceIntervalIntegrity(
            seq,
            new Prisma.Decimal(root.amount.toString()),
            seqInstallments,
            allEdges,
          );
        }

        return total;
      });

      return { success: true, installmentsUpdated };
    } catch (err: any) {
      // Log durably via an independent connection so the write survives the rollback.
      // Enrich the error with the schedule's feePaymentHeaderId so the log is queryable
      // by header (the test fixture and operational tooling both query by header id).
      const independentDb = new DatabaseService({
        getOrThrow: () => process.env.DATABASE_URL,
      } as any);
      await independentDb.$connect();

      // Best-effort: attach the header id to the error before logging
      if (!err.feePaymentHeaderId) {
        try {
          const sched = await independentDb.admissionInstallmentSchedule.findUnique({
            where: { id: scheduleId },
            select: { feePaymentHeaderId: true, admissionId: true, admission: { select: { schoolId: true } } },
          });
          if (sched) {
            err.feePaymentHeaderId = sched.feePaymentHeaderId;
            if (!err.admissionId) err.admissionId = sched.admissionId;
            if (!err.schoolId) err.schoolId = (sched as any).admission?.schoolId ?? 'BACKFILL_GLOBAL';
          }
        } catch {
          // ignore enrichment failure — logDurableFailure will use 'BACKFILL_GLOBAL'
        }
      }

      await this.logDurableFailure(independentDb, `schedule:${scheduleId}`, err);
      await independentDb.$disconnect();

      return { success: false, error: err.message ?? String(err), installmentsUpdated: 0 };
    }
  }

  /**
   * Reconstructs offsets for a sequence by traversing its lineage DAG from the root.
   */
  async backfillSequenceOffsets(
    tx: Prisma.TransactionClient,
    schedule: AdmissionInstallmentSchedule,
    sequence: number,
    root: AdmissionInstallment,
  ): Promise<number> {
    const installments = await tx.admissionInstallment.findMany({
      where: { scheduleId: schedule.id, sequence },
      include: {
        sourceTransferEdges: {
          include: {
            event: { include: { transferEdges: true } },
          },
        },
      },
    });

    const offsetMap = new Map<string, Prisma.Decimal>();
    offsetMap.set(root.id, new Prisma.Decimal(0));

    const queue: string[] = [root.id];
    const processedEvents = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentOffset = offsetMap.get(currentId)!;
      const currentInst = installments.find((i) => i.id === currentId)!;

      for (const edge of currentInst.sourceTransferEdges) {
        const ev = edge.event;
        if (processedEvents.has(ev.id)) continue;
        processedEvents.add(ev.id);

        if (ev.eventType === 'PAYMENT_AUTO_SPLIT') {
          const { settledEdge, remainingEdge, paymentId } = await this.resolveSplitEventSettledChild(
            tx,
            schedule,
            ev,
            currentInst,
          );

          // Populate feePaymentId if missing
          if (!ev.feePaymentId) {
            await tx.installmentLineageEvent.update({
              where: { id: ev.id },
              data: { feePaymentId: paymentId },
            });
          }

          const settledAmount = new Prisma.Decimal(settledEdge.amount.toString());
          offsetMap.set(settledEdge.resultInstallmentId, currentOffset);
          offsetMap.set(remainingEdge.resultInstallmentId, currentOffset.plus(settledAmount));

          queue.push(settledEdge.resultInstallmentId, remainingEdge.resultInstallmentId);
        } else if (ev.eventType === 'REVERSAL_RESTORE') {
          const restoreEdge = ev.transferEdges[0];
          offsetMap.set(restoreEdge.resultInstallmentId, currentOffset);
          queue.push(restoreEdge.resultInstallmentId);
        }
      }
    }

    // Verify all sequence installments received an offset
    for (const inst of installments) {
      if (!offsetMap.has(inst.id)) {
        throw new BackfillException('ERR_INSTALLMENT_ORPHANED_OFFSET', inst.id, { sequence });
      }
    }

    // Update offsets
    for (const [id, offset] of offsetMap.entries()) {
      await tx.admissionInstallment.update({
        where: { id },
        data: { offsetAmount: offset },
      });
    }

    return installments.length;
  }

  /**
   * Resolves the exact settled child and remaining child for a PAYMENT_AUTO_SPLIT event.
   */
  async resolveSplitEventSettledChild(
    tx: Prisma.TransactionClient,
    schedule: AdmissionInstallmentSchedule,
    event: InstallmentLineageEvent & { transferEdges: InstallmentLineageTransferEdge[] },
    sourceInstallment: AdmissionInstallment,
  ): Promise<{
    settledEdge: InstallmentLineageTransferEdge;
    remainingEdge: InstallmentLineageTransferEdge;
    paymentId: string;
  }> {
    let paymentId = event.feePaymentId;
    if (!paymentId) {
      if (!event.description) {
        throw new BackfillException('ERR_MISSING_LINEAGE_DESCRIPTION', event.id, {});
      }
      const match = event.description.match(
        /^Auto-split from payment ([0-9a-fA-F-]{36}): allocated ([0-9.]+), remaining ([0-9.]+)$/,
      );
      if (!match) {
        throw new BackfillException('ERR_MALFORMED_LINEAGE_DESCRIPTION', event.id, {
          description: event.description,
        });
      }
      paymentId = match[1];
    }

    const payment = await tx.feePayment.findFirst({
      where: {
        id: paymentId,
        feePaymentHeaderId: schedule.feePaymentHeaderId,
        admissionId: schedule.admissionId,
        schoolId: schedule.schoolId,
      },
    });

    if (!payment) {
      throw new BackfillException('ERR_PAYMENT_CONTEXT_MISMATCH', event.id, {
        paymentId,
        expectedHeaderId: schedule.feePaymentHeaderId,
        expectedAdmissionId: schedule.admissionId,
        expectedSchoolId: schedule.schoolId,
      });
    }

    if (event.transferEdges.length !== 2) {
      throw new BackfillException('ERR_SPLIT_EDGE_COUNT', event.id, { count: event.transferEdges.length });
    }

    const [edgeA, edgeB] = event.transferEdges;

    const allocations = await tx.feePaymentInstallmentAllocation.findMany({
      where: {
        feePaymentId: payment.id,
        feePaymentHeaderId: schedule.feePaymentHeaderId,
        installmentId: { in: [edgeA.resultInstallmentId, edgeB.resultInstallmentId] },
      },
    });

    if (allocations.length !== 1) {
      throw new BackfillException('ERR_SETTLED_CHILD_AMBIGUITY', event.id, {
        matchingAllocationsCount: allocations.length,
        edgeAResult: edgeA.resultInstallmentId,
        edgeBResult: edgeB.resultInstallmentId,
      });
    }

    const allocation = allocations[0];
    const settledEdge = edgeA.resultInstallmentId === allocation.installmentId ? edgeA : edgeB;
    const remainingEdge = settledEdge === edgeA ? edgeB : edgeA;

    if (!allocation.allocatedAmount.equals(settledEdge.amount)) {
      throw new BackfillException('ERR_ALLOCATION_EDGE_AMOUNT_MISMATCH', event.id, {
        allocatedAmount: allocation.allocatedAmount.toString(),
        edgeAmount: settledEdge.amount.toString(),
      });
    }

    const sourceAmount = new Prisma.Decimal(sourceInstallment.amount.toString());
    const settledAmount = new Prisma.Decimal(settledEdge.amount.toString());
    const remainingAmount = new Prisma.Decimal(remainingEdge.amount.toString());

    if (!remainingAmount.equals(sourceAmount.minus(settledAmount))) {
      throw new BackfillException('ERR_SPLIT_CONSERVATION_MISMATCH', event.id, {
        sourceAmount: sourceAmount.toString(),
        settledAmount: settledAmount.toString(),
        remainingAmount: remainingAmount.toString(),
      });
    }

    return { settledEdge, remainingEdge, paymentId: payment.id };
  }

  /**
   * Validates active interval partition for a sequence.
   */
  validateSequenceIntervalIntegrity(
    sequence: number,
    rootAmount: Prisma.Decimal,
    installments: AdmissionInstallment[],
    allEdges: InstallmentLineageTransferEdge[],
  ): void {
    const activeLeaves: AdmissionInstallment[] = [];
    const supersededNodes: AdmissionInstallment[] = [];

    for (const inst of installments) {
      if (inst.offsetAmount === null || inst.offsetAmount === undefined) {
        throw new BackfillException('ERR_NULL_OFFSET_AMOUNT', inst.id, { sequence });
      }

      const hasOutEdges = allEdges.some((e) => e.sourceInstallmentId === inst.id);
      const isSupersededStatus = inst.status === InstallmentRowStatus.SUPERSEDED;
      const hasSupersededAt = inst.supersededAt !== null;

      if (isSupersededStatus !== hasSupersededAt) {
        throw new BackfillException('ERR_MUTUAL_STATUS_SUPERSEDED_INCONSISTENCY', inst.id, {
          status: inst.status,
          supersededAt: inst.supersededAt,
        });
      }

      if (hasOutEdges) {
        if (!isSupersededStatus) {
          throw new BackfillException('ERR_ACTIVE_ROW_WITH_OUTGOING_LINEAGE', inst.id, {});
        }
        supersededNodes.push(inst);
      } else {
        if (isSupersededStatus) {
          throw new BackfillException('ERR_SUPERSEDED_ROW_WITHOUT_OUTGOING_LINEAGE', inst.id, {});
        }
        activeLeaves.push(inst);
      }
    }

    if (activeLeaves.length + supersededNodes.length !== installments.length) {
      throw new BackfillException('ERR_CLASSIFICATION_COUNT_MISMATCH', sequence.toString(), {});
    }

    const leafIdSet = new Set(activeLeaves.map((l) => l.id));
    if (leafIdSet.size !== activeLeaves.length) {
      throw new BackfillException('ERR_DUPLICATE_ACTIVE_LEAF_INPUT', sequence.toString(), {});
    }

    activeLeaves.sort((a, b) => new Prisma.Decimal(a.offsetAmount).cmp(new Prisma.Decimal(b.offsetAmount)));

    let expectedOffset = new Prisma.Decimal(0);

    for (const leaf of activeLeaves) {
      const leafOffset = new Prisma.Decimal(leaf.offsetAmount.toString());
      const leafAmount = new Prisma.Decimal(leaf.amount.toString());

      if (leafAmount.lte(0)) {
        throw new BackfillException('ERR_NON_POSITIVE_LEAF_AMOUNT', leaf.id, { amount: leafAmount.toString() });
      }

      if (!leafOffset.equals(expectedOffset)) {
        if (leafOffset.lt(expectedOffset)) {
          throw new BackfillException('ERR_INTERVAL_OVERLAP', leaf.id, {
            expected: expectedOffset.toString(),
            actual: leafOffset.toString(),
          });
        } else {
          throw new BackfillException('ERR_INTERVAL_GAP', leaf.id, {
            expected: expectedOffset.toString(),
            actual: leafOffset.toString(),
          });
        }
      }

      expectedOffset = expectedOffset.plus(leafAmount);
    }

    if (!expectedOffset.equals(rootAmount)) {
      throw new BackfillException('ERR_TERMINAL_BOUNDARY_MISMATCH', sequence.toString(), {
        expected: rootAmount.toString(),
        actual: expectedOffset.toString(),
      });
    }
  }

  /**
   * Persists durable failure log using independent connection.
   */
  private async logDurableFailure(
    independentDb: DatabaseService,
    migrationRunId: string,
    error: any,
  ): Promise<void> {
    try {
      await independentDb.backfillExceptionLog.create({
        data: {
          schoolId: error.schoolId ?? 'BACKFILL_GLOBAL',
          admissionId: error.admissionId ?? 'BACKFILL_GLOBAL',
          feePaymentHeaderId: error.feePaymentHeaderId ?? 'BACKFILL_GLOBAL',
          errorCode: error.code ?? 'ERR_BACKFILL_FAILED',
          reason: error.message ?? String(error),
          payloadSnapshot: {
            migrationRunId,
            entityId: error.entityId,
            details: error.details,
            occurredAt: new Date().toISOString(),
            status: 'UNRESOLVED',
          },
        },
      });
    } catch (logErr: any) {
      this.logger.error('FATAL: Secondary BackfillExceptionLog creation failed:', logErr);
      this.logger.error('Original backfill error was:', error);
      throw new Error(`Backfill failed (${error.message}) AND durable logging failed (${logErr.message})`);
    }
  }
}
