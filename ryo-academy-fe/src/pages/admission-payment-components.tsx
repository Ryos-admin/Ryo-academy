import React, { useState, useMemo, useEffect } from "react";
import {
  Coins,
  Receipt,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AppButton, money } from "@/pages/page-primitives";
import {
  useAdmissionPayments,
  useRecordAdmissionPayment,
  useReverseAdmissionPayment,
  admissionPaymentErrorMessage,
  admissionPaymentReversalErrorMessage,
  parseMoneyMinor,
  formatMinorToMoney,
  type AdmissionPaymentResponse,
  type AdmissionPaymentReversalResponse,
  type AdmissionPaymentHistoryItem,
  type CreateAdmissionPaymentRequest,
  type ReverseAdmissionPaymentRequest,
} from "@/lib/admission-payments-api";
import { formatCalendarDate } from "@/pages/installment-schedule-components";
import { type User, hasPermission } from "@/lib/mock-erp";
import type { FeeConfigurationDetail } from "@/lib/concessions-api";

export type IntentStatus =
  | "IDLE"
  | "SUBMITTING"
  | "AMBIGUOUS_ERROR"
  | "COMPLETED"
  | "CONFLICT";

export interface PaymentIntent {
  key: string;
  payload: CreateAdmissionPaymentRequest | null;
  status: IntentStatus;
  error: string | null;
  result: AdmissionPaymentResponse | null;
}

export interface CollectAdmissionPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  admissionNumber?: string;
  applicantName?: string;
  feePaymentHeader: {
    id: string;
    pricingVersion?: string;
    totalFeeAmount: string | null;
    totalPaidAmount: string | null;
    totalDueAmount: string | null;
    netAmount?: string | null;
    feePaymentDetails: FeeConfigurationDetail[];
  };
  studentId?: string;
  session?: User | null;
  onSuccess?: (result: AdmissionPaymentResponse) => void;
}

export function CollectAdmissionPaymentDialog({
  open,
  onOpenChange,
  admissionId,
  admissionNumber,
  applicantName,
  feePaymentHeader,
  studentId,
  session,
  onSuccess,
}: CollectAdmissionPaymentDialogProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Idempotency state machine
  const [intent, setIntent] = useState<PaymentIntent>(() => ({
    key: crypto.randomUUID(),
    payload: null,
    status: "IDLE",
    error: null,
    result: null,
  }));

  const recordPaymentMutation = useRecordAdmissionPayment(admissionId, {
    studentId,
  });

  // Filter only active and included components
  const eligibleComponents = useMemo(() => {
    return (feePaymentHeader.feePaymentDetails || []).filter(
      (c) => c.isActive && c.isIncluded,
    );
  }, [feePaymentHeader.feePaymentDetails]);

  // Compute exact balances per component using integer arithmetic
  const componentBalances = useMemo(() => {
    const map = new Map<
      string,
      { totalMinor: bigint; paidMinor: bigint; remainingMinor: bigint }
    >();
    for (const c of eligibleComponents) {
      const totalMinor = parseMoneyMinor(c.totalAmountToBePaid ?? "0") ?? 0n;
      const paidMinor = parseMoneyMinor(c.amountPaid ?? "0") ?? 0n;
      const remainingMinor =
        totalMinor > paidMinor ? totalMinor - paidMinor : 0n;
      map.set(c.id, { totalMinor, paidMinor, remainingMinor });
    }
    return map;
  }, [eligibleComponents]);

  // Component-level allocation validation
  const allocationValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    let sumMinor = 0n;
    let nonZeroCount = 0;

    for (const c of eligibleComponents) {
      const raw = (allocations[c.id] || "").trim();
      const balances = componentBalances.get(c.id);
      const remainingMinor = balances?.remainingMinor ?? 0n;

      if (!raw) continue;

      const allocMinor = parseMoneyMinor(raw);
      if (allocMinor === null) {
        errors[c.id] = "Invalid amount (max 2 decimals)";
        continue;
      }
      if (allocMinor < 0n) {
        errors[c.id] = "Amount cannot be negative";
        continue;
      }
      if (allocMinor === 0n) {
        errors[c.id] = "Amount must be greater than zero";
        continue;
      }
      if (allocMinor > remainingMinor) {
        errors[c.id] = `Exceeds balance (₹${formatMinorToMoney(remainingMinor)})`;
        continue;
      }

      sumMinor += allocMinor;
      nonZeroCount += 1;
    }

    return {
      errors,
      totalPaymentMinor: sumMinor,
      nonZeroCount,
      isValid: Object.keys(errors).length === 0,
    };
  }, [allocations, eligibleComponents, componentBalances]);

  // Handle single component allocation edit
  const handleAllocationChange = (componentId: string, val: string) => {
    if (intent.status === "AMBIGUOUS_ERROR") {
      setFormError(
        "Cannot modify payment details while a prior submission is unresolved. Resolve by retrying the prior submission first.",
      );
      return;
    }
    setFormError(null);
    setAllocations((prev) => ({
      ...prev,
      [componentId]: val,
    }));
  };

  // "Pay Full Remaining" action for one component
  const handlePayFullComponent = (componentId: string) => {
    if (intent.status === "AMBIGUOUS_ERROR") return;
    const balances = componentBalances.get(componentId);
    if (!balances || balances.remainingMinor <= 0n) return;
    setAllocations((prev) => ({
      ...prev,
      [componentId]: formatMinorToMoney(balances.remainingMinor),
    }));
    setFormError(null);
  };

  // "Allocate All Due" helper
  const handleAllocateAllDue = () => {
    if (intent.status === "AMBIGUOUS_ERROR") return;
    const next: Record<string, string> = {};
    for (const c of eligibleComponents) {
      const balances = componentBalances.get(c.id);
      if (balances && balances.remainingMinor > 0n) {
        next[c.id] = formatMinorToMoney(balances.remainingMinor);
      }
    }
    setAllocations(next);
    setFormError(null);
  };

  // "Clear Allocations" helper
  const handleClearAllocations = () => {
    if (intent.status === "AMBIGUOUS_ERROR") return;
    setAllocations({});
    setFormError(null);
  };

  // Reset dialog state
  const handleClose = () => {
    if (intent.status === "SUBMITTING") return;
    onOpenChange(false);
    if (intent.status === "COMPLETED") {
      setIntent({
        key: crypto.randomUUID(),
        payload: null,
        status: "IDLE",
        error: null,
        result: null,
      });
      setAllocations({});
      setFormError(null);
    }
  };

  // Submission handler
  const handleSubmitPayment = async (retryPrior = false) => {
    setFormError(null);

    let payloadToSubmit: CreateAdmissionPaymentRequest;

    if (retryPrior && intent.payload) {
      payloadToSubmit = intent.payload;
    } else {
      if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
        setFormError("A valid payment date (YYYY-MM-DD) is required.");
        return;
      }
      if (!allocationValidation.isValid) {
        setFormError("Please fix component allocation errors before submitting.");
        return;
      }
      if (allocationValidation.nonZeroCount === 0 || allocationValidation.totalPaymentMinor <= 0n) {
        setFormError("At least one component allocation must be greater than zero.");
        return;
      }

      const activeAllocations: Array<{
        feePaymentDetailsId: string;
        amount: string;
      }> = [];

      for (const c of eligibleComponents) {
        const raw = (allocations[c.id] || "").trim();
        if (!raw) continue;
        const minor = parseMoneyMinor(raw);
        if (minor && minor > 0n) {
          activeAllocations.push({
            feePaymentDetailsId: c.id,
            amount: formatMinorToMoney(minor),
          });
        }
      }

      payloadToSubmit = {
        idempotencyKey: intent.key,
        feePaymentHeaderId: feePaymentHeader.id,
        amount: formatMinorToMoney(allocationValidation.totalPaymentMinor),
        paymentMethod: "CASH",
        paymentDate: `${paymentDate}T00:00:00.000Z`,
        allocations: activeAllocations,
      };
    }

    setIntent((prev) => ({
      ...prev,
      payload: payloadToSubmit,
      status: "SUBMITTING",
      error: null,
    }));

    try {
      const response = await recordPaymentMutation.mutateAsync(payloadToSubmit);
      setIntent((prev) => ({
        ...prev,
        status: "COMPLETED",
        result: response,
        error: null,
      }));
      onSuccess?.(response);
    } catch (err: any) {
      const msg = admissionPaymentErrorMessage(
        err,
        "Failed to record fee payment.",
      );

      const status = err?.status;
      const code = err?.body?.code;

      if (code === "SCHEDULE_REQUIRED") {
        setIntent((prev) => ({
          ...prev,
          status: "IDLE",
          error: msg,
        }));
      } else if (
        status === 409 &&
        typeof err?.body?.message === "string" &&
        err.body.message.includes("idempotency key was already used")
      ) {
        setIntent((prev) => ({
          ...prev,
          status: "CONFLICT",
          error: msg,
        }));
      } else if (status === 400 || status === 403 || status === 401 || status === 404) {
        setIntent((prev) => ({
          ...prev,
          status: "IDLE",
          error: msg,
        }));
      } else {
        // Ambiguous network failure or uncommitted collision (5xx, timeout, network error)
        setIntent((prev) => ({
          ...prev,
          status: "AMBIGUOUS_ERROR",
          error: msg,
        }));
      }
    }
  };

  const isSubmitting = intent.status === "SUBMITTING";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Coins className="text-primary" size={20} />
            <DialogTitle>Collect Fee Payment (V0)</DialogTitle>
          </div>
          <DialogDescription>
            Record a cash payment with component-level allocations. Installment
            attribution is derived automatically by the backend.
            {admissionNumber && ` · Admission: ${admissionNumber}`}
            {applicantName && ` · ${applicantName}`}
          </DialogDescription>
        </DialogHeader>

        {intent.status === "COMPLETED" && intent.result ? (
          <div className="space-y-4 py-3">
            <div
              className={`rounded-xl p-4 border ${
                intent.result.isReplay
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                  : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-base mb-1">
                <CheckCircle2 size={18} />
                {intent.result.isReplay
                  ? "Payment Already Recorded (Idempotent Replay)"
                  : "Payment Recorded Successfully"}
              </div>
              <p className="text-xs opacity-90">
                {intent.result.isReplay
                  ? "This payment intent was previously processed. Displaying confirmed receipt and updated balances."
                  : `Successfully collected ₹${intent.result.amount} via CASH payment.`}
              </p>
              <div className="mt-3 text-xs grid grid-cols-2 gap-2 border-t border-current/10 pt-2">
                <div>
                  <span className="opacity-75">Payment ID:</span>{" "}
                  <strong className="font-mono">{intent.result.id}</strong>
                </div>
                <div>
                  <span className="opacity-75">Payment Date:</span>{" "}
                  <strong>{formatCalendarDate(intent.result.paymentDate)}</strong>
                </div>
              </div>
            </div>

            {/* Derived Installment Attributions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                Backend-Derived Installment Settlement (FIFO)
              </h3>
              {intent.result.installmentAllocations &&
              intent.result.installmentAllocations.length > 0 ? (
                <div className="divide-y divide-border text-xs">
                  {intent.result.installmentAllocations.map((ia) => (
                    <div
                      key={ia.id}
                      className="py-2 flex justify-between items-center"
                    >
                      <span>
                        Installment: <code className="font-mono">{ia.installmentId.slice(0, 8)}…</code>
                      </span>
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        ₹{ia.allocatedAmount}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Component-only payment. No active installment schedule rows were affected.
                </p>
              )}
            </div>

            {/* Component Allocation Breakdown */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                Component Allocations Settled
              </h3>
              <div className="divide-y divide-border text-xs">
                {intent.result.allocations.map((a) => (
                  <div key={a.id} className="py-2 flex justify-between items-center">
                    <span>
                      Component: <code className="font-mono">{a.feePaymentDetailsId.slice(0, 8)}…</code>
                    </span>
                    <strong>₹{a.amount}</strong>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <AppButton onClick={handleClose} className="w-full">
                Done & Close
              </AppButton>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Payment Parameters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-3 rounded-xl border border-border">
              <div>
                <label
                  htmlFor="v0-payment-date"
                  className="text-xs font-semibold text-muted-foreground block mb-1"
                >
                  Payment Date (Mandatory)
                </label>
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-muted-foreground" />
                  <input
                    id="v0-payment-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => {
                      if (intent.status !== "AMBIGUOUS_ERROR") {
                        setPaymentDate(e.target.value);
                      }
                    }}
                    disabled={isSubmitting || intent.status === "AMBIGUOUS_ERROR"}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Payment Method
                </label>
                <div className="flex items-center h-[34px]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs font-semibold">
                    <Coins size={13} /> CASH (Fixed)
                  </span>
                </div>
              </div>
            </div>

            {/* Ambiguous Error Callout */}
            {intent.status === "AMBIGUOUS_ERROR" && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 text-amber-900 dark:text-amber-200 text-xs space-y-2"
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={16} className="text-amber-600" />
                  Prior Submission Unresolved
                </div>
                <p>
                  A previous submission with intent key{" "}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                    {intent.key.slice(0, 8)}…
                  </code>{" "}
                  encountered a network issue or uncommitted state. The outcome is unconfirmed.
                </p>
                <p>
                  Click <strong>"Retry Prior Submission"</strong> to safely verify whether the backend accepted or rejected the payment.
                </p>
                {intent.error && (
                  <p className="font-semibold text-red-600 dark:text-red-400">
                    Error details: {intent.error}
                  </p>
                )}
              </div>
            )}

            {/* General or Conflict Error Callout */}
            {intent.error && intent.status !== "AMBIGUOUS_ERROR" && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-red-700 dark:text-red-300 text-xs flex items-start gap-2"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Unable to record payment</div>
                  <div>{intent.error}</div>
                </div>
              </div>
            )}

            {/* Validation Error Message */}
            {formError && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {formError}
              </p>
            )}

            {/* Quick Actions Helper */}
            <div className="flex justify-between items-center text-xs pt-1">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Fee Component Allocations
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAllocateAllDue}
                  disabled={isSubmitting || intent.status === "AMBIGUOUS_ERROR"}
                  className="text-primary hover:underline text-xs"
                >
                  Allocate All Due
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={handleClearAllocations}
                  disabled={isSubmitting || intent.status === "AMBIGUOUS_ERROR"}
                  className="text-muted-foreground hover:underline text-xs"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Fee Components Allocation Grid */}
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
              {eligibleComponents.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No active and included fee components found for this admission.
                </div>
              ) : (
                eligibleComponents.map((comp) => {
                  const balances = componentBalances.get(comp.id);
                  const remainingMinor = balances?.remainingMinor ?? 0n;
                  const isFullyPaid = remainingMinor <= 0n;
                  const fieldError = allocationValidation.errors[comp.id];

                  return (
                    <div
                      key={comp.id}
                      className={`p-3 text-xs transition-colors ${
                        isFullyPaid
                          ? "bg-muted/30 opacity-70"
                          : "hover:bg-muted/10"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">
                            {comp.name || "Fee Component"}
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5 flex gap-3">
                            <span>
                              Payable: ₹{comp.totalAmountToBePaid ?? "0.00"}
                            </span>
                            <span>
                              Paid: ₹{comp.amountPaid ?? "0.00"}
                            </span>
                            <span className={remainingMinor > 0n ? "text-amber-600 font-medium" : "text-emerald-600"}>
                              Due: ₹{formatMinorToMoney(remainingMinor)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-36">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={isFullyPaid ? "Paid" : "0.00"}
                              value={allocations[comp.id] || ""}
                              onChange={(e) =>
                                handleAllocationChange(comp.id, e.target.value)
                              }
                              disabled={
                                isFullyPaid ||
                                isSubmitting ||
                                intent.status === "AMBIGUOUS_ERROR"
                              }
                              aria-label={`Allocation for ${comp.name}`}
                              className={`w-full rounded-md border px-2.5 py-1 text-right text-xs ${
                                fieldError
                                  ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                  : "border-border bg-background"
                              }`}
                            />
                            {fieldError && (
                              <p className="text-[10px] text-red-600 text-right mt-0.5">
                                {fieldError}
                              </p>
                            )}
                          </div>

                          {!isFullyPaid && (
                            <button
                              type="button"
                              onClick={() => handlePayFullComponent(comp.id)}
                              disabled={
                                isSubmitting ||
                                intent.status === "AMBIGUOUS_ERROR"
                              }
                              className="px-2 py-1 bg-muted hover:bg-muted/80 rounded border border-border text-[11px] whitespace-nowrap"
                            >
                              Full Due
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Total Allocation Reconciliation Bar */}
            <div className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground block">
                  Total Payment Amount (INR)
                </span>
                <span className="text-xs text-muted-foreground">
                  Exact sum of {allocationValidation.nonZeroCount} component{" "}
                  {allocationValidation.nonZeroCount === 1 ? "allocation" : "allocations"}
                </span>
              </div>
              <div className="text-2xl font-bold text-primary font-mono">
                ₹{formatMinorToMoney(allocationValidation.totalPaymentMinor)}
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <AppButton
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </AppButton>

              {intent.status === "AMBIGUOUS_ERROR" ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={() => handleSubmitPayment(true)}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  {isSubmitting ? "Retrying Prior Submission…" : "Retry Prior Submission"}
                </AppButton>
              ) : (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={() => handleSubmitPayment(false)}
                  disabled={
                    isSubmitting ||
                    !allocationValidation.isValid ||
                    allocationValidation.totalPaymentMinor <= 0n
                  }
                >
                  {isSubmitting ? "Recording Payment…" : "Record Payment"}
                </AppButton>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface ReverseAdmissionPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  payment: AdmissionPaymentHistoryItem | null;
  studentId?: string;
  session?: User | null;
  onSuccess?: (result: AdmissionPaymentReversalResponse) => void;
}

export interface ReversalIntent {
  key: string;
  reason: string;
  status: IntentStatus;
  error: string | null;
  result: AdmissionPaymentReversalResponse | null;
}

export function ReverseAdmissionPaymentDialog({
  open,
  onOpenChange,
  admissionId,
  payment,
  studentId,
  session,
  onSuccess,
}: ReverseAdmissionPaymentDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Idempotency state machine
  const [intent, setIntent] = useState<ReversalIntent>(() => ({
    key: crypto.randomUUID(),
    reason: "",
    status: "IDLE",
    error: null,
    result: null,
  }));

  // Reset or initialize intent when payment or dialog opens
  useEffect(() => {
    if (open && payment) {
      setIntent({
        key: crypto.randomUUID(),
        reason: "",
        status: "IDLE",
        error: null,
        result: null,
      });
      setReason("");
      setFormError(null);
    }
  }, [open, payment?.id]);

  const reverseMutation = useReverseAdmissionPayment(admissionId, {
    studentId,
  });

  const handleReasonChange = (val: string) => {
    if (intent.status === "AMBIGUOUS_ERROR") {
      setFormError(
        "Cannot modify reversal reason while a prior submission is unresolved. Resolve by retrying the prior submission first.",
      );
      return;
    }
    setFormError(null);
    setReason(val);
  };

  const handleClose = () => {
    if (intent.status === "SUBMITTING") return;
    onOpenChange(false);
    if (intent.status === "COMPLETED") {
      setIntent({
        key: crypto.randomUUID(),
        reason: "",
        status: "IDLE",
        error: null,
        result: null,
      });
      setReason("");
      setFormError(null);
    }
  };

  const handleSubmitReversal = async (retryPrior = false) => {
    if (!payment) return;
    setFormError(null);

    let keyToSubmit = intent.key;
    let reasonToSubmit = reason.trim();

    if (retryPrior && intent.status === "AMBIGUOUS_ERROR") {
      keyToSubmit = intent.key;
      reasonToSubmit = intent.reason;
    } else {
      if (!reasonToSubmit) {
        setFormError("Reversal reason is required.");
        return;
      }
      if (reasonToSubmit.length > 500) {
        setFormError("Reversal reason must not exceed 500 characters.");
        return;
      }
    }

    const payload: ReverseAdmissionPaymentRequest = {
      idempotencyKey: keyToSubmit,
      reason: reasonToSubmit,
    };

    setIntent((prev) => ({
      ...prev,
      key: keyToSubmit,
      reason: reasonToSubmit,
      status: "SUBMITTING",
      error: null,
    }));

    try {
      const response = await reverseMutation.mutateAsync({
        paymentId: payment.id,
        payload,
      });
      setIntent((prev) => ({
        ...prev,
        status: "COMPLETED",
        result: response,
        error: null,
      }));
      onSuccess?.(response);
    } catch (err: any) {
      const msg = admissionPaymentReversalErrorMessage(
        err,
        "Failed to reverse fee payment.",
      );

      const status = err?.status;
      const code = err?.body?.code;

      if (code === "PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE") {
        setIntent((prev) => ({
          ...prev,
          status: "CONFLICT",
          error: msg,
        }));
      } else if (
        status === 409 &&
        typeof err?.body?.message === "string" &&
        err.body.message.includes("idempotency key was already used")
      ) {
        setIntent((prev) => ({
          ...prev,
          status: "CONFLICT",
          error: msg,
        }));
      } else if (
        status === 409 &&
        typeof err?.body?.message === "string" &&
        err.body.message.includes("already been reversed")
      ) {
        setIntent((prev) => ({
          ...prev,
          status: "CONFLICT",
          error: msg,
        }));
      } else if (
        status === 409 &&
        typeof err?.body?.message === "string" &&
        err.body.message.includes("Concurrent reversal conflict")
      ) {
        setIntent((prev) => ({
          ...prev,
          status: "AMBIGUOUS_ERROR",
          error: msg,
        }));
      } else if (
        status === 400 ||
        status === 403 ||
        status === 401 ||
        status === 404
      ) {
        setIntent((prev) => ({
          ...prev,
          status: "IDLE",
          error: msg,
        }));
      } else {
        // Network timeout / 5xx / ambiguous
        setIntent((prev) => ({
          ...prev,
          status: "AMBIGUOUS_ERROR",
          error: msg,
        }));
      }
    }
  };

  const isSubmitting = intent.status === "SUBMITTING";

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="text-red-600" size={20} />
            <DialogTitle>Reverse Fee Payment</DialogTitle>
          </div>
          <DialogDescription>
            Full reversal only. Once reversed, the payment cannot be un-reversed.
          </DialogDescription>
        </DialogHeader>

        {intent.status === "COMPLETED" && intent.result ? (
          <div className="space-y-4 py-3">
            <div
              className={`rounded-xl p-4 border ${
                intent.result.isReplay
                  ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
                  : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2
                  className={
                    intent.result.isReplay ? "text-amber-600" : "text-emerald-600"
                  }
                  size={24}
                />
                <div>
                  <h3 className="font-semibold text-sm">
                    {intent.result.isReplay
                      ? "Idempotent Replay Acknowledged"
                      : "Payment Reversed Successfully"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {intent.result.isReplay
                      ? "This reversal was already completed. Verified idempotent confirmation."
                      : "The full payment amount has been reversed and restored to the outstanding balance."}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reversed Amount:</span>
                  <span className="font-bold text-red-600">
                    ₹{intent.result.reversal.reversalAmount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reason:</span>
                  <span className="font-medium">{intent.result.reversal.reason}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reversal Timestamp:</span>
                  <span>{formatCalendarDate(intent.result.reversal.createdAt)}</span>
                </div>
                {intent.result.headerSnapshot && (
                  <>
                    <div className="flex justify-between pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">Updated Total Paid:</span>
                      <span className="font-mono">
                        ₹{intent.result.headerSnapshot.totalPaidAmount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated Total Due:</span>
                      <span className="font-mono font-semibold text-primary">
                        ₹{intent.result.headerSnapshot.totalDueAmount}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <DialogFooter>
              <AppButton type="button" variant="primary" onClick={handleClose}>
                Close
              </AppButton>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Mandatory Policy Warning Banner */}
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 p-4 text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0"
                />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">Full Reversal Policy</p>
                  <p>
                    Full reversal only. Partial reversal is not supported. The full recorded payment amount will be restored to the outstanding fee balance.
                  </p>
                </div>
              </div>
            </div>

            {/* Target Payment Details */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <span className="text-muted-foreground">Original Payment Amount</span>
                <span className="font-bold text-base text-foreground font-mono">
                  ₹{payment.amount}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                <div>
                  <span className="block text-[10px] uppercase font-semibold">Payment Date</span>
                  <span className="text-foreground">{formatCalendarDate(payment.paymentDate)}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-semibold">Method</span>
                  <span className="text-foreground">{payment.paymentMethod}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] uppercase font-semibold">Receipt / Payment ID</span>
                  <code className="text-foreground font-mono text-[11px]">{payment.id}</code>
                </div>
              </div>

              {/* Component Allocations being undone */}
              {payment.allocations && payment.allocations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-1">
                    Component Balances to be Restored:
                  </span>
                  <div className="space-y-1 bg-muted/40 rounded p-2">
                    {payment.allocations.map((a) => (
                      <div key={a.id} className="flex justify-between text-[11px]">
                        <span>{a.componentName || "Component"}</span>
                        <span className="font-medium text-foreground">
                          ₹{a.netAmount ?? a.amount ?? a.originalAmount ?? "0.00"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {(formError || intent.error) && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 p-3 text-red-800 dark:text-red-300 text-xs flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold">
                    {intent.status === "AMBIGUOUS_ERROR"
                      ? "Submission Disruption"
                      : intent.status === "CONFLICT"
                      ? "Reversal Conflict"
                      : "Validation Error"}
                  </p>
                  <p className="mt-0.5">{formError || intent.error}</p>
                  {intent.status === "AMBIGUOUS_ERROR" && (
                    <p className="mt-1 text-[11px] opacity-90">
                      The server may have received and processed the reversal. You can safely retry with the exact same request key and reason.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Reason Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="reversal-reason"
                className="text-xs font-semibold text-foreground flex justify-between"
              >
                <span>
                  Reversal Reason <span className="text-red-500">*</span>
                </span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  {reason.length}/500
                </span>
              </label>
              <textarea
                id="reversal-reason"
                rows={3}
                placeholder="Enter the factual reason for reversing this payment (e.g. entered under wrong student, payment dishonoured, cash entry error)…"
                value={reason}
                onChange={(e) => handleReasonChange(e.target.value)}
                maxLength={500}
                disabled={isSubmitting || intent.status === "AMBIGUOUS_ERROR"}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <AppButton
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </AppButton>

              {intent.status === "AMBIGUOUS_ERROR" ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={() => handleSubmitReversal(true)}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  {isSubmitting ? "Retrying Prior Submission…" : "Retry Prior Submission"}
                </AppButton>
              ) : (
                <AppButton
                  type="button"
                  variant="danger"
                  onClick={() => handleSubmitReversal(false)}
                  disabled={isSubmitting || !reason.trim()}
                >
                  {isSubmitting ? "Reversing Payment…" : "Confirm Reversal"}
                </AppButton>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface AdmissionPaymentHistoryCardProps {
  admissionId: string;
  admissionStatus?: string;
  studentId?: string;
  session?: User | null;
}

export function AdmissionPaymentHistoryCard({
  admissionId,
  admissionStatus,
  studentId,
  session,
}: AdmissionPaymentHistoryCardProps) {
  const canRead = hasPermission(session, "FEES_READ");
  const canReverse = hasPermission(session, "FEES_REVERSE");
  const paymentsQuery = useAdmissionPayments(admissionId, { enabled: canRead });
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(
    null,
  );
  const [reversingPayment, setReversingPayment] =
    useState<AdmissionPaymentHistoryItem | null>(null);

  if (!canRead) return null;

  const payments = paymentsQuery.data || [];

  const toggleExpand = (id: string) => {
    setExpandedPaymentId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="panel mt-6">
      <div className="panel-head flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="text-primary" size={18} />
          <div>
            <h2>Admission Payment History</h2>
            <p className="text-xs text-muted-foreground">
              Official recorded fee collections and backend attribution logs
            </p>
          </div>
        </div>
        {payments.length > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
            {payments.length} {payments.length === 1 ? "Payment" : "Payments"}
          </span>
        )}
      </div>

      {paymentsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground p-4">Loading payment records…</p>
      ) : paymentsQuery.isError ? (
        <div className="p-4">
          <p className="text-xs text-red-600 font-medium">
            Could not load payment history.
          </p>
        </div>
      ) : payments.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No payments have been recorded for this admission yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {payments.map((p) => {
            const isExpanded = expandedPaymentId === p.id;

            return (
              <div key={p.id} className="p-4 text-xs transition-colors hover:bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">
                        ₹{p.amount}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-semibold text-muted-foreground">
                        {p.paymentMethod}
                      </span>
                      {p.isReversed ? (
                        <span className="px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[11px] font-semibold">
                          Reversed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold">
                          Collected
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-[11px] flex gap-3">
                      <span>Date: {formatCalendarDate(p.paymentDate)}</span>
                      <span>
                        Receipt/ID: <code className="font-mono">{p.id.slice(0, 8)}…</code>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {!p.isReversed && canReverse && (
                      <AppButton
                        type="button"
                        variant="danger"
                        onClick={() => setReversingPayment(p)}
                        disabled={admissionStatus === "CANCELLED"}
                        title={
                          admissionStatus === "CANCELLED"
                            ? "Payment reversal is not allowed for cancelled admissions."
                            : "Reverse this payment"
                        }
                        className="h-8 px-2.5 text-xs font-medium"
                      >
                        <RotateCcw size={13} className="mr-1" />
                        Reverse Payment
                      </AppButton>
                    )}

                    <AppButton
                      variant="ghost"
                      onClick={() => toggleExpand(p.id)}
                      className="h-8 text-xs flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          <span>Hide Attributions</span>
                          <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          <span>View Attributions</span>
                          <ChevronDown size={14} />
                        </>
                      )}
                    </AppButton>
                  </div>
                </div>

                {/* Expanded Attribution Details */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-border space-y-4">
                    {/* Reversal Notice if reversed */}
                    {p.isReversed && p.reversal && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
                        <div className="font-semibold mb-0.5">Payment Reversed in Full</div>
                        <div>Reason: {p.reversal.reason}</div>
                        <div className="text-[11px] opacity-75 mt-0.5">
                          Reversed on: {formatCalendarDate(p.reversal.createdAt)}
                        </div>
                      </div>
                    )}

                    {/* Component Attributions */}
                    <div>
                      <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1.5">
                        Component Allocations
                      </h4>
                      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                        {p.allocations.map((a) => (
                          <div
                            key={a.id}
                            className="px-3 py-2 flex justify-between items-center bg-card"
                          >
                            <span>{a.componentName || "Component"}</span>
                            <span className="font-semibold">
                              ₹{a.netAmount ?? a.amount ?? a.originalAmount ?? "0.00"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Backend-Derived Installment Attributions */}
                    <div>
                      <h4 className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1.5">
                        Backend-Derived Installment Attributions
                      </h4>
                      {p.installmentAllocations && p.installmentAllocations.length > 0 ? (
                        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                          {p.installmentAllocations.map((ia) => (
                            <div
                              key={ia.id}
                              className="px-3 py-2 flex justify-between items-center bg-card"
                            >
                              <div>
                                <span className="font-medium">
                                  {ia.label || (ia.sequence ? `Term ${ia.sequence}` : "Installment")}
                                </span>
                                {ia.dueDate && (
                                  <span className="text-muted-foreground text-[10px] ml-2">
                                    Due: {formatCalendarDate(ia.dueDate)}
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                ₹{ia.netAmount ?? ia.allocatedAmount}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          No installment attributions recorded for this payment.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReverseAdmissionPaymentDialog
        open={Boolean(reversingPayment)}
        onOpenChange={(open) => {
          if (!open) setReversingPayment(null);
        }}
        admissionId={admissionId}
        payment={reversingPayment}
        studentId={studentId}
        session={session}
      />
    </section>
  );
}
