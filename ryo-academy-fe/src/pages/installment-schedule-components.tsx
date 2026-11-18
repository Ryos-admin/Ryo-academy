import React, { useState, useEffect } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  AlertTriangle,
  Plus,
  Trash2,
  Settings2,
  Lock,
  Layers,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AppButton, Status, money } from "@/pages/page-primitives";
import {
  useInstallmentSchedule,
  useInstallmentScheduleLineage,
  usePreviewInstallmentSchedule,
  useCreateTemplateSchedule,
  useCreateManualSchedule,
  useUpdateDraftSchedule,
  installmentScheduleErrorMessage,
  type AdmissionInstallmentResponse,
  type AdmissionInstallmentScheduleResponse,
  type SchedulePreviewResponse,
  type ManualInstallmentItem,
  type InstallmentRowStatus,
} from "@/lib/installment-schedules-api";
import { useInstallmentTemplates } from "@/lib/installment-templates-api";
import { type User, hasPermission } from "@/lib/mock-erp";

export function formatCalendarDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return String(dateString);
}

export function InstallmentStatusBadge({ status }: { status: InstallmentRowStatus }) {
  switch (status) {
    case "PAID":
    case "PAID_EARLY":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <Check size={11} /> {status === "PAID_EARLY" ? "Paid Early" : "Paid"}
        </span>
      );
    case "PARTIALLY_PAID":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Clock3 size={11} /> Partially Paid
        </span>
      );
    case "PAID_LATE":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
          Paid Late
        </span>
      );
    case "OVERDUE":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          Overdue
        </span>
      );
    case "SUPERSEDED":
    case "VOID":
      return (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground line-through">
          {status}
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Pending
        </span>
      );
  }
}

export function InstallmentScheduleCard({
  admissionId,
  admissionStatus,
  pricingVersion,
  netAmount,
  session,
}: {
  admissionId: string;
  admissionStatus: string;
  pricingVersion?: string;
  netAmount?: number | string | null;
  session: User;
}) {
  const canRead = hasPermission(session, "INSTALLMENT_SCHEDULE_READ");
  const canManage = hasPermission(session, "INSTALLMENT_SCHEDULE_MANAGE");

  const scheduleQuery = useInstallmentSchedule(admissionId);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  if (!canRead) return null;

  const data = scheduleQuery.data;
  const schedule = data?.schedule;
  const isFrozen = Boolean(data?.isFrozen);

  // Authoritative lifecycle rules
  const isV0 = pricingVersion === "V0_SNAPSHOTTED";
  const isCancelled = admissionStatus === "CANCELLED";
  const isDraft = admissionStatus === "DRAFT";
  const isConfirmed = admissionStatus === "CONFIRMED";
  const lifecyclePermits = !isCancelled && (isV0 ? isDraft || isConfirmed : isDraft);

  const canCreate = canManage && !isFrozen && !schedule && lifecyclePermits;
  const canUpdate = canManage && !isFrozen && Boolean(schedule) && lifecyclePermits;

  const templateName = schedule?.template?.name
    ? `Template: ${schedule.template.name}`
    : schedule?.scheduleType === "TEMPLATE"
      ? "Template Schedule"
      : schedule?.scheduleType === "CUSTOM"
        ? "Custom Manual Schedule"
        : "Schedule";

  return (
    <section className="panel mt-6">
      <div className="panel-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2>Installment Schedule</h2>
            {isFrozen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Lock size={11} /> Schedule Locked
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {schedule
              ? `${templateName} · ${schedule.installmentCount} terms`
              : isFrozen
                ? "Payment history exists; schedule configuration is locked."
                : isV0
                  ? "V0 installment schedule required before initial fee payment."
                  : "Legacy fee schedule configuration."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {schedule && <Status>{schedule.status}</Status>}
          {canCreate && (
            <div className="flex items-center gap-2">
              <AppButton
                type="button"
                variant="soft"
                onClick={() => setTemplateDialogOpen(true)}
              >
                <Layers size={14} /> From Template
              </AppButton>
              <AppButton
                type="button"
                variant="soft"
                onClick={() => setManualDialogOpen(true)}
              >
                <Plus size={14} /> Custom Schedule
              </AppButton>
            </div>
          )}
          {canUpdate && (
            <AppButton
              type="button"
              variant="soft"
              onClick={() => setUpdateDialogOpen(true)}
            >
              <Settings2 size={14} /> Modify Schedule
            </AppButton>
          )}
        </div>
      </div>

      {scheduleQuery.isLoading && (
        <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Loading installment schedule…
        </div>
      )}

      {scheduleQuery.isError && (
        <div className="p-4 bg-destructive/10 rounded-lg text-sm text-destructive font-medium">
          {installmentScheduleErrorMessage(scheduleQuery.error, "Could not load installment schedule.")}
        </div>
      )}

      {isFrozen && (
        <div className="p-3 bg-amber-500/10 border-l-4 border-amber-500 text-xs text-amber-900 dark:text-amber-200 mt-2 mb-4 rounded-r">
          <strong>Schedule Locked:</strong> Payment history recorded on this fee account prevents further schedule modifications.
        </div>
      )}

      {!scheduleQuery.isLoading && !scheduleQuery.isError && !schedule && (
        <div className="p-6 text-center border border-dashed border-border rounded-xl my-2">
          <CalendarDays size={28} className="mx-auto text-muted-foreground mb-2 opacity-50" />
          <h3 className="text-sm font-semibold text-foreground">No Installment Schedule Configured</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {isV0
              ? "A structured installment schedule must be configured prior to collecting the first payment."
              : "This admission does not currently have an installment schedule."}
          </p>
          {canCreate && (
            <div className="mt-4 flex justify-center gap-2">
              <AppButton type="button" onClick={() => setTemplateDialogOpen(true)}>
                <Layers size={14} /> Create From Template
              </AppButton>
              <AppButton type="button" variant="ghost" onClick={() => setManualDialogOpen(true)}>
                <Plus size={14} /> Create Custom Schedule
              </AppButton>
            </div>
          )}
        </div>
      )}

      {schedule && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-xs uppercase font-semibold text-muted-foreground">Scheduled Obligation</span>
              <div className="text-xl font-bold mt-1 text-foreground">
                ₹{String(schedule.totalAmount)}
              </div>
              <span className="text-xs text-muted-foreground">Sum of scheduled installments</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-xs uppercase font-semibold text-muted-foreground">Installments</span>
              <div className="text-xl font-bold mt-1 text-foreground">
                {schedule.installmentCount} terms
              </div>
              <span className="text-xs text-muted-foreground">{schedule.scheduleType} schedule</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-xs uppercase font-semibold text-muted-foreground">Net Fee Baseline</span>
              <div className="text-xl font-bold mt-1 text-primary">
                ₹{String(netAmount ?? schedule.totalAmount)}
              </div>
              <span className="text-xs text-muted-foreground">Header obligation target</span>
            </div>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>Installment Label</th>
                    <th>Due Date</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th>Settlement Date</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.installments.map((inst) => (
                    <tr key={inst.id}>
                      <td className="text-center font-mono text-xs text-muted-foreground">
                        {inst.sequence}
                      </td>
                      <td className="font-semibold text-foreground">{inst.label}</td>
                      <td>{formatCalendarDate(inst.dueDate)}</td>
                      <td className="text-right font-semibold text-foreground">
                        ₹{String(inst.amount)}
                      </td>
                      <td>
                        <InstallmentStatusBadge status={inst.status} />
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {inst.paidAt ? formatCalendarDate(inst.paidAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      <CreateTemplateScheduleDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        admissionId={admissionId}
        netAmount={netAmount}
        onSuccess={() => setTemplateDialogOpen(false)}
        onPaymentCollision={() => scheduleQuery.refetch()}
      />

      <CreateManualScheduleDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        admissionId={admissionId}
        netAmount={netAmount}
        onSuccess={() => setManualDialogOpen(false)}
        onPaymentCollision={() => scheduleQuery.refetch()}
      />

      {schedule && (
        <UpdateDraftScheduleDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          admissionId={admissionId}
          schedule={schedule}
          netAmount={netAmount}
          onSuccess={() => setUpdateDialogOpen(false)}
          onPaymentCollision={() => scheduleQuery.refetch()}
        />
      )}
    </section>
  );
}

export function CreateTemplateScheduleDialog({
  open,
  onOpenChange,
  admissionId,
  netAmount,
  onSuccess,
  onPaymentCollision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  netAmount?: number | string | null;
  onSuccess: () => void;
  onPaymentCollision?: () => Promise<unknown> | void;
}) {
  const templatesQuery = useInstallmentTemplates(false);
  const previewMutation = usePreviewInstallmentSchedule(admissionId);
  const createMutation = useCreateTemplateSchedule(admissionId);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [allowFinalAbsorption, setAllowFinalAbsorption] = useState(false);
  const [previewData, setPreviewData] = useState<SchedulePreviewResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTemplateId(templates[0]?.id || "");
      setFirstDueDate("");
      setAllowFinalAbsorption(false);
      setPreviewData(null);
      setErrorMessage("");
    }
  }, [open, templatesQuery.data]);

  // Invalidate preview on any input change
  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    setPreviewData(null);
    setErrorMessage("");
  };

  const handleDateChange = (date: string) => {
    setFirstDueDate(date);
    setPreviewData(null);
    setErrorMessage("");
  };

  const handleAbsorptionChange = (val: boolean) => {
    setAllowFinalAbsorption(val);
    setPreviewData(null);
    setErrorMessage("");
  };

  const handlePreview = async () => {
    if (!selectedTemplateId || !firstDueDate) {
      setErrorMessage("Please select a template and a valid first due date.");
      return;
    }
    setErrorMessage("");
    try {
      const res = await previewMutation.mutateAsync({
        templateId: selectedTemplateId,
        firstDueDate,
        allowFinalAbsorption,
      });
      setPreviewData(res);
    } catch (err) {
      setPreviewData(null);
      setErrorMessage(installmentScheduleErrorMessage(err, "Failed to calculate schedule preview."));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !firstDueDate) {
      setErrorMessage("Please select a template and enter a first due date.");
      return;
    }
    setErrorMessage("");
    try {
      await createMutation.mutateAsync({
        templateId: selectedTemplateId,
        firstDueDate,
        allowFinalAbsorption,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(installmentScheduleErrorMessage(err, "Failed to create installment schedule."));
      if (err?.code === "SCHEDULE_FROZEN_PAYMENT_EXISTS" || err?.body?.code === "SCHEDULE_FROZEN_PAYMENT_EXISTS") {
        await onPaymentCollision?.();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Installment Schedule from Template</DialogTitle>
          <DialogDescription>
            Select a reusable institutional schedule template to allocate the net obligation (₹
            {String(netAmount ?? "0.00")}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="template-select" className="text-xs font-semibold text-muted-foreground block mb-1">
              Select Schedule Template
            </label>
            <select
              id="template-select"
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            >
              {templates.length === 0 && <option value="">No active templates found</option>}
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.installmentCount} installments · {tpl.calculationType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="template-first-due-date" className="text-xs font-semibold text-muted-foreground block mb-1">
              First Installment Due Date (YYYY-MM-DD)
            </label>
            <input
              id="template-first-due-date"
              type="date"
              value={firstDueDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allowFinalAbsorption}
              onChange={(e) => handleAbsorptionChange(e.target.checked)}
              className="rounded border-border"
            />
            Allow final installment to absorb rounding difference (for fixed amount templates)
          </label>

          <div className="flex justify-end">
            <AppButton
              type="button"
              variant="ghost"
              onClick={handlePreview}
              disabled={previewMutation.isPending || !selectedTemplateId || !firstDueDate}
            >
              {previewMutation.isPending ? "Calculating…" : "Preview Schedule"}
            </AppButton>
          </div>

          {previewData && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span>Calculated Terms: {previewData.installmentCount}</span>
                <span className="text-primary">Total: ₹{String(previewData.netAmount)}</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {previewData.installments.map((inst, idx) => (
                  <div key={idx} className="flex justify-between text-xs py-1 border-b border-border/40 last:border-0">
                    <span>
                      {inst.sequence}. {inst.label} ({formatCalendarDate(inst.dueDate)})
                    </span>
                    <strong className="font-mono">₹{String(inst.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-red-600 font-medium" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter className="pt-2">
            <AppButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </AppButton>
            <AppButton type="submit" disabled={createMutation.isPending || !selectedTemplateId || !firstDueDate}>
              {createMutation.isPending ? "Creating…" : "Confirm & Create Schedule"}
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateManualScheduleDialog({
  open,
  onOpenChange,
  admissionId,
  netAmount,
  onSuccess,
  onPaymentCollision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  netAmount?: number | string | null;
  onSuccess: () => void;
  onPaymentCollision?: () => Promise<unknown> | void;
}) {
  const previewMutation = usePreviewInstallmentSchedule(admissionId);
  const createMutation = useCreateManualSchedule(admissionId);

  const [justification, setJustification] = useState("");
  const [installments, setInstallments] = useState<ManualInstallmentItem[]>([
    { sequence: 1, label: "Installment 1", amount: "", dueDate: "" },
  ]);
  const [previewData, setPreviewData] = useState<SchedulePreviewResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (open) {
      setJustification("");
      setInstallments([{ sequence: 1, label: "Installment 1", amount: "", dueDate: "" }]);
      setPreviewData(null);
      setErrorMessage("");
    }
  }, [open]);

  // Informational client-side sum
  const clientSum = installments.reduce((acc, row) => {
    const val = parseFloat(row.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const invalidatePreview = () => {
    setPreviewData(null);
    setErrorMessage("");
  };

  const handleAddRow = () => {
    invalidatePreview();
    setInstallments((prev) => [
      ...prev,
      {
        sequence: prev.length + 1,
        label: `Installment ${prev.length + 1}`,
        amount: "",
        dueDate: "",
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (installments.length <= 1) return;
    invalidatePreview();
    const updated = installments
      .filter((_, i) => i !== index)
      .map((row, i) => ({ ...row, sequence: i + 1 }));
    setInstallments(updated);
  };

  const handleRowChange = (index: number, field: keyof ManualInstallmentItem, val: string) => {
    invalidatePreview();
    setInstallments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)),
    );
  };

  const handlePreview = async () => {
    if (!justification.trim()) {
      setErrorMessage("Justification is mandatory for custom schedules.");
      return;
    }
    setErrorMessage("");
    try {
      const res = await previewMutation.mutateAsync({
        manualSchedule: {
          justification,
          installments,
        },
      });
      setPreviewData(res);
    } catch (err) {
      setPreviewData(null);
      setErrorMessage(installmentScheduleErrorMessage(err, "Schedule preview failed."));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim()) {
      setErrorMessage("Justification is mandatory for custom manual installment schedules.");
      return;
    }
    setErrorMessage("");
    try {
      await createMutation.mutateAsync({
        justification,
        installments,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(installmentScheduleErrorMessage(err, "Failed to create custom schedule."));
      if (err?.code === "SCHEDULE_FROZEN_PAYMENT_EXISTS" || err?.body?.code === "SCHEDULE_FROZEN_PAYMENT_EXISTS") {
        await onPaymentCollision?.();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Custom Manual Schedule</DialogTitle>
          <DialogDescription>
            Specify custom installment terms and due dates. Sum must match net obligation (₹
            {String(netAmount ?? "0.00")}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="manual-justification" className="text-xs font-semibold text-muted-foreground block mb-1">
              Administrative Justification (Mandatory)
            </label>
            <textarea
              id="manual-justification"
              value={justification}
              onChange={(e) => {
                setJustification(e.target.value);
                invalidatePreview();
              }}
              placeholder="Reason for departing from standard templates (e.g., Parent financial dispensation approved by Dean)"
              className="w-full rounded-lg border border-border bg-background p-2 text-sm h-18"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted-foreground">Installment Breakdown</span>
              <span className="text-xs text-muted-foreground">
                Sum: <strong className="text-foreground">₹{clientSum.toFixed(2)}</strong> / Obligation: ₹
                {String(netAmount ?? "0.00")}
              </span>
            </div>

            {installments.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                  {row.sequence}
                </span>
                <input
                  type="text"
                  placeholder="Label"
                  value={row.label}
                  onChange={(e) => handleRowChange(idx, "label", e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Amount"
                  value={row.amount}
                  onChange={(e) => handleRowChange(idx, "amount", e.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-right"
                  required
                />
                <input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => handleRowChange(idx, "dueDate", e.target.value)}
                  className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  required
                />
                {installments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Remove row"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}

            <AppButton type="button" variant="ghost" onClick={handleAddRow} className="text-xs">
              <Plus size={12} /> Add Installment Term
            </AppButton>
          </div>

          <div className="flex justify-end">
            <AppButton
              type="button"
              variant="ghost"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? "Calculating…" : "Preview Schedule"}
            </AppButton>
          </div>

          {previewData && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-primary">
                <span>Server Validated: {previewData.installmentCount} installments</span>
                <span>Total: ₹{String(previewData.netAmount)}</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-red-600 font-medium" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter className="pt-2">
            <AppButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </AppButton>
            <AppButton type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save Custom Schedule"}
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UpdateDraftScheduleDialog({
  open,
  onOpenChange,
  admissionId,
  schedule,
  netAmount,
  onSuccess,
  onPaymentCollision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  schedule: AdmissionInstallmentScheduleResponse;
  netAmount?: number | string | null;
  onSuccess: () => void;
  onPaymentCollision?: () => Promise<unknown> | void;
}) {
  const updateMutation = useUpdateDraftSchedule(admissionId);
  const scheduleQuery = useInstallmentSchedule(admissionId);
  const [reason, setReason] = useState("");
  const [installments, setInstallments] = useState<ManualInstallmentItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (open && schedule?.installments) {
      setReason("");
      setErrorMessage("");
      setInstallments(
        schedule.installments.map((inst) => {
          const match = String(inst.dueDate).match(/^(\d{4}-\d{2}-\d{2})/);
          return {
            sequence: inst.sequence,
            label: inst.label,
            amount: String(inst.amount),
            dueDate: match ? match[1] : inst.dueDate,
          };
        }),
      );
    }
  }, [open, schedule]);

  const clientSum = installments.reduce((acc, row) => {
    const val = parseFloat(row.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const handleAddRow = () => {
    setInstallments((prev) => [
      ...prev,
      {
        sequence: prev.length + 1,
        label: `Installment ${prev.length + 1}`,
        amount: "",
        dueDate: "",
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (installments.length <= 1) return;
    const updated = installments
      .filter((_, i) => i !== index)
      .map((row, i) => ({ ...row, sequence: i + 1 }));
    setInstallments(updated);
  };

  const handleRowChange = (index: number, field: keyof ManualInstallmentItem, val: string) => {
    setInstallments((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      await updateMutation.mutateAsync({
        installments,
        reason: reason || undefined,
      });
      onSuccess();
    } catch (err: any) {
      const msg = installmentScheduleErrorMessage(err, "Failed to update draft schedule.");
      setErrorMessage(msg);
      // If payment conflict occurred, refresh schedule query to pull frozen state
      await onPaymentCollision?.();
      await scheduleQuery.refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modify Draft Installment Schedule</DialogTitle>
          <DialogDescription>
            Adjust installment terms before payment collection commences. Sum must match net obligation (₹
            {String(netAmount ?? schedule.totalAmount)}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Update Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Parent requested adjusted term dates"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted-foreground">Adjust Terms</span>
              <span className="text-xs text-muted-foreground">
                Sum: <strong className="text-foreground">₹{clientSum.toFixed(2)}</strong> / Obligation: ₹
                {String(netAmount ?? schedule.totalAmount)}
              </span>
            </div>

            {installments.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                  {row.sequence}
                </span>
                <input
                  type="text"
                  placeholder="Label"
                  value={row.label}
                  onChange={(e) => handleRowChange(idx, "label", e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Amount"
                  value={row.amount}
                  onChange={(e) => handleRowChange(idx, "amount", e.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-right"
                  required
                />
                <input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => handleRowChange(idx, "dueDate", e.target.value)}
                  className="w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  required
                />
                {installments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Remove row"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}

            <AppButton type="button" variant="ghost" onClick={handleAddRow} className="text-xs">
              <Plus size={12} /> Add Installment Term
            </AppButton>
          </div>

          {errorMessage && (
            <p className="text-xs text-red-600 font-medium" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter className="pt-2">
            <AppButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </AppButton>
            <AppButton type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating…" : "Save Changes"}
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StudentInstallmentScheduleCard({
  admissionId,
  session,
}: {
  admissionId?: string | null;
  session?: User | null;
}) {
  const canRead = hasPermission(session, "INSTALLMENT_SCHEDULE_READ");
  const scheduleQuery = useInstallmentSchedule(admissionId || undefined);

  if (!canRead || !admissionId) return null;

  const schedule = scheduleQuery.data?.schedule;

  if (scheduleQuery.isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
        <RefreshCw size={12} className="animate-spin" /> Loading schedule breakdown…
      </div>
    );
  }

  if (scheduleQuery.isError || !schedule) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase">
          Installment Schedule ({schedule.installmentCount} Terms)
        </div>
        <Status>{schedule.status}</Status>
      </div>

      <div className="space-y-2">
        {schedule.installments.map((inst) => (
          <div key={inst.id} className="payment-line py-1.5">
            <div>
              <strong className="text-xs block">{inst.label}</strong>
              <small className="text-muted-foreground">Due {formatCalendarDate(inst.dueDate)}</small>
            </div>
            <div className="text-right">
              <strong className="text-xs block">₹{String(inst.amount)}</strong>
              <InstallmentStatusBadge status={inst.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
