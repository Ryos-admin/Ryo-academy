import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Profile } from "@/pages/operations-pages";
import { type User } from "@/lib/mock-erp";
import * as schoolsApiModule from "@/lib/schools-api";
import * as academicYearsApiModule from "@/lib/academic-years-api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shell } from "@/pages/app-pages";

// Mock wouter location
vi.mock("wouter", () => ({
  Link: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ["/profile", vi.fn()],
  useParams: () => ({}),
  Route: ({ children }: any) => <>{children}</>,
  Switch: ({ children }: any) => <>{children}</>,
}));

const mockAcademicYears = [
  {
    id: "ay-1",
    name: "AY 2026–27",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2027-05-31T00:00:00.000Z",
    isActive: true,
    schoolId: "school-1",
  },
  {
    id: "ay-2",
    name: "AY 2027–28",
    startDate: "2027-06-01T00:00:00.000Z",
    endDate: "2028-05-31T00:00:00.000Z",
    isActive: true,
    schoolId: "school-1",
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
  name: "Office Staff",
  email: "office@ryo.test",
  schoolId: "school-1",
  role: "OFFICE_ADMIN",
  permissions: ["FEES_READ"],
  avatar: "OS",
  title: "Accounts Officer",
};

const staffUser: User = {
  id: "user-staff",
  name: "Teacher Alice",
  email: "alice@ryo.test",
  schoolId: "school-1",
  role: "STAFF",
  permissions: ["STUDENT_READ"],
  avatar: "TA",
  title: "Senior Lecturer",
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

describe("Profile Academic Year Configuration UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(academicYearsApiModule, "useAcademicYears").mockReturnValue({
      data: mockAcademicYears,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
  });

  describe("Permissions & Visibility", () => {
    it("renders school configuration panel for College Admin with SCHOOL_UPDATE", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      expect(screen.getByTestId("school-config-panel")).toBeInTheDocument();
      expect(screen.getByTestId("academic-year-select")).toBeInTheDocument();
      expect(screen.getByTestId("save-configuration-button")).toBeInTheDocument();
    });

    it("does NOT render actionable configuration panel for Office Admin lacking SCHOOL_UPDATE", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(<Profile session={officeAdminUser} />);

      expect(screen.queryByTestId("school-config-panel")).not.toBeInTheDocument();
      expect(screen.queryByTestId("academic-year-select")).not.toBeInTheDocument();
      expect(screen.queryByTestId("save-configuration-button")).not.toBeInTheDocument();
      // But read-only profile detail is shown
      expect(screen.getByText("AY 2026–27")).toBeInTheDocument();
    });

    it("does NOT render actionable configuration panel for Staff lacking SCHOOL_UPDATE", () => {
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

      renderWithClient(<Profile session={staffUser} />);

      expect(screen.queryByTestId("school-config-panel")).not.toBeInTheDocument();
      expect(screen.getByText("Not Configured")).toBeInTheDocument();
    });
  });

  describe("Configuration States", () => {
    it("renders loading state in configuration panel", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      expect(screen.getByTestId("school-config-panel")).toBeInTheDocument();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("renders error state when configuration API fails", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      expect(screen.getByTestId("config-error-state")).toBeInTheDocument();
      expect(
        screen.getByText("Failed to load school configuration. Please refresh."),
      ).toBeInTheDocument();
    });

    it("renders unconfigured state with empty initial selection and disabled save button", () => {
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

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      const select = screen.getByTestId("academic-year-select") as HTMLSelectElement;
      expect(select.value).toBe("");
      // Save button disabled because no year is selected
      const saveBtn = screen.getByTestId("save-configuration-button");
      expect(saveBtn).toBeDisabled();
    });

    it("renders pre-selected academic year for valid configured state", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      const select = screen.getByTestId("academic-year-select") as HTMLSelectElement;
      expect(select.value).toBe("ay-1");
      const saveBtn = screen.getByTestId("save-configuration-button");
      expect(saveBtn).not.toBeDisabled();
    });

    it("renders alert banner for invalid configuration (soft-deleted or inactive)", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-deleted",
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: true,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      expect(screen.getByTestId("config-invalid-alert")).toBeInTheDocument();
      expect(
        screen.getByText(
          "The configured academic year is inactive or soft-deleted. Please select a valid academic year.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Form Submission & Mutation", () => {
    it("submits selected academic year and shows success feedback", async () => {
      const user = userEvent.setup();
      const mutateMock = vi.fn((_data, { onSuccess }: any) => {
        onSuccess();
      });

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

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: mutateMock,
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      const select = screen.getByTestId("academic-year-select");
      await user.selectOptions(select, "ay-2");

      const saveBtn = screen.getByTestId("save-configuration-button");
      expect(saveBtn).not.toBeDisabled();
      await user.click(saveBtn);

      expect(mutateMock).toHaveBeenCalledWith(
        { activeAcademicYearId: "ay-2" },
        expect.any(Object),
      );

      expect(screen.getByTestId("config-save-success")).toBeInTheDocument();
      expect(
        screen.getByText("Academic year configuration updated successfully."),
      ).toBeInTheDocument();
    });

    it("displays error message on failed mutation", async () => {
      const user = userEvent.setup();
      const mutateMock = vi.fn((_data, { onError }: any) => {
        onError(new Error("Academic year does not belong to this school"));
      });

      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: mutateMock,
        isPending: false,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      const saveBtn = screen.getByTestId("save-configuration-button");
      await user.click(saveBtn);

      expect(screen.getByTestId("config-save-error")).toBeInTheDocument();
      expect(
        screen.getByText("Academic year does not belong to this school"),
      ).toBeInTheDocument();
    });

    it("disables submit button and shows 'Saving...' while mutation isPending", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      vi.spyOn(schoolsApiModule, "useUpdateSchoolConfiguration").mockReturnValue({
        mutate: vi.fn(),
        isPending: true,
      } as any);

      renderWithClient(<Profile session={collegeAdminUser} />);

      const saveBtn = screen.getByTestId("save-configuration-button");
      expect(saveBtn).toBeDisabled();
      expect(saveBtn).toHaveTextContent("Saving...");
    });
  });

  describe("Sidebar Workspace Chip Integration", () => {
    it("renders loading state in sidebar workspace chip", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as any);

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const chip = screen.getByTestId("sidebar-workspace-chip");
      expect(chip).toHaveTextContent("Loading AY...");
    });

    it("renders 'AY Unavailable' in sidebar workspace chip when query errors", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as any);

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const chip = screen.getByTestId("sidebar-workspace-chip");
      expect(chip).toHaveTextContent("AY Unavailable");
    });

    it("renders 'Invalid AY' in sidebar workspace chip when isInvalid is true", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-deleted",
          activeAcademicYear: null,
          isConfigured: false,
          isInvalid: true,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const chip = screen.getByTestId("sidebar-workspace-chip");
      expect(chip).toHaveTextContent("Invalid AY");
    });

    it("renders configured academic year name in sidebar workspace chip", () => {
      vi.spyOn(schoolsApiModule, "useSchoolConfiguration").mockReturnValue({
        data: {
          schoolId: "school-1",
          schoolName: "Ryo Academy",
          schoolCode: "RYO",
          activeAcademicYearId: "ay-1",
          activeAcademicYear: mockAcademicYears[0],
          isConfigured: true,
          isInvalid: false,
        },
        isLoading: false,
        isError: false,
      } as any);

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const chip = screen.getByTestId("sidebar-workspace-chip");
      expect(chip).toHaveTextContent("AY 2026–27");
    });

    it("renders 'No AY Selected' in sidebar workspace chip when unconfigured", () => {
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

      renderWithClient(
        <Shell session={collegeAdminUser} onLogout={vi.fn()}>
          <div>Content</div>
        </Shell>,
      );

      const chip = screen.getByTestId("sidebar-workspace-chip");
      expect(chip).toHaveTextContent("No AY Selected");
    });
  });

  describe("Shared Hook & Cache Invalidation", () => {
    it("invalidates ['schools', 'configuration'] and ['fee-management', 'dashboard'] on successful update", async () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");
      vi.spyOn(schoolsApiModule.schoolsApi, "updateConfiguration").mockResolvedValue({
        schoolId: "school-1",
        schoolName: "Ryo Academy",
        schoolCode: "RYO",
        activeAcademicYearId: "ay-2",
        activeAcademicYear: mockAcademicYears[1],
        isConfigured: true,
        isInvalid: false,
      });

      const TestComponent = () => {
        const updateMutation = schoolsApiModule.useUpdateSchoolConfiguration();
        return (
          <button
            data-testid="hook-update-btn"
            onClick={() => updateMutation.mutate({ activeAcademicYearId: "ay-2" })}
          >
            Update
          </button>
        );
      };

      renderWithClient(<TestComponent />, client);
      screen.getByTestId("hook-update-btn").click();

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: schoolsApiModule.schoolConfigQueryKey,
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: ["fee-management", "dashboard"],
        });
      });
    });
  });
});
