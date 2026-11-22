import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppButton } from "@/pages/page-primitives";
import { useSyncFeeStructure, type SyncFeeStructureResponse } from "@/lib/fees-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

export interface FeeStructureSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeStructureId: string;
  feeStructureName: string;
}

interface SyncErrorState {
  title: string;
  description: string;
  isDateRequired?: boolean;
}

export function FeeStructureSyncDialog({
  open,
  onOpenChange,
  feeStructureId,
  feeStructureName,
}: FeeStructureSyncDialogProps) {
  const [dueDate, setDueDate] = useState<string>("");
  const [error, setError] = useState<SyncErrorState | null>(null);
  const [result, setResult] = useState<SyncFeeStructureResponse | null>(null);

  const syncMutation = useSyncFeeStructure();

  const handleClose = (newOpen: boolean) => {
    if (syncMutation.isPending) return;
    if (!newOpen) {
      setError(null);
      setResult(null);
      setDueDate("");
    }
    onOpenChange(newOpen);
  };

  const handleSync = async () => {
    setError(null);
    const trimmed = dueDate.trim();
    const payload = trimmed ? { supplementaryDueDate: trimmed } : undefined;

    try {
      const response = await syncMutation.mutateAsync({
        id: feeStructureId,
        payload,
      });
      setResult(response);
      toast({
        title: "Synchronization complete",
        description: `Successfully synchronized ${response.synchronizedAdmissionCount} admission(s).`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const body = err.body as any;
        const code = body?.code;

        if (code === "ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED") {
          setError({
            title: "Supplementary Due Date Required",
            description:
              "The academic year has ended. An explicit future supplementary due date (YYYY-MM-DD) is required for any installment adjustments.",
            isDateRequired: true,
          });
          return;
        }

        if (code === "NEGATIVE_DUE_PROHIBITED") {
          setError({
            title: "Negative Balance Prohibited",
            description:
              "Synchronization was aborted because applying latest master components would cause one or more admissions to have a negative balance. The entire transaction has rolled back.",
          });
          return;
        }

        if (code === "CONCURRENT_FINANCIAL_TRANSACTION") {
          setError({
            title: "Concurrent Financial Transaction",
            description:
              "A concurrent transaction or payment was detected on this fee structure. Please verify activity and try again.",
          });
          return;
        }

        if (err.status === 403) {
          setError({
            title: "Permission Denied",
            description:
              "You do not have permission to synchronize this fee structure, or it belongs to a different school tenant.",
          });
          return;
        }

        if (err.status === 404) {
          setError({
            title: "Fee Structure Not Found",
            description: "The requested fee structure could not be found or has been deleted.",
          });
          return;
        }

        setError({
          title: "Synchronization Failed",
          description:
            typeof body?.message === "string"
              ? body.message
              : "An unexpected error occurred during synchronization. The transaction was rolled back.",
        });
        return;
      }

      setError({
        title: "Synchronization Failed",
        description:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during synchronization. The transaction was rolled back.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(e) => {
          if (syncMutation.isPending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (syncMutation.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={18} className="text-primary" />
            Synchronize Admissions
          </DialogTitle>
          <DialogDescription>
            {feeStructureName ? `Fee Structure: ${feeStructureName}` : "Reconcile applicable admissions"}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div
              role="status"
              className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-emerald-900 dark:text-emerald-200 text-xs space-y-2"
            >
              <div className="flex items-center gap-1.5 font-semibold text-sm text-emerald-800 dark:text-emerald-100">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                Synchronization Executed Successfully
              </div>
              <p className="opacity-90 leading-relaxed">
                All applicable DRAFT and CONFIRMED admissions consuming this Fee Structure have been updated to
                match the latest master fee components in-place. All changes were applied atomically; historical
                payment records, allocations, reversals, and receipts remain completely intact.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users size={14} />
                Admission Reconciliation Metrics
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Admissions Examined</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.eligibleAdmissionCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Admissions Updated</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.synchronizedAdmissionCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">With Schedule</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.admissionsWithScheduleCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Without Schedule</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.admissionsWithoutScheduleCount}
                  </strong>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers size={14} />
                Component & Installment Adjustments
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Details Inserted</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.detailsInsertedCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Details Updated</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.detailsUpdatedCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Pending Increased</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.caseAIncreasesCount}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Supplementary Roots</span>
                  <strong className="text-base font-semibold text-foreground">
                    {result.supplementaryRootsCreatedCount}
                  </strong>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
                <Clock size={12} />
                Synchronized at: {new Date(result.synchronizedAt).toLocaleString()}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <AppButton type="button" onClick={() => handleClose(false)} className="w-full">
                Done & Close
              </AppButton>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-xs text-blue-950 dark:text-blue-200 space-y-2 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-100">
                <ShieldCheck size={16} className="text-blue-600 dark:text-blue-400" />
                Atomic Financial Reconciliation
              </div>
              <p>
                This operation synchronizes all <strong>DRAFT</strong> and <strong>CONFIRMED</strong> admissions
                assigned to this Fee Structure against the latest master components:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground dark:text-blue-300">
                <li>Existing fee component details are updated in-place for active price increases.</li>
                <li>Newly added active master components are inserted as billing line items.</li>
                <li>Installment schedules are adjusted in DAG order or given supplementary root rows.</li>
                <li>
                  <strong>Historical immutability:</strong> Recorded payments, attributions, allocations, and
                  receipts remain completely untouched.
                </li>
              </ul>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle size={15} />
                  {error.title}
                </div>
                <p className="leading-relaxed">{error.description}</p>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="supplementary-due-date"
                className="text-xs font-semibold text-foreground flex items-center gap-1.5"
              >
                <Calendar size={14} className="text-muted-foreground" />
                Supplementary Due Date (Optional)
              </label>
              <input
                id="supplementary-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={syncMutation.isPending}
                className={`w-full rounded-md border ${
                  error?.isDateRequired ? "border-destructive ring-1 ring-destructive" : "border-border"
                } bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary`}
                aria-describedby="due-date-hint"
              />
              <p id="due-date-hint" className="text-[11px] text-muted-foreground leading-normal">
                Used if supplementary installment rows must be created for fully paid admissions. If omitted,
                the backend defaults to the Academic Year end date.
              </p>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-3">
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={syncMutation.isPending}
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <RefreshCw
                  size={14}
                  className={`mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`}
                />
                {syncMutation.isPending ? "Synchronizing Admissions…" : "Confirm & Synchronize"}
              </AppButton>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
