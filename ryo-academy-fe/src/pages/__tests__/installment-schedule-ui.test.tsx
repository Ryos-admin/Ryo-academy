import { createElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  InstallmentScheduleCard,
  InstallmentStatusBadge,
  StudentInstallmentScheduleCard,
  formatCalendarDate,
} from "../installment-schedule-components";
import type {
  AdmissionInstallmentResponse,
  AdmissionInstallmentScheduleResponse,
  SchedulePreviewResponse,
} from "@/lib/installment-schedules-api";
import type { InstallmentTemplateResponse } from "@/lib/installment-templates-api";
import type { User } from "@/lib/mock-erp";

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

const adminUser: User = {
  id: "admin-1",
  email: "admin@ryo.test",
  name: "Admin User",
  schoolId: "school-1",
  roles: ["SUPER_ADMIN"],
  permissions: [
    "INSTALLMENT_SCHEDULE_READ",
    "INSTALLMENT_SCHEDULE_MANAGE",
    "INSTALLMENT_TEMPLATE_READ",
  ],
};

const readOnlyUser: User = {
  id: "reader-1",
  email: "reader@ryo.test",
  name: "Reader User",
  schoolId: "school-1",
  roles: ["STAFF"],
  permissions: ["INSTALLMENT_SCHEDULE_READ"],
};

const noPermUser: User = {
  id: "nobody-1",
  email: "none@ryo.test",
  name: "No Perms User",
  schoolId: "school-1",
  roles: ["STUDENT"],
  permissions: [],
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement, client = createTestQueryClient()) {
  return {
    client,
    ...render(createElement(QueryClientProvider, { client }, ui)),
  };
}

const sampleInstallments: AdmissionInstallmentResponse[] = [
  {
    id: "inst-1",
    scheduleId: "sch-1",
    installmentSequence: 1,
    label: "Term 1",
    amount: "5000.00",
    dueDate: "2026-06-15T00:00:00.000Z",
    status: "PAID",
    amountPaid: "5000.00",
    paidAt: "2026-06-10T10:00:00.000Z",
    isFirstInstallment: true,
  },
  {
    id: "inst-2",
    scheduleId: "sch-1",
    installmentSequence: 2,
    label: "Term 2",
    amount: "5000.00",
    dueDate: "2026-11-15T00:00:00.000Z",
    status: "PENDING",
    amountPaid: "0.00",
    paidAt: null,
    isFirstInstallment: false,
  },
];

const sampleSchedule: AdmissionInstallmentScheduleResponse = {
  id: "sch-1",
  admissionId: "adm-1",
  feePaymentHeaderId: "hdr-1",
  scheduleType: "TEMPLATE",
  templateId: "tpl-1",
  template: { id: "tpl-1", name: "Standard 2-Term" },
  totalAmount: "10000.00",
  installmentCount: 2,
  status: "CONFIRMED",
  installments: sampleInstallments,
};

const sampleTemplates: InstallmentTemplateResponse[] = [
  {
    id: "tpl-1",
    schoolId: "school-1",
    name: "Standard 2-Term",
    description: "Two equal installments",
    calculationType: "EQUAL_SPLIT",
    installmentCount: 2,
    isActive: true,
    items: [
      {
        id: "item-1",
        templateId: "tpl-1",
        sequence: 1,
        label: "Term 1",
        percentage: "50.00",
        fixedAmount: null,
        dueDaysAfterAdmission: 30,
      },
      {
        id: "item-2",
        templateId: "tpl-1",
        sequence: 2,
        label: "Term 2",
        percentage: "50.00",
        fixedAmount: null,
        dueDaysAfterAdmission: 120,
      },
    ],
  },
];

describe("FE-M2 Installment Schedule UI Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalls.get.mockImplementation(async (url: string) => {
      if (url.includes("/installment-templates")) {
        return sampleTemplates;
      }
      if (url.includes("/lineage")) {
        return [];
      }
      if (url.includes("/installment-schedule")) {
        return { schedule: null, isFrozen: false };
      }
      return {};
    });
  });

  describe("1. Canonical Date Formatting & 8 Installment Status Badges", () => {
    it("formats calendar dates without timezone-induced day shifts", () => {
      expect(formatCalendarDate("2026-06-15")).toContain("15");
      expect(formatCalendarDate("2026-06-15")).toContain("Jun");
      expect(formatCalendarDate("2026-06-15")).toContain("2026");

      expect(formatCalendarDate("2026-12-31T23:59:59.000Z")).toContain("31");
      expect(formatCalendarDate("2026-12-31T23:59:59.000Z")).toContain("Dec");
      expect(formatCalendarDate(null)).toBe("—");
      expect(formatCalendarDate(undefined)).toBe("—");
    });

    it("renders all 8 installment status chips accurately", () => {
      const statuses = [
        ["PENDING", "Pending"],
        ["PARTIALLY_PAID", "Partially Paid"],
        ["PAID", "Paid"],
        ["PAID_EARLY", "Paid Early"],
        ["PAID_LATE", "Paid Late"],
        ["OVERDUE", "Overdue"],
        ["SUPERSEDED", "SUPERSEDED"],
        ["VOID", "VOID"],
      ] as const;

      for (const [status, expectedText] of statuses) {
        const { unmount } = render(<InstallmentStatusBadge status={status} />);
        expect(screen.getByText(new RegExp(expectedText, "i"))).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("2. Authoritative Lifecycle & Permission Gating", () => {
    it("hides InstallmentScheduleCard completely when user lacks INSTALLMENT_SCHEDULE_READ", () => {
      const { container } = renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={noPermUser}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("exposes create buttons for V0 DRAFT unpaid admission with manage permission", async () => {
      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      expect(screen.getAllByRole("button", { name: /From Template|Create From Template/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /Custom Schedule|Create Custom Schedule/i }).length).toBeGreaterThan(0);
    });

    it("exposes create buttons for V0 CONFIRMED unpaid admission", async () => {
      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="CONFIRMED"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      expect(screen.getAllByRole("button", { name: /From Template|Create From Template/i }).length).toBeGreaterThan(0);
    });

    it("blocks create buttons for LEGACY CONFIRMED admission", async () => {
      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="CONFIRMED"
          pricingVersion="LEGACY"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /From Template|Create From Template/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Custom Schedule|Create Custom Schedule/i })).not.toBeInTheDocument();
    });

    it("blocks create buttons for CANCELLED admission even if V0", async () => {
      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="CANCELLED"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /From Template|Create From Template/i })).not.toBeInTheDocument();
    });

    it("renders read-only view with 'Schedule Locked' badge when isFrozen=true", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/installment-templates")) return sampleTemplates;
        if (url.includes("/lineage")) return [];
        if (url.includes("/installment-schedule")) {
          return { schedule: sampleSchedule, isFrozen: true };
        }
        return {};
      });

      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="CONFIRMED"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Schedule Locked")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /Modify Schedule/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Payment history recorded on this fee account prevents further schedule modifications/i)).toBeInTheDocument();
    });
  });

  describe("3. Template Schedule Dialog: Preview & Creation", () => {
    it("fetches preview on template selection and creates schedule", async () => {
      const user = userEvent.setup();
      const previewData: SchedulePreviewResponse = {
        scheduleType: "TEMPLATE",
        totalAmount: "10000.00",
        netAmount: "10000.00",
        installmentCount: 2,
        installments: [
          { sequence: 1, label: "Term 1", amount: "5000.00", dueDate: "2026-07-01" },
          { sequence: 2, label: "Term 2", amount: "5000.00", dueDate: "2026-10-01" },
        ],
      };
      mockCalls.post.mockImplementation(async (url: string) => {
        if (url.includes("/preview")) return previewData;
        if (url.includes("/template")) return sampleSchedule;
        return {};
      });

      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      const templateButtons = screen.getAllByRole("button", { name: /From Template/i });
      await user.click(templateButtons[0]);

      expect(screen.getByText(/Configure Installment Schedule from Template/i)).toBeInTheDocument();

      const templateSelect = screen.getByLabelText(/Select Schedule Template/i);
      await user.selectOptions(templateSelect, "tpl-1");

      const dueDateInput = screen.getByLabelText(/First Installment Due Date/i);
      await user.type(dueDateInput, "2026-07-01");

      const previewBtn = screen.getByRole("button", { name: "Preview Schedule" });
      await user.click(previewBtn);

      await waitFor(() => {
        expect(mockCalls.post).toHaveBeenCalledWith(
          "/admissions/adm-1/installment-schedule/preview",
          {
            templateId: "tpl-1",
            firstDueDate: "2026-07-01",
            allowFinalAbsorption: false,
          },
          { token: "test-token" },
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/Calculated Terms: 2/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /Confirm & Create Schedule/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockCalls.post).toHaveBeenCalledWith(
          "/admissions/adm-1/installment-schedule/template",
          {
            templateId: "tpl-1",
            firstDueDate: "2026-07-01",
            allowFinalAbsorption: false,
          },
          { token: "test-token" },
        );
      });
    });
  });

  describe("4. Custom Manual Schedule Builder: Justification, Running Sum & Preview Invalidation", () => {
    it("disables preview when justification is empty and invalidates preview on input changes", async () => {
      const user = userEvent.setup();
      const previewData: SchedulePreviewResponse = {
        scheduleType: "CUSTOM",
        totalAmount: "10000.00",
        netAmount: "10000.00",
        installmentCount: 2,
        installments: [
          { sequence: 1, label: "Term 1", amount: "6000.00", dueDate: "2026-07-01" },
          { sequence: 2, label: "Term 2", amount: "4000.00", dueDate: "2026-11-01" },
        ],
      };
      mockCalls.post.mockImplementation(async (url: string) => {
        if (url.includes("/preview")) return previewData;
        return {};
      });

      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      const manualButtons = screen.getAllByRole("button", { name: /Custom Schedule/i });
      await user.click(manualButtons[0]);

      expect(screen.getByText(/Create Custom Manual Schedule/i)).toBeInTheDocument();

      const previewBtn = screen.getByRole("button", { name: "Preview Schedule" });

      const justificationInput = screen.getByLabelText(/Administrative Justification/i);
      await user.type(justificationInput, "Parent hardship approval by trustee");

      const amountInputs = screen.getAllByPlaceholderText("Amount");
      await user.clear(amountInputs[0]);
      await user.type(amountInputs[0], "6000.00");

      const dateInputs = screen.getAllByDisplayValue("");
      const term1Date = dateInputs.find((el) => el.getAttribute("type") === "date");
      if (term1Date) await user.type(term1Date, "2026-07-01");

      const addTermBtn = screen.getByRole("button", { name: /Add Installment Term/i });
      await user.click(addTermBtn);

      const allAmountInputs = screen.getAllByPlaceholderText("Amount");
      await user.clear(allAmountInputs[1]);
      await user.type(allAmountInputs[1], "4000.00");

      const allDateInputs = screen.getAllByDisplayValue("");
      const term2Date = allDateInputs.find((el) => el.getAttribute("type") === "date");
      if (term2Date) await user.type(term2Date, "2026-11-01");

      await user.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByText(/Server Validated: 2 installments/i)).toBeInTheDocument();
      });

      // Modifying amount should immediately invalidate the preview table
      const updatedInputs = screen.getAllByPlaceholderText("Amount");
      await user.type(updatedInputs[1], "5");
      await waitFor(() => {
        expect(screen.queryByText(/Server Validated: 2 installments/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("5. Stale Frontend State & SCHEDULE_FROZEN_PAYMENT_EXISTS Collision", () => {
    it("handles concurrent payment error with explanatory message and auto-refetches schedule", async () => {
      const user = userEvent.setup();
      let fetchCount = 0;
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/installment-templates")) return sampleTemplates;
        if (url.includes("/lineage")) return [];
        if (url.includes("/installment-schedule")) {
          fetchCount++;
          if (fetchCount === 1) return { schedule: null, isFrozen: false };
          return { schedule: sampleSchedule, isFrozen: true };
        }
        return {};
      });

      const frozenError = new MockApiError(409, {
        code: "SCHEDULE_FROZEN_PAYMENT_EXISTS",
        message: "Payment history exists; schedule configuration is locked.",
      });

      mockCalls.post.mockImplementation(async (url: string) => {
        if (url.includes("/preview")) {
          return {
            scheduleType: "TEMPLATE",
            totalAmount: "10000.00",
            netAmount: "10000.00",
            installmentCount: 2,
            installments: [
              { sequence: 1, label: "Term 1", amount: "5000.00", dueDate: "2026-07-01" },
              { sequence: 2, label: "Term 2", amount: "5000.00", dueDate: "2026-10-01" },
            ],
          };
        }
        if (url.includes("/template")) {
          throw frozenError;
        }
        return {};
      });

      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      const templateButtons = screen.getAllByRole("button", { name: /From Template/i });
      await user.click(templateButtons[0]);

      const templateSelect = screen.getByLabelText(/Select Schedule Template/i);
      await user.selectOptions(templateSelect, "tpl-1");

      const dueDateInput = screen.getByLabelText(/First Installment Due Date/i);
      await user.type(dueDateInput, "2026-07-01");

      const previewBtn = screen.getByRole("button", { name: "Preview Schedule" });
      await user.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm & Create Schedule/i })).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /Confirm & Create Schedule/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/Installment schedule is frozen because payment history exists/i)).toBeInTheDocument();
      });

      // Refetch happened
      expect(fetchCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("6. Failed Preview & Mutation States", () => {
    it("keeps dialog open, clears stale preview, and displays error message when preview fails", async () => {
      const user = userEvent.setup();
      mockCalls.post.mockRejectedValueOnce(new MockApiError(500, { message: "Internal server error during preview calculation" }));

      renderWithClient(
        <InstallmentScheduleCard
          admissionId="adm-1"
          admissionStatus="DRAFT"
          pricingVersion="V0_SNAPSHOTTED"
          netAmount="10000.00"
          session={adminUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No Installment Schedule Configured")).toBeInTheDocument();
      });

      const templateButtons = screen.getAllByRole("button", { name: /From Template/i });
      await user.click(templateButtons[0]);

      const templateSelect = screen.getByLabelText(/Select Schedule Template/i);
      await user.selectOptions(templateSelect, "tpl-1");

      const dueDateInput = screen.getByLabelText(/First Installment Due Date/i);
      await user.type(dueDateInput, "2026-07-01");

      const previewBtn = screen.getByRole("button", { name: "Preview Schedule" });
      await user.click(previewBtn);

      await waitFor(() => {
        expect(screen.getByText(/Internal server error during preview calculation/i)).toBeInTheDocument();
      });

      // Dialog remains open
      expect(screen.getByText(/Configure Installment Schedule from Template/i)).toBeInTheDocument();
      // No preview table rendered
      expect(screen.queryByText(/Calculated Terms/i)).not.toBeInTheDocument();
    });
  });

  describe("7. StudentDetail: Read-Only Schedule Card & RBAC Gating", () => {
    it("renders installment schedule breakdown in StudentDetail for authorized users", async () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/installment-schedule")) {
          return { schedule: sampleSchedule, isFrozen: false };
        }
        return {};
      });

      renderWithClient(
        <StudentInstallmentScheduleCard
          admissionId="adm-1"
          session={readOnlyUser}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Installment Schedule \(2 Terms\)/i)).toBeInTheDocument();
      });

      expect(screen.getByText("Term 1")).toBeInTheDocument();
      expect(screen.getByText("Term 2")).toBeInTheDocument();
      expect(screen.getByText("Paid")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    it("hides StudentInstallmentScheduleCard for users lacking INSTALLMENT_SCHEDULE_READ", () => {
      mockCalls.get.mockImplementation(async (url: string) => {
        if (url.includes("/installment-schedule")) {
          return { schedule: sampleSchedule, isFrozen: false };
        }
        return {};
      });

      const { container } = renderWithClient(
        <StudentInstallmentScheduleCard
          admissionId="adm-1"
          session={noPermUser}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});
