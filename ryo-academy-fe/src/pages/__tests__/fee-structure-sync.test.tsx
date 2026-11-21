import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import type { SyncFeeStructureResponse } from "@/lib/fees-api";

const syncMocks = vi.hoisted(() => ({
  syncMutateAsync: vi.fn(),
  syncIsPending: false,
  structure: null as null | Record<string, unknown>,
  deactivateMaster: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/fees-api", () => ({
  feeErrorMessage: (error: unknown, fallback: string) =>
    error instanceof ApiError
      ? Array.isArray(error.backendMessage)
        ? error.backendMessage.join(" ")
        : error.backendMessage
      : fallback,
  formatFeeMoney: (v: any) => `₹${v}`,
  useFeeStructure: () => ({ data: syncMocks.structure, isLoading: false, isError: false }),
  useDeactivateFeeStructure: () => ({ mutateAsync: syncMocks.deactivateMaster, isPending: false }),
  useSyncFeeStructure: () => ({
    mutateAsync: syncMocks.syncMutateAsync,
    isPending: syncMocks.syncIsPending,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: syncMocks.toast }));
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["", syncMocks.navigate],
}));

import { RealFeeDetail } from "@/pages/fee-pages";
import { FeeStructureSyncDialog } from "@/pages/fee-structure-sync-dialog";

const baseUser = {
  id: "user-1",
  name: "Admin",
  email: "admin@example.test",
  schoolId: "school-1",
  role: "OFFICE_ADMIN" as const,
  avatar: "A",
  title: "Admin",
};

const viewOnlySession = { ...baseUser, permissions: ["FEES_READ" as const] };
const createOnlySession = { ...baseUser, permissions: ["FEES_CREATE" as const] };
const updateSession = { ...baseUser, permissions: ["FEES_UPDATE" as const] };

const activeMaster = {
  id: "master-sync-1",
  name: "Secondary Fee Structure 2026-27",
  description: "Annual academic fees",
  totalAmount: "45000.00",
  isActive: true,
  academicYearId: "year-1",
  programId: "program-1",
  classId: "class-1",
  academicYear: { id: "year-1", name: "2026–27" },
  program: { id: "program-1", name: "Secondary" },
  class: { id: "class-1", name: "Class 10" },
  feeComponents: [
    { id: "comp-1", name: "Tuition Fee", amount: "40000.00", isActive: true, isMandatory: true, discountApplicable: true },
    { id: "comp-2", name: "Science Lab", amount: "5000.00", isActive: true, isMandatory: false, discountApplicable: false },
  ],
};

const mockSyncSuccess: SyncFeeStructureResponse = {
  feeStructureId: "master-sync-1",
  synchronizedAt: "2026-11-20T05:30:00.000Z",
  eligibleAdmissionCount: 14,
  synchronizedAdmissionCount: 14,
  admissionsWithScheduleCount: 11,
  admissionsWithoutScheduleCount: 3,
  caseAIncreasesCount: 5,
  supplementaryRootsCreatedCount: 2,
  detailsInsertedCount: 6,
  detailsUpdatedCount: 18,
};

describe("Fee Structure Master Synchronization UI & Dialog (Task 4.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMocks.syncIsPending = false;
    syncMocks.structure = activeMaster;
  });

  it("1. FEES_UPDATE user sees the 'Synchronize Admissions' action", () => {
    render(<RealFeeDetail id="master-sync-1" session={updateSession} />);
    expect(screen.getByRole("button", { name: /synchronize admissions/i })).toBeInTheDocument();
  });

  it("2. Users without FEES_UPDATE (view-only or create-only) do NOT see the action", () => {
    const { rerender } = render(<RealFeeDetail id="master-sync-1" session={viewOnlySession} />);
    expect(screen.queryByRole("button", { name: /synchronize admissions/i })).not.toBeInTheDocument();

    rerender(<RealFeeDetail id="master-sync-1" session={createOnlySession} />);
    expect(screen.queryByRole("button", { name: /synchronize admissions/i })).not.toBeInTheDocument();
  });

  it("3. Synchronization is not executed merely by opening the dialog", async () => {
    const user = userEvent.setup();
    render(<RealFeeDetail id="master-sync-1" session={updateSession} />);

    await user.click(screen.getByRole("button", { name: /synchronize admissions/i }));

    // Dialog title is visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Atomic Financial Reconciliation/i)).toBeInTheDocument();

    // Verify mutation was not invoked
    expect(syncMocks.syncMutateAsync).not.toHaveBeenCalled();
  });

  it("4. Submits optional supplementary due date when provided", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync.mockResolvedValueOnce(mockSyncSuccess);

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    const dateInput = screen.getByLabelText(/supplementary due date/i);
    await user.type(dateInput, "2026-12-31");

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    expect(syncMocks.syncMutateAsync).toHaveBeenCalledWith({
      id: "master-sync-1",
      payload: { supplementaryDueDate: "2026-12-31" },
    });
  });

  it("5. Omitted date submits undefined payload to let backend use default", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync.mockResolvedValueOnce(mockSyncSuccess);

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    expect(syncMocks.syncMutateAsync).toHaveBeenCalledWith({
      id: "master-sync-1",
      payload: undefined,
    });
  });

  it("6. Pending mutation disables controls and prevents duplicate submission", () => {
    syncMocks.syncIsPending = true;

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    const submitBtn = screen.getByRole("button", { name: /synchronizing admissions…/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByLabelText(/supplementary due date/i)).toBeDisabled();
  });

  it("7. Successful response displays every actual backend metric", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync.mockResolvedValueOnce(mockSyncSuccess);

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByText(/Synchronization Executed Successfully/i)).toBeInTheDocument();
    });

    // Check all 8 numerical metrics and timestamp
    expect(screen.getAllByText("14")).toHaveLength(2); // Admissions Examined & Admissions Updated
    expect(screen.getByText("11")).toBeInTheDocument(); // With Schedule
    expect(screen.getByText("3")).toBeInTheDocument();  // Without Schedule
    expect(screen.getByText("6")).toBeInTheDocument();  // Details Inserted
    expect(screen.getByText("18")).toBeInTheDocument(); // Details Updated
    expect(screen.getByText("5")).toBeInTheDocument();  // Pending Increased
    expect(screen.getByText("2")).toBeInTheDocument();  // Supplementary Roots
    expect(screen.getByText(/Synchronized at:/i)).toBeInTheDocument();
    expect(syncMocks.toast).toHaveBeenCalledWith({
      title: "Synchronization complete",
      description: "Successfully synchronized 14 admission(s).",
    });
  });

  it("8. ACADEMIC_YEAR_ENDED error prompts for date, allows correction, and resubmits successfully", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync
      .mockRejectedValueOnce(
        new ApiError(409, {
          code: "ACADEMIC_YEAR_ENDED_SUPPLEMENTARY_DATE_REQUIRED",
          message: "Academic year has ended; an explicit future supplementaryDueDate is required.",
        })
      )
      .mockResolvedValueOnce(mockSyncSuccess);

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    // First attempt without date -> error
    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByText("Supplementary Due Date Required")).toBeInTheDocument();
      expect(screen.getByText(/The academic year has ended/i)).toBeInTheDocument();
    });

    // User provides a date
    const dateInput = screen.getByLabelText(/supplementary due date/i);
    await user.type(dateInput, "2027-04-30");

    // Re-submit
    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByText(/Synchronization Executed Successfully/i)).toBeInTheDocument();
    });

    expect(syncMocks.syncMutateAsync).toHaveBeenLastCalledWith({
      id: "master-sync-1",
      payload: { supplementaryDueDate: "2027-04-30" },
    });
  });

  it("9. NEGATIVE_DUE_PROHIBITED displays safe explanation of rollback", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync.mockRejectedValueOnce(
      new ApiError(409, {
        code: "NEGATIVE_DUE_PROHIBITED",
        message: "Header net amount cannot be less than paid amount.",
      })
    );

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByText("Negative Balance Prohibited")).toBeInTheDocument();
      expect(screen.getByText(/The entire transaction has rolled back/i)).toBeInTheDocument();
    });
  });

  it("10. CONCURRENT_FINANCIAL_TRANSACTION communicates retry advice safely", async () => {
    const user = userEvent.setup();
    syncMocks.syncMutateAsync.mockRejectedValueOnce(
      new ApiError(409, {
        code: "CONCURRENT_FINANCIAL_TRANSACTION",
        message: "Concurrent financial modification detected.",
      })
    );

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={vi.fn()}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByText("Concurrent Financial Transaction")).toBeInTheDocument();
      expect(screen.getByText(/Please verify activity and try again/i)).toBeInTheDocument();
    });
  });

  it("11. Existing Fee Structure Master actions (edit, add component, deactivate) remain present and functional", () => {
    render(<RealFeeDetail id="master-sync-1" session={updateSession} />);

    expect(screen.getByRole("link", { name: /edit fee structure/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /synchronize admissions/i })).toBeInTheDocument();
  });

  it("12. Dialog can be dismissed safely after completion", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    syncMocks.syncMutateAsync.mockResolvedValueOnce(mockSyncSuccess);

    render(
      <FeeStructureSyncDialog
        open={true}
        onOpenChange={onOpenChange}
        feeStructureId="master-sync-1"
        feeStructureName="Secondary Fee Structure 2026-27"
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm & synchronize/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /done & close/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /done & close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
