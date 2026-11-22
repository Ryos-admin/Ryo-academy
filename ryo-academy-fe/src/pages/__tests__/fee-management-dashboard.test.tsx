import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeeManagementDashboardPage } from "@/pages/fee-dashboard-pages";
import { type User } from "@/lib/mock-erp";
import * as schoolsApiModule from "@/lib/schools-api";
import * as feeDashboardApiModule from "@/lib/fee-dashboard-api";
import * as programsApiModule from "@/lib/programs-api";
import * as classesApiModule from "@/lib/classes-api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shell } from "@/pages/app-pages";

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  Link: ({ children, href, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e) => {
        if (onClick) onClick(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ["/fee-management", mockSetLocation],
  useParams: () => ({}),
  Route: ({ children }: any) => <>{children}</>,
  Switch: ({ children }: any) => <>{children}</>,
}));

const mockSchoolConfig = {
  schoolId: "school-1",
  schoolName: "Ryo Academy",
  schoolCode: "RYO",
  activeAcademicYearId: "ay-1",
  activeAcademicYear: {
    id: "ay-1",
    name: "AY 2026–27",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2027-05-31T00:00:00.000Z",
    isActive: true,
  },
  isConfigured: true,
  isInvalid: false,
};

const mockPrograms = [
  { id: "prog-1", name: "High School" },
  { id: "prog-2", name: "Middle School" },
];

const mockClasses = [
  { id: "cls-1", name: "Class 10" },
  { id: "cls-2", name: "Class 9" },
];

const mockAdmissions: feeDashboardApiModule.FeeDashboardItem[] = [
  {
    id: "adm-1",
    admissionNumber: "ADM-2026-001",
    admissionSequence: 1,
    admissionStatus: "CONFIRMED",
    studentName: "Alice Walker",
    program: { id: "prog-1", name: "High School" },
    class: { id: "cls-1", name: "Class 10" },
    section: { id: "sec-1", name: "A" },
    student: { id: "st-1", studentNumber: "STU-001", studentName: "Alice Walker" },
    confirmedAt: "2026-06-05T10:00:00.000Z",
    createdAt: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "adm-2",
    admissionNumber: "ADM-2026-002",
    admissionSequence: 2,
    admissionStatus: "CONFIRMED",
    studentName: "Bob Smith",
    program: { id: "prog-2", name: "Middle School" },
    class: { id: "cls-2", name: "Class 9" },
    section: { id: "sec-2", name: "B" },
    student: { id: "st-2", studentNumber: "STU-002", studentName: "Bob Smith" },
    confirmedAt: "2026-06-06T11:00:00.000Z",
    createdAt: "2026-06-02T11:00:00.000Z",
  },
];

const collegeAdminUser: User = {
  id: "user-admin",
  name: "Dr. Admin",
  email: "admin@ryo.test",
  schoolId: "school-1",
  role: "COLLEGE_ADMIN",
  permissions: ["SCHOOL_UPDATE", "FEES_READ"],
  avatar: "DA",
  title: "Principal & Administrator",
};

const officeAdminUser: User = {
  id: "user-office",
  name: "Office User",
  email: "office@ryo.test",
  schoolId: "school-1",
  role: "OFFICE_ADMIN",
  permissions: ["FEES_READ"],
  avatar: "OU",
  title: "Fee Collector",
};

function renderWithClient(ui: React.ReactElement, client?: QueryClient) {
  const queryClient =
    client ||
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}

describe("FeeManagementDashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetLocation.mockClear();

    vi.spyOn(programsApiModule, "usePrograms").mockReturnValue({
      data: mockPrograms,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(classesApiModule, "useClasses").mockReturnValue({
      data: mockClasses,
      isLoading: false,
      isError: false,
    } as any);
  });

  describe("Configuration State Handling", () => {
    it("renders loading state while school configuration is loading", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("Loading school configuration...")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-search-input")).not.toBeInTheDocument();
    });

    it("renders error state when school configuration request fails", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as any);

      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("Unable to load configuration")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-search-input")).not.toBeInTheDocument();
    });

    it("renders unconfigured state with CTA link to /profile for College Admin", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: null,
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("No Academic Year Configured")).toBeInTheDocument();
      const cta = screen.getByTestId("link-configure-profile");
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute("href", "/profile");
    });

    it("renders unconfigured state without CTA link for user lacking SCHOOL_UPDATE", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: null,
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={officeAdminUser} />);

      expect(screen.getByText("No Academic Year Configured")).toBeInTheDocument();
      expect(screen.queryByTestId("link-configure-profile")).not.toBeInTheDocument();
    });

    it("renders invalid configuration alert and empty state when academic year is inactive/soft-deleted", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-del",
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: true,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByTestId("dashboard-invalid-alert")).toBeInTheDocument();
      expect(screen.getByText(/The configured academic year is inactive or has been deleted/)).toBeInTheDocument();
      expect(screen.getByTestId("link-reconfigure-profile")).toHaveAttribute("href", "/profile");
      expect(screen.getByText("Invalid Academic Year Configuration")).toBeInTheDocument();
    });
  });

  describe("Dashboard Query States & Admissions Listing", () => {
    beforeEach(() => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: mockSchoolConfig,
        isLoading: false,
        isError: false,
      } as any);
    });

    it("renders loading state when dashboard query is loading", () => {
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("Loading confirmed admissions...")).toBeInTheDocument();
      expect(screen.getByTestId("active-ay-badge")).toHaveTextContent("AY 2026–27");
    });

    it("renders error state when dashboard query fails", () => {
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("Could not load admissions")).toBeInTheDocument();
    });

    it("renders empty state when there are zero confirmed admissions", () => {
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 0,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("No confirmed admissions found")).toBeInTheDocument();
      expect(screen.getByText(/There are no confirmed admissions recorded for AY 2026–27/)).toBeInTheDocument();
    });

    it("renders populated table of confirmed admissions with correct fields and status badges", () => {
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: mockAdmissions,
          page: 1,
          pageSize: 25,
          total: 2,
          totalPages: 1,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      const tableCard = screen.getByTestId("dashboard-table-card");
      expect(tableCard).toBeInTheDocument();
      expect(within(tableCard).getByText("ADM-2026-001")).toBeInTheDocument();
      expect(within(tableCard).getByText("Alice Walker")).toBeInTheDocument();
      expect(within(tableCard).getByText("High School")).toBeInTheDocument();
      expect(within(tableCard).getByText("Class 10 · A")).toBeInTheDocument();

      expect(within(tableCard).getByText("ADM-2026-002")).toBeInTheDocument();
      expect(within(tableCard).getByText("Bob Smith")).toBeInTheDocument();
      expect(within(tableCard).getByText("Middle School")).toBeInTheDocument();
      expect(within(tableCard).getByText("Class 9 · B")).toBeInTheDocument();

      // Confirmed status badges
      const confirmedBadges = within(tableCard).getAllByTestId("status-confirmed");
      expect(confirmedBadges.length).toBe(2);

      // Verify no fabricated financial metrics or balance numbers
      expect(screen.queryByText(/Total Outstanding/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Collection Progress/i)).not.toBeInTheDocument();
    });

    it("navigates to /admissions/:id when row or admission link is clicked", async () => {
      const user = userEvent.setup();
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: [mockAdmissions[0]],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      const link = screen.getByTestId("admission-link-adm-1");
      expect(link).toHaveAttribute("href", "/admissions/adm-1");

      const row = screen.getByTestId("admission-row-adm-1");
      await user.click(row);
      expect(mockSetLocation).toHaveBeenCalledWith("/admissions/adm-1");
    });
  });

  describe("Filtering, Search & Debounce", () => {
    beforeEach(() => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: mockSchoolConfig,
        isLoading: false,
        isError: false,
      } as any);
    });

    it("passes search, programId, and classId to query hook", async () => {
      const useFeeDashboardSpy = vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 0,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      const searchInput = screen.getByTestId("dashboard-search-input");
      fireEvent.change(searchInput, { target: { value: "Alice" } });

      const programSelect = screen.getByTestId("dashboard-program-filter");
      fireEvent.change(programSelect, { target: { value: "prog-1" } });

      const classSelect = screen.getByTestId("dashboard-class-filter");
      fireEvent.change(classSelect, { target: { value: "cls-1" } });

      // After debounce
      await waitFor(() => {
        expect(useFeeDashboardSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            search: "Alice",
            programId: "prog-1",
            classId: "cls-1",
            page: 1,
          }),
          true,
        );
      });
    });

    it("clears all active filters when Clear button is clicked", async () => {
      const user = userEvent.setup();
      vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 0,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      const searchInput = screen.getByTestId("dashboard-search-input");
      fireEvent.change(searchInput, { target: { value: "test" } });

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-clear-filters")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("dashboard-clear-filters"));

      expect((searchInput as HTMLInputElement).value).toBe("");
      expect(screen.queryByTestId("dashboard-clear-filters")).not.toBeInTheDocument();
    });
  });

  describe("Pagination Controls", () => {
    beforeEach(() => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: mockSchoolConfig,
        isLoading: false,
        isError: false,
      } as any);
    });

    it("renders pagination indicators and handles page traversal", async () => {
      const user = userEvent.setup();
      const useFeeDashboardSpy = vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: mockAdmissions,
          page: 1,
          pageSize: 25,
          total: 60,
          totalPages: 3,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(screen.getByText("Showing 1 to 25 of 60 admissions")).toBeInTheDocument();
      expect(screen.getByTestId("pagination-page-indicator")).toHaveTextContent("Page 1 of 3");

      const prevBtn = screen.getByTestId("pagination-prev");
      const nextBtn = screen.getByTestId("pagination-next");

      // On page 1, previous is disabled
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      // Click Next
      await user.click(nextBtn);

      await waitFor(() => {
        expect(useFeeDashboardSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 }),
          true,
        );
      });
    });

    it("resets page to 1 when search or filter changes", async () => {
      const user = userEvent.setup();
      const useFeeDashboardSpy = vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: {
          configured: true,
          invalidConfiguration: false,
          activeAcademicYear: mockSchoolConfig.activeAcademicYear,
          data: mockAdmissions,
          page: 1,
          pageSize: 25,
          total: 60,
          totalPages: 3,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      const nextBtn = screen.getByTestId("pagination-next");
      await user.click(nextBtn);

      await waitFor(() => {
        expect(useFeeDashboardSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 }),
          true,
        );
      });

      // Now change search input
      const searchInput = screen.getByTestId("dashboard-search-input");
      fireEvent.change(searchInput, { target: { value: "New Search" } });

      await waitFor(() => {
        expect(useFeeDashboardSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 1, search: "New Search" }),
          true,
        );
      });
    });

    it("disables dashboard query when school is unconfigured or invalid, preventing stale data requests", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: null,
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      const useFeeDashboardSpy = vi.spyOn(feeDashboardApiModule, "useFeeDashboard").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<FeeManagementDashboardPage session={collegeAdminUser} />);

      expect(useFeeDashboardSpy).toHaveBeenCalledWith(
        expect.anything(),
        false, // enabled must be false!
      );
    });
  });

  describe("Sidebar Nav Integration", () => {
    it("renders Fee Management sidebar link for users with FEES_READ", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: mockSchoolConfig,
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const feeMgmtLink = screen.getByRole("link", { name: /Fee Management/i });
      expect(feeMgmtLink).toBeInTheDocument();
      expect(feeMgmtLink).toHaveAttribute("href", "/fee-management");

      // Preserves existing Fees link
      const feesLink = screen.getByRole("link", { name: /^Fees$/i });
      expect(feesLink).toBeInTheDocument();
      expect(feesLink).toHaveAttribute("href", "/fees");
    });
  });
});
