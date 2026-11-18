import { createElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CollectAdmissionPaymentDialog,
  AdmissionPaymentHistoryCard,
  ReverseAdmissionPaymentDialog,
} from "../admission-payment-components";
import { StudentDetail } from "../admissions-students-pages";
import type { User } from "@/lib/mock-erp";
import type { FeeConfigurationDetail } from "@/lib/concessions-api";

const { mockCalls, MockApiError } = vi.hoisted(() => {
  const calls = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  class CustomApiError extends Error {
    readonly status: number;
    readonly backendMessage: string | string[];
    readonly body?: unknown;
    readonly code?: string;
    constructor(status: number, body?: any) {
      const msg = body?.message ?? `Request failed with status ${status}`;
      super(Array.isArray(msg) ? msg.join(", ") : msg);
      this.name = "ApiError";
      this.status = status;
      this.backendMessage = msg;
      this.body = body;
      this.code = body?.code;
    }
  }
  return { mockCalls: calls, MockApiError: CustomApiError };
});

vi.mock("@/lib/api-client", () => ({
  apiClient: mockCalls,
  ApiError: MockApiError,
}));

vi.mock("@/lib/session", () => ({
  session: { getAccessToken: () => "test-token" },
}));

const feesAdminUser: User = {
  id: "admin-1",
  email: "admin@ryo.test",
  name: "Fees Admin",
  schoolId: "school-1",
  role: "OFFICE_ADMIN",
  title: "Admin",
  avatar: "FA",
  permissions: [
    "FEES_CREATE",
    "FEES_READ",
    "FEES_UPDATE",
    "FEES_REVERSE",
    "STUDENT_READ",
    "ADMISSION_READ",
    "INSTALLMENT_SCHEDULE_READ",
  ],
};

const readOnlyUser: User = {
  id: "reader-1",
  email: "reader@ryo.test",
  name: "Reader User",
  schoolId: "school-1",
  role: "STAFF",
  title: "Staff",
  avatar: "RU",
  permissions: ["FEES_READ", "STUDENT_READ", "ADMISSION_READ"],
};

const sampleDetails: FeeConfigurationDetail[] = [
  {
    id: "det-tuition",
    feeComponentId: "comp-tui",
    name: "Tuition Fee",
    originalAmount: "40000.00",
    discountAmount: "5000.00",
    finalAmount: "35000.00",
    totalAmountToBePaid: "35000.00",
    amountPaid: "10000.00",
    isMandatory: true,
    discountApplicable: true,
    isActive: true,
    isIncluded: true,
    concession: null,
  },
  {
    id: "det-library",
    feeComponentId: "comp-lib",
    name: "Library Fee",
    originalAmount: "5000.00",
    discountAmount: "0.00",
    finalAmount: "5000.00",
    totalAmountToBePaid: "5000.00",
    amountPaid: "0.00",
    isMandatory: false,
    discountApplicable: false,
    isActive: true,
    isIncluded: true,
    concession: null,
  },
  {
    id: "det-transport-excluded",
    feeComponentId: "comp-trans",
    name: "Transport Fee",
    originalAmount: "12000.00",
    discountAmount: "0.00",
    finalAmount: "12000.00",
    totalAmountToBePaid: "12000.00",
    amountPaid: "0.00",
    isMandatory: false,
    discountApplicable: false,
    isActive: true,
    isIncluded: false, // EXCLUDED from billing
    concession: null,
  },
];

const sampleHeader = {
  id: "hdr-1",
  pricingVersion: "V0_SNAPSHOTTED",
  totalFeeAmount: "40000.00",
  totalPaidAmount: "10000.00",
  totalDueAmount: "30000.00",
  netAmount: "40000.00",
  feePaymentDetails: sampleDetails,
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, ui),
  );
}

describe("FE-M3: V0 Payment Collection UI & History Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Component Allocation Grid & Validation", () => {
    it("renders only active and included fee components with balances", () => {
      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          admissionNumber="ADM-2026-001"
          applicantName="Rahul Sharma"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      // Tuition (included) and Library (included) must appear
      expect(screen.getByText("Tuition Fee")).toBeInTheDocument();
      expect(screen.getByText("Library Fee")).toBeInTheDocument();
      // Transport (isIncluded: false) must NOT appear in allocation grid
      expect(screen.queryByText("Transport Fee")).not.toBeInTheDocument();

      // Check remaining balances
      // Tuition: 35000 - 10000 = 25000.00
      expect(screen.getByText("Due: ₹25000.00")).toBeInTheDocument();
      // Library: 5000 - 0 = 5000.00
      expect(screen.getByText("Due: ₹5000.00")).toBeInTheDocument();

      // Payment method fixed CASH
      expect(screen.getByText(/CASH \(Fixed\)/i)).toBeInTheDocument();
    });

    it("prevents submission when no allocation is entered", async () => {
      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      expect(submitBtn).toBeDisabled();
    });

    it("validates that an allocation cannot exceed the component outstanding balance", async () => {
      const user = userEvent.setup();

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const tuitionInput = screen.getByLabelText(/Allocation for Tuition Fee/i);
      // Tuition balance is 25000.00; enter 30000.00
      await user.type(tuitionInput, "30000.00");

      expect(
        screen.getByText(/Exceeds balance \(₹25000\.00\)/i),
      ).toBeInTheDocument();

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      expect(submitBtn).toBeDisabled();
    });

    it("populates remaining balance when clicking 'Full Due' and updates total in real time", async () => {
      const user = userEvent.setup();

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const fullDueBtns = screen.getAllByRole("button", { name: /Full Due/i });
      // Click Full Due for Tuition (25000.00)
      await user.click(fullDueBtns[0]);

      const tuitionInput = screen.getByLabelText(/Allocation for Tuition Fee/i);
      expect(tuitionInput).toHaveValue("25000.00");

      // Total must display ₹25000.00
      expect(screen.getByText("₹25000.00")).toBeInTheDocument();

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      expect(submitBtn).toBeEnabled();
    });

    it("'Allocate All Due' populates all remaining component balances", async () => {
      const user = userEvent.setup();

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const allocateAllBtn = screen.getByRole("button", { name: /Allocate All Due/i });
      await user.click(allocateAllBtn);

      const tuitionInput = screen.getByLabelText(/Allocation for Tuition Fee/i);
      const libraryInput = screen.getByLabelText(/Allocation for Library Fee/i);

      expect(tuitionInput).toHaveValue("25000.00");
      expect(libraryInput).toHaveValue("5000.00");

      // Total 25000 + 5000 = 30000.00
      expect(screen.getByText("₹30000.00")).toBeInTheDocument();
    });
  });

  describe("2. Payment Submission & Backend Attribution Response", () => {
    it("submits payment to POST /admissions/:id/payments and displays derived installments", async () => {
      const user = userEvent.setup();
      const onSuccessSpy = vi.fn();

      mockCalls.post.mockResolvedValueOnce({
        statusCode: 201,
        isReplay: false,
        id: "pay-v0-001",
        idempotencyKey: "test-uuid-key",
        admissionId: "adm-1",
        feePaymentHeaderId: "hdr-1",
        amount: "5000.00",
        paymentMethod: "CASH",
        paymentDate: "2026-11-10T00:00:00.000Z",
        createdAt: "2026-11-10T00:00:00.000Z",
        allocations: [
          { id: "att-1", feePaymentDetailsId: "det-library", amount: "5000.00" },
        ],
        installmentAllocations: [
          {
            id: "inst-alloc-1",
            installmentId: "inst-term-1",
            feePaymentHeaderId: "hdr-1",
            allocatedAmount: "5000.00",
          },
        ],
        headerSnapshot: {
          totalFeeAmount: "40000.00",
          totalPaidAmount: "15000.00",
          totalDueAmount: "25000.00",
        },
      });

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
          onSuccess={onSuccessSpy}
        />,
      );

      const libraryInput = screen.getByLabelText(/Allocation for Library Fee/i);
      await user.type(libraryInput, "5000.00");

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockCalls.post).toHaveBeenCalledWith(
          "/admissions/adm-1/payments",
          expect.objectContaining({
            feePaymentHeaderId: "hdr-1",
            amount: "5000.00",
            paymentMethod: "CASH",
            allocations: [
              { feePaymentDetailsId: "det-library", amount: "5000.00" },
            ],
          }),
          expect.anything(),
        );
      });

      // Shows success banner
      expect(
        screen.getByText(/Payment Recorded Successfully/i),
      ).toBeInTheDocument();

      // Displays backend-derived installment allocations
      expect(
        screen.getByText(/Backend-Derived Installment Settlement \(FIFO\)/i),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/₹5000\.00/i).length).toBeGreaterThanOrEqual(1);

      expect(onSuccessSpy).toHaveBeenCalledTimes(1);
    });

    it("displays idempotent replay confirmation when response isReplay: true", async () => {
      const user = userEvent.setup();

      mockCalls.post.mockResolvedValueOnce({
        statusCode: 200,
        isReplay: true,
        id: "pay-v0-existing",
        idempotencyKey: "test-uuid-key",
        admissionId: "adm-1",
        feePaymentHeaderId: "hdr-1",
        amount: "5000.00",
        paymentMethod: "CASH",
        paymentDate: "2026-11-10T00:00:00.000Z",
        createdAt: "2026-11-10T00:00:00.000Z",
        allocations: [
          { id: "att-1", feePaymentDetailsId: "det-library", amount: "5000.00" },
        ],
        installmentAllocations: [],
        headerSnapshot: null,
      });

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const libraryInput = screen.getByLabelText(/Allocation for Library Fee/i);
      await user.type(libraryInput, "5000.00");

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Payment Already Recorded \(Idempotent Replay\)/i),
        ).toBeInTheDocument();
      });
    });

    it("handles SCHEDULE_REQUIRED conflict with actionable message", async () => {
      const user = userEvent.setup();

      mockCalls.post.mockRejectedValueOnce(
        new MockApiError(409, {
          code: "SCHEDULE_REQUIRED",
          message:
            "An installment schedule must be configured before collecting the first payment on this admission.",
        }),
      );

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const libraryInput = screen.getByLabelText(/Allocation for Library Fee/i);
      await user.type(libraryInput, "1000.00");

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            /An installment schedule must be configured before collecting the first payment on this admission\./i,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("3. Idempotency State-Machine & Ambiguous Failure Retry", () => {
    it("freezes intent on ambiguous error and allows safe retry with identical key and payload", async () => {
      const user = userEvent.setup();

      // First call fails ambiguously with network error / 500
      mockCalls.post.mockRejectedValueOnce(
        new Error("Network connection lost or timeout"),
      );

      renderWithClient(
        <CollectAdmissionPaymentDialog
          open={true}
          onOpenChange={vi.fn()}
          admissionId="adm-1"
          feePaymentHeader={sampleHeader}
          session={feesAdminUser}
        />,
      );

      const libraryInput = screen.getByLabelText(/Allocation for Library Fee/i);
      await user.type(libraryInput, "2000.00");

      const submitBtn = screen.getByRole("button", { name: /Record Payment/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Prior Submission Unresolved/i),
        ).toBeInTheDocument();
      });

      // The button should now say "Retry Prior Submission"
      const retryBtn = screen.getByRole("button", {
        name: /Retry Prior Submission/i,
      });
      expect(retryBtn).toBeInTheDocument();

      // Now mock success for retry
      mockCalls.post.mockResolvedValueOnce({
        statusCode: 200,
        isReplay: true,
        id: "pay-v0-recovered",
        idempotencyKey: "frozen-key",
        admissionId: "adm-1",
        feePaymentHeaderId: "hdr-1",
        amount: "2000.00",
        paymentMethod: "CASH",
        paymentDate: "2026-11-10T00:00:00.000Z",
        createdAt: "2026-11-10T00:00:00.000Z",
        allocations: [
          { id: "att-1", feePaymentDetailsId: "det-library", amount: "2000.00" },
        ],
        installmentAllocations: [],
        headerSnapshot: null,
      });

      await user.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Payment Already Recorded \(Idempotent Replay\)/i),
        ).toBeInTheDocument();
      });

      // Verify that both the first attempt and the retry sent the exact same idempotency key and amount
      expect(mockCalls.post).toHaveBeenCalledTimes(2);
      const call1Payload = mockCalls.post.mock.calls[0][1];
      const call2Payload = mockCalls.post.mock.calls[1][1];
      expect(call1Payload.idempotencyKey).toBe(call2Payload.idempotencyKey);
      expect(call1Payload.amount).toBe(call2Payload.amount);
      expect(call1Payload.allocations).toEqual(call2Payload.allocations);
    });
  });

  describe("4. Payment History & Installment Attribution Display", () => {
    it("renders payment records, expands component and installment attribution, and displays reversals", async () => {
      const user = userEvent.setup();

      const sampleHistory = [
        {
          id: "pay-hist-1",
          idempotencyKey: "key-1",
          admissionId: "adm-1",
          feePaymentHeaderId: "hdr-1",
          amount: "10000.00",
          paymentMethod: "CASH",
          paymentDate: "2026-11-09T00:00:00.000Z",
          createdAt: "2026-11-09T00:00:00.000Z",
          isReversed: false,
          reversal: null,
          allocations: [
            {
              id: "att-1",
              feePaymentDetailsId: "det-tuition",
              componentName: "Tuition Fee",
              netAmount: "10000.00",
            },
          ],
          installmentAllocations: [
            {
              id: "inst-att-1",
              installmentId: "inst-1",
              sequence: 1,
              label: "Term 1 Fee",
              dueDate: "2026-11-15T00:00:00.000Z",
              allocatedAmount: "10000.00",
              netAmount: "10000.00",
            },
          ],
        },
        {
          id: "pay-hist-2",
          idempotencyKey: "key-2",
          admissionId: "adm-1",
          feePaymentHeaderId: "hdr-1",
          amount: "3000.00",
          paymentMethod: "CASH",
          paymentDate: "2026-11-08T00:00:00.000Z",
          createdAt: "2026-11-08T00:00:00.000Z",
          isReversed: true,
          reversal: {
            id: "rev-1",
            reversalAmount: "3000.00",
            reason: "Incorrect component selected by cashier",
            createdAt: "2026-11-09T10:00:00.000Z",
          },
          allocations: [
            {
              id: "att-2",
              feePaymentDetailsId: "det-library",
              componentName: "Library Fee",
              netAmount: "0.00",
            },
          ],
          installmentAllocations: [],
        },
      ];

      mockCalls.get.mockResolvedValueOnce(sampleHistory);

      renderWithClient(
        <AdmissionPaymentHistoryCard
          admissionId="adm-1"
          session={feesAdminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("₹10000.00")).toBeInTheDocument();
      });

      // Check payment amounts
      expect(screen.getByText("₹3000.00")).toBeInTheDocument();

      // Check statuses
      expect(screen.getByText("Collected")).toBeInTheDocument();
      expect(screen.getByText("Reversed")).toBeInTheDocument();

      // Expand attributions on first payment
      const viewAttributionBtns = screen.getAllByRole("button", {
        name: /View Attributions/i,
      });
      await user.click(viewAttributionBtns[0]);

      // Verify component allocation
      expect(screen.getByText("Tuition Fee")).toBeInTheDocument();

      // Verify backend-derived installment allocation
      expect(screen.getByText("Term 1 Fee")).toBeInTheDocument();
      expect(screen.getByText(/15 Nov 2026/i)).toBeInTheDocument();

      // Expand second payment (reversed)
      await user.click(viewAttributionBtns[1]);

      expect(
        screen.getByText(/Payment Reversed in Full/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Reason: Incorrect component selected by cashier/i),
      ).toBeInTheDocument();
    });

    it("hides AdmissionPaymentHistoryCard completely when lacking FEES_READ permission", () => {
      const unauthorizedUser: User = {
        ...readOnlyUser,
        permissions: ["STUDENT_READ"], // lacks FEES_READ
      };

      const { container } = renderWithClient(
        <AdmissionPaymentHistoryCard
          admissionId="adm-1"
          session={unauthorizedUser}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("5. StudentDetail Pricing-Version Isolation & Fail-Closed Behavior", () => {
    it("suppresses legacy quick payment form for V0 student and exposes structured collection", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/students/std-1/fees")) {
          return {
            student: { id: "std-1", studentNumber: "STD-01", studentName: "Rohan" },
            admission: { id: "adm-1", admissionNumber: "ADM-01", admissionStatus: "CONFIRMED" },
            fee: { id: "fee-1", totalAmount: 40000, paidAmount: 10000, outstandingAmount: 30000, components: [] },
            payments: [],
          };
        }
        if (url.includes("/students/std-1")) {
          return {
            id: "std-1",
            admissionId: "adm-1",
            studentNumber: "STD-01",
            studentName: "Rohan",
            gender: "Male",
            dateOfBirth: "2008-01-01",
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
            studentSequence: 1,
            admission: { admissionNumber: "ADM-01" },
          };
        }
        if (url.includes("/fee-configuration")) {
          return {
            admissionId: "adm-1",
            feePaymentHeader: {
              ...sampleHeader,
              pricingVersion: "V0_SNAPSHOTTED",
            },
          };
        }
        if (url.includes("/admissions/adm-1/concessions")) {
          return {
            admissionId: "adm-1",
            concessionTotal: 5000,
            components: [],
          };
        }
        if (url.includes("/admissions/adm-1/installment-schedule")) {
          return { schedule: null, isFrozen: false };
        }
        if (url.includes("/admissions/adm-1/payments")) {
          return [];
        }
        return [];
      });

      renderWithClient(
        <StudentDetail id="std-1" session={feesAdminUser} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Fee payment")).toBeInTheDocument();
      });

      // The blind legacy amount input must NOT be present
      expect(screen.queryByLabelText(/Amount \(INR\)/i)).not.toBeInTheDocument();

      // Instead, V0 guidance banner and structured collection button must appear
      expect(
        screen.getByText(
          /This student uses V0 Structured Fees\. Payments require explicit component allocations\./i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Collect Fee Payment \(V0\)/i }),
      ).toBeInTheDocument();
    });

    it("preserves legacy quick payment form for LEGACY pricing student", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/students/std-legacy/fees")) {
          return {
            student: { id: "std-legacy", studentNumber: "STD-LEG", studentName: "Legacy User" },
            admission: { id: "adm-leg", admissionNumber: "ADM-LEG", admissionStatus: "CONFIRMED" },
            fee: { id: "fee-leg", totalAmount: 20000, paidAmount: 0, outstandingAmount: 20000, components: [] },
            payments: [],
          };
        }
        if (url.includes("/students/std-legacy")) {
          return {
            id: "std-legacy",
            admissionId: "adm-leg",
            studentNumber: "STD-LEG",
            studentName: "Legacy User",
            gender: "Female",
            dateOfBirth: "2007-05-15",
            createdAt: "2025-01-01",
            updatedAt: "2025-01-01",
            studentSequence: 99,
            admission: { admissionNumber: "ADM-LEG" },
          };
        }
        if (url.includes("/fee-configuration")) {
          return {
            admissionId: "adm-leg",
            feePaymentHeader: {
              ...sampleHeader,
              pricingVersion: "LEGACY",
            },
          };
        }
        if (url.includes("/admissions/adm-leg/concessions")) {
          return { admissionId: "adm-leg", components: [] };
        }
        if (url.includes("/admissions/adm-leg/installment-schedule")) {
          return { schedule: null, isFrozen: false };
        }
        if (url.includes("/admissions/adm-leg/payments")) {
          return [];
        }
        return [];
      });

      renderWithClient(
        <StudentDetail id="std-legacy" session={feesAdminUser} />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Amount \(INR\)/i)).toBeInTheDocument();
      });

      // Legacy input fields must be preserved
      expect(screen.getByLabelText(/Payment date/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Record payment/i }),
      ).toBeInTheDocument();
    });

    it("fails closed when pricing version is unresolved or loading", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/students/std-unresolved/fees")) {
          return {
            student: { id: "std-unresolved", studentNumber: "STD-UNR", studentName: "Unresolved" },
            admission: { id: "adm-unr", admissionNumber: "ADM-UNR", admissionStatus: "DRAFT" },
            fee: { id: "fee-unr", totalAmount: 10000, paidAmount: 0, outstandingAmount: 10000, components: [] },
            payments: [],
          };
        }
        if (url.includes("/students/std-unresolved")) {
          return {
            id: "std-unresolved",
            admissionId: "adm-unr",
            studentNumber: "STD-UNR",
            studentName: "Unresolved",
            gender: "Male",
            dateOfBirth: "2008-01-01",
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
            studentSequence: 2,
            admission: { admissionNumber: "ADM-UNR" },
          };
        }
        if (url.includes("/fee-configuration")) {
          // Never returns pricingVersion (unresolved)
          return {
            admissionId: "adm-unr",
            feePaymentHeader: {
              ...sampleHeader,
              pricingVersion: undefined,
            },
          };
        }
        return [];
      });

      renderWithClient(
        <StudentDetail id="std-unresolved" session={feesAdminUser} />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Resolving pricing version configuration…/i),
        ).toBeInTheDocument();
      });

      // Neither V0 button nor legacy form can be accessed while unresolved
      expect(screen.queryByLabelText(/Amount \(INR\)/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Collect Fee Payment \(V0\)/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("FE-M4: Payment Reversal Workflow", () => {
    const samplePaymentItem = {
      id: "pay-100",
      idempotencyKey: "pay-key-100",
      admissionId: "adm-1",
      feePaymentHeaderId: "hdr-1",
      amount: "5000.00",
      paymentMethod: "CASH",
      paymentDate: "2026-11-10T00:00:00.000Z",
      createdAt: "2026-11-10T10:00:00.000Z",
      isReversed: false,
      reversal: null,
      allocations: [
        {
          id: "alloc-1",
          feePaymentDetailsId: "det-tuition",
          componentName: "Tuition Fee",
          amount: "5000.00",
        },
      ],
      installmentAllocations: [
        {
          id: "inst-alloc-1",
          installmentId: "inst-1",
          sequence: 1,
          label: "Term 1",
          dueDate: "2026-11-15T00:00:00.000Z",
          allocatedAmount: "5000.00",
        },
      ],
    };

    const reversedPaymentItem = {
      ...samplePaymentItem,
      id: "pay-200",
      isReversed: true,
      reversal: {
        id: "rev-200",
        reversalAmount: "5000.00",
        reason: "Cancelled by student request",
        createdAt: "2026-11-10T11:00:00.000Z",
      },
    };

    it("renders 'Reverse Payment' only when user has FEES_REVERSE and payment is not reversed", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/payments")) {
          return [samplePaymentItem, reversedPaymentItem];
        }
        return [];
      });

      renderWithClient(
        <AdmissionPaymentHistoryCard
          admissionId="adm-1"
          session={feesAdminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText(/₹5000\.00/i).length).toBeGreaterThanOrEqual(1);
      });

      // Exactly one "Reverse Payment" button for the unreversed payment
      const reverseButtons = screen.getAllByRole("button", {
        name: /Reverse Payment/i,
      });
      expect(reverseButtons).toHaveLength(1);
    });

    it("hides 'Reverse Payment' button when user lacks FEES_REVERSE", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/payments")) {
          return [samplePaymentItem];
        }
        return [];
      });

      renderWithClient(
        <AdmissionPaymentHistoryCard
          admissionId="adm-1"
          session={readOnlyUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByText(/₹5000\.00/i).length).toBeGreaterThanOrEqual(1);
      });

      expect(
        screen.queryByRole("button", { name: /Reverse Payment/i }),
      ).not.toBeInTheDocument();
    });

    it("disables 'Reverse Payment' button when admission is CANCELLED", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/payments")) {
          return [samplePaymentItem];
        }
        return [];
      });

      renderWithClient(
        <AdmissionPaymentHistoryCard
          admissionId="adm-1"
          admissionStatus="CANCELLED"
          session={feesAdminUser}
        />,
      );

      await waitFor(() => {
        const reverseBtn = screen.getByRole("button", {
          name: /Reverse Payment/i,
        });
        expect(reverseBtn).toBeDisabled();
      });
    });

    it("validates mandatory reversal reason and displays required warning policy", async () => {
      renderWithClient(
        <ReverseAdmissionPaymentDialog
          open={true}
          onOpenChange={() => {}}
          admissionId="adm-1"
          payment={samplePaymentItem}
          session={feesAdminUser}
        />,
      );

      expect(screen.getByText(/Reverse Fee Payment/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Full reversal only\. Partial reversal is not supported\. The full recorded payment amount will be restored to the outstanding fee balance\./i,
        ),
      ).toBeInTheDocument();

      const confirmBtn = screen.getByRole("button", {
        name: /Confirm Reversal/i,
      });
      expect(confirmBtn).toBeDisabled();

      const textarea = screen.getByPlaceholderText(/Enter the factual reason/i);

      // Typing whitespace leaves button disabled
      await userEvent.type(textarea, "   ");
      expect(confirmBtn).toBeDisabled();

      // Typing non-empty reason (even short, no artificial 5-char limit) enables button
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Void");
      expect(confirmBtn).toBeEnabled();
    });

    it("submits reversal, calls backend API, and displays confirmed result", async () => {
      const mockReversalResponse = {
        statusCode: 200,
        isReplay: false,
        reversal: {
          id: "rev-300",
          reversalAmount: "5000.00",
          reason: "Cash entry clerical error",
          createdAt: "2026-11-10T12:00:00.000Z",
        },
        headerSnapshot: {
          totalFeeAmount: "50000.00",
          totalPaidAmount: "0.00",
          totalDueAmount: "50000.00",
        },
      };

      mockCalls.post.mockResolvedValueOnce(mockReversalResponse);

      renderWithClient(
        <ReverseAdmissionPaymentDialog
          open={true}
          onOpenChange={() => {}}
          admissionId="adm-1"
          payment={samplePaymentItem}
          session={feesAdminUser}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Enter the factual reason/i);
      await userEvent.type(textarea, "Cash entry clerical error");

      const confirmBtn = screen.getByRole("button", {
        name: /Confirm Reversal/i,
      });
      await userEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockCalls.post).toHaveBeenCalledWith(
          "/admissions/adm-1/payments/pay-100/reverse",
          expect.objectContaining({
            idempotencyKey: expect.any(String),
            reason: "Cash entry clerical error",
          }),
          { token: "test-token" },
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Payment Reversed Successfully/i),
        ).toBeInTheDocument();
        expect(screen.getByText(/Updated Total Due:/i)).toBeInTheDocument();
      });
    });

    it("acknowledges idempotent replay response (HTTP 200 isReplay: true)", async () => {
      const mockReplayResponse = {
        statusCode: 200,
        isReplay: true,
        reversal: {
          id: "rev-300",
          reversalAmount: "5000.00",
          reason: "Prior reversal reason",
          createdAt: "2026-11-10T12:00:00.000Z",
        },
        headerSnapshot: {
          totalFeeAmount: "50000.00",
          totalPaidAmount: "0.00",
          totalDueAmount: "50000.00",
        },
      };

      mockCalls.post.mockResolvedValueOnce(mockReplayResponse);

      renderWithClient(
        <ReverseAdmissionPaymentDialog
          open={true}
          onOpenChange={() => {}}
          admissionId="adm-1"
          payment={samplePaymentItem}
          session={feesAdminUser}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Enter the factual reason/i);
      await userEvent.type(textarea, "Prior reversal reason");

      const confirmBtn = screen.getByRole("button", {
        name: /Confirm Reversal/i,
      });
      await userEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Idempotent Replay Acknowledged/i),
        ).toBeInTheDocument();
      });
    });

    it("handles ambiguous network failure, locks input, and retries with identical key and reason", async () => {
      mockCalls.post.mockRejectedValueOnce(new Error("Network timeout"));

      renderWithClient(
        <ReverseAdmissionPaymentDialog
          open={true}
          onOpenChange={() => {}}
          admissionId="adm-1"
          payment={samplePaymentItem}
          session={feesAdminUser}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Enter the factual reason/i);
      await userEvent.type(textarea, "Payment returned NSF");

      const confirmBtn = screen.getByRole("button", {
        name: /Confirm Reversal/i,
      });
      await userEvent.click(confirmBtn);

      // Enters ambiguous error state
      await waitFor(() => {
        expect(
          screen.getByText(/Submission Disruption/i),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Retry Prior Submission/i }),
        ).toBeInTheDocument();
      });

      // Textarea is locked during ambiguous error
      expect(textarea).toBeDisabled();

      // Capture first submission call arguments
      const firstCallArgs = mockCalls.post.mock.calls[0];
      const frozenKey = firstCallArgs[1].idempotencyKey;
      const frozenReason = firstCallArgs[1].reason;

      // Now mock successful retry
      mockCalls.post.mockResolvedValueOnce({
        statusCode: 200,
        isReplay: false,
        reversal: {
          id: "rev-nsf",
          reversalAmount: "5000.00",
          reason: "Payment returned NSF",
          createdAt: "2026-11-10T12:00:00.000Z",
        },
        headerSnapshot: null,
      });

      const retryBtn = screen.getByRole("button", {
        name: /Retry Prior Submission/i,
      });
      await userEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockCalls.post).toHaveBeenCalledTimes(2);
      });

      const secondCallArgs = mockCalls.post.mock.calls[1];
      expect(secondCallArgs[1].idempotencyKey).toBe(frozenKey);
      expect(secondCallArgs[1].reason).toBe(frozenReason);
    });

    it("displays error when payment has already been reversed or detail attribution unavailable", async () => {
      mockCalls.post.mockRejectedValueOnce(
        new MockApiError(409, {
          code: "PAYMENT_DETAIL_ATTRIBUTION_UNAVAILABLE",
          message: "Payment detail attribution is unavailable for this historical payment",
        }),
      );

      renderWithClient(
        <ReverseAdmissionPaymentDialog
          open={true}
          onOpenChange={() => {}}
          admissionId="adm-1"
          payment={samplePaymentItem}
          session={feesAdminUser}
        />,
      );

      const textarea = screen.getByPlaceholderText(/Enter the factual reason/i);
      await userEvent.type(textarea, "Mistake");

      const confirmBtn = screen.getByRole("button", {
        name: /Confirm Reversal/i,
      });
      await userEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Payment detail attribution is unavailable for this historical payment; exact reversal is impossible\./i,
          ),
        ).toBeInTheDocument();
      });
    });
  });
});
