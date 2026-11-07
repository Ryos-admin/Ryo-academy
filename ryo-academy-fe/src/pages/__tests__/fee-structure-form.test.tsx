import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  deactivateMaster: vi.fn(),
  deactivateComponent: vi.fn(),
  navigate: vi.fn(),
  pending: false,
  componentLoading: false,
  componentError: false,
  componentErrorValue: null as unknown,
  structure: null as null | Record<string, unknown>,
  component: null as null | Record<string, unknown>,
  toast: vi.fn(),
}));

vi.mock("@/lib/academic-years-api", () => ({
  academicYearErrorMessage: (_error: unknown, fallback: string) => fallback,
  useAcademicYears: () => ({ data: [{ id: "year-1", name: "2026–27" }, { id: "year-2", name: "2027–28" }], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/programs-api", () => ({
  programErrorMessage: (_error: unknown, fallback: string) => fallback,
  usePrograms: () => ({ data: [{ id: "program-1", name: "Primary", academicYearId: "year-1" }, { id: "program-2", name: "Secondary", academicYearId: "year-2" }], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/classes-api", () => ({
  classErrorMessage: (_error: unknown, fallback: string) => fallback,
  useClasses: () => ({ data: [{ id: "class-1", name: "Class 1", programId: "program-1" }, { id: "class-2", name: "Class 2", programId: "program-2" }], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/fees-api", () => ({
  feeErrorMessage: (error: unknown, fallback: string) => error instanceof ApiError ? (Array.isArray(error.backendMessage) ? error.backendMessage.join(" ") : error.backendMessage) : fallback,
  useCreateFeeStructure: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }),
  useUpdateFeeStructure: () => ({ mutateAsync: mocks.update, isPending: false }),
  useFeeStructure: () => ({ data: mocks.structure, isLoading: false, isError: false }),
  useCreateFeeComponent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeactivateFeeComponent: () => ({ mutateAsync: mocks.deactivateComponent, isPending: false }),
  useDeactivateFeeStructure: () => ({ mutateAsync: mocks.deactivateMaster, isPending: false }),
  useFeeComponent: () => ({ data: mocks.component, isLoading: mocks.componentLoading, isError: mocks.componentError, error: mocks.componentErrorValue }),
  useFeeComponents: () => ({ data: [], isLoading: false, isError: false }),
  useFeeStructures: () => ({ data: [], isLoading: false, isError: false }),
  useUpdateFeeComponent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("wouter", async (importOriginal) => ({ ...(await importOriginal<typeof import("wouter")>()), useLocation: () => ["", mocks.navigate] }));

import { FeeComponentForm, FeeForm, RealFeeComponentDetail, RealFeeDetail } from "@/pages/fee-pages";

const session = { id: "user-1", name: "Admin", email: "admin@example.test", schoolId: "school-1", role: "OFFICE_ADMIN" as const, permissions: ["FEES_CREATE" as const], avatar: "A", title: "Admin" };
const updateSession = { ...session, permissions: ["FEES_UPDATE" as const] };
const lifecycleSession = { ...session, permissions: ["FEES_UPDATE" as const, "FEES_CREATE" as const] };

const activeMaster = {
  id: "master-1", name: "Standard Fees", description: "Annual school fees", totalAmount: "30.00", isActive: true,
  academicYearId: "year-1", programId: "program-1", classId: "class-1",
  academicYear: { id: "year-1", name: "2026–27" }, program: { id: "program-1", name: "Primary" }, class: { id: "class-1", name: "Class 1" }, feeComponents: [],
};

function renderForm() {
  return render(<FeeForm session={session} />);
}

async function fillMaster(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Standard Fees");
  await user.selectOptions(screen.getByLabelText("Academic year"), "year-1");
  await user.selectOptions(screen.getByLabelText("Programme / shift"), "program-1");
  await user.selectOptions(screen.getByLabelText("Class"), "class-1");
  await user.type(screen.getByLabelText("Description"), "Annual school fees");
}

describe("nested fee structure creation form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.pending = false;
    mocks.componentLoading = false;
    mocks.componentError = false;
    mocks.componentErrorValue = null;
    mocks.structure = null;
    mocks.component = null;
    mocks.create.mockResolvedValue({ id: "master-1", totalAmount: "30.00" });
    mocks.update.mockResolvedValue(activeMaster);
    mocks.deactivateMaster.mockResolvedValue(undefined);
    mocks.deactivateComponent.mockResolvedValue(undefined);
  });

  it("starts with one component, filters dependent selectors, and clears downstream selections", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getAllByLabelText("Component name")).toHaveLength(1);
    expect(screen.queryByRole("option", { name: "Secondary" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Academic year"), "year-1");
    expect(screen.getByRole("option", { name: "Primary" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Secondary" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Programme / shift"), "program-1");
    expect(screen.queryByRole("option", { name: "Class 2" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Class"), "class-1");
    await user.selectOptions(screen.getByLabelText("Academic year"), "year-2");
    expect(screen.getByLabelText("Programme / shift")).toHaveValue("");
    expect(screen.getByLabelText("Class")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Secondary" })).toBeInTheDocument();
    expect(screen.getByLabelText("Programme / shift")).toBeEnabled();
    expect(screen.getByLabelText("Class")).toBeDisabled();
  });

  it("adds/removes component rows, previews exact totals, and sends the nested decimal-string contract", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillMaster(user);
    await user.type(screen.getByLabelText("Component name"), "Tuition");
    await user.type(screen.getByLabelText("Amount (INR)"), "10.10");
    await user.click(screen.getByRole("button", { name: /add component/i }));
    const names = screen.getAllByLabelText("Component name");
    const amounts = screen.getAllByLabelText("Amount (INR)");
    await user.type(names[1], "tuition ");
    await user.type(amounts[1], "19.90");
    await user.click(screen.getAllByLabelText("Mandatory")[1]);
    await user.click(screen.getAllByLabelText("Discount applicable")[0]);
    expect(screen.getByRole("status")).toHaveTextContent("Preview total: ₹30.00");
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Standard Fees",
      description: "Annual school fees",
      academicYearId: "year-1",
      programId: "program-1",
      classId: "class-1",
      feeComponents: [
        { name: "Tuition", amount: "10.10", isMandatory: true, discountApplicable: true },
        { name: "tuition ", amount: "19.90", isMandatory: false, discountApplicable: false },
      ],
    });
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("totalAmount");
    expect(typeof mocks.create.mock.calls[0][0].feeComponents[0].amount).toBe("string");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Backend total: ₹30.00." }));
  });

  it("renders table grid with headers, component descriptions, and live mandatory/optional subtotals", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillMaster(user);

    expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Component Name & Description" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount (INR)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mandatory" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Discount applicable" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Component name"), "Tuition Fee");
    await user.type(screen.getByLabelText("Component description"), "Annual instruction charges");
    await user.type(screen.getByLabelText("Amount (INR)"), "12000.00");

    await user.click(screen.getByRole("button", { name: /add component/i }));
    const names = screen.getAllByLabelText("Component name");
    const descriptions = screen.getAllByLabelText("Component description");
    const amounts = screen.getAllByLabelText("Amount (INR)");
    const mandatoryBoxes = screen.getAllByLabelText("Mandatory");

    await user.type(names[1], "Bus Transport");
    await user.type(descriptions[1], "Optional route pickup");
    await user.type(amounts[1], "3000.00");
    await user.click(mandatoryBoxes[1]);

    expect(screen.getByText("Mandatory:")).toBeInTheDocument();
    expect(screen.getByText("₹12,000.00")).toBeInTheDocument();
    expect(screen.getByText("Optional:")).toBeInTheDocument();
    expect(screen.getByText("₹3,000.00")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Preview total: ₹15,000.00");

    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        feeComponents: [
          {
            name: "Tuition Fee",
            description: "Annual instruction charges",
            amount: "12000.00",
            isMandatory: true,
            discountApplicable: false,
          },
          {
            name: "Bus Transport",
            description: "Optional route pickup",
            amount: "3000.00",
            isMandatory: false,
            discountApplicable: false,
          },
        ],
      }),
    );
  });

  it("rejects exact duplicate names while allowing case and whitespace variants", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillMaster(user);
    const names = screen.getAllByLabelText("Component name");
    await user.type(names[0], "Tuition");
    await user.type(screen.getByLabelText("Amount (INR)"), "10");
    await user.click(screen.getByRole("button", { name: /add component/i }));
    await user.type(screen.getAllByLabelText("Component name")[1], "Tuition");
    await user.type(screen.getAllByLabelText("Amount (INR)")[1], "20");
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(await screen.findByText("Component names must be unique within this fee structure.")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hides preview and blocks blank, malformed, over-precision, and zero amounts", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillMaster(user);
    await user.type(screen.getByLabelText("Component name"), "Tuition");
    const amount = screen.getByLabelText("Amount (INR)");
    await user.type(amount, "10.00");
    expect(screen.getByRole("status")).toHaveTextContent("₹10.00");
    await user.clear(amount);
    await user.type(amount, "10.001");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(await screen.findByText("Enter an amount greater than zero with at most two decimal places.")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, "abc");
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(mocks.create).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, "-1");
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(mocks.create).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, "0.00");
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires master fields and nonblank component names", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Choose an academic year")).toBeInTheDocument();
    expect(screen.getByText("Choose a programme")).toBeInTheDocument();
    expect(screen.getByText("Choose a class")).toBeInTheDocument();
    expect(screen.getByText("Component name is required.")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the last-row removal invalid and prevents creation without a component", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillMaster(user);
    await user.click(screen.getByRole("button", { name: /add component/i }));
    expect(screen.getAllByLabelText("Component name")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: /remove component/i })[1]);
    expect(screen.getAllByLabelText("Component name")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /remove component/i }));
    expect(await screen.findByText("Add at least one fee component.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("prevents repeat submission while pending and surfaces backend validation messages", async () => {
    mocks.pending = true;
    const { rerender } = renderForm();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    mocks.pending = false;
    rerender(<FeeForm session={session} />);
    const user = userEvent.setup();
    await fillMaster(user);
    await user.type(screen.getByLabelText("Component name"), "Tuition");
    await user.type(screen.getByLabelText("Amount (INR)"), "10.00");
    mocks.create.mockRejectedValueOnce(new ApiError(409, { message: "A fee structure already exists for the selected scope." }));
    await user.click(screen.getByRole("button", { name: /create fee structure/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "A fee structure already exists for the selected scope." })));
  });

  it("edits only name and description while showing master scope read-only", async () => {
    const user = userEvent.setup();
    mocks.structure = activeMaster;
    render(<FeeForm id="master-1" session={updateSession} />);
    const name = await screen.findByLabelText("Name");
    const description = screen.getByLabelText("Description");
    expect(name).toHaveValue("Standard Fees");
    expect(description).toHaveValue("Annual school fees");
    expect(screen.getByText("2026–27")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Class 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Academic year")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Programme / shift")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/total amount/i)).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "Updated Standard");
    await user.clear(description);
    await user.type(description, "Updated annual fees");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith({ id: "master-1", payload: { name: "Updated Standard", description: "Updated annual fees" } });
    expect(mocks.update.mock.calls[0][0].payload).not.toHaveProperty("academicYearId");
    expect(mocks.update.mock.calls[0][0].payload).not.toHaveProperty("programId");
    expect(mocks.update.mock.calls[0][0].payload).not.toHaveProperty("classId");
    expect(mocks.update.mock.calls[0][0].payload).not.toHaveProperty("totalAmount");
  });

  it("shows an inactive master state and prevents editing", async () => {
    mocks.structure = { ...activeMaster, isActive: false };
    render(<FeeForm id="master-1" session={updateSession} />);
    expect(await screen.findByText("Inactive fee structure")).toBeInTheDocument();
    expect(screen.getByText("This fee structure is inactive and cannot be edited.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("shows backend academic-year and conflict errors after update rejection", async () => {
    const user = userEvent.setup();
    mocks.structure = activeMaster;
    render(<FeeForm id="master-1" session={updateSession} />);
    const description = await screen.findByLabelText("Description");
    mocks.update.mockRejectedValueOnce(new ApiError(409, { message: "Fee structure metadata is frozen on or after the academic-year start date." }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Fee structure metadata is frozen on or after the academic-year start date." })));
    expect(description).toHaveValue("Annual school fees");
  });

  it("gates active master actions by permission and confirms before deactivation", async () => {
    mocks.structure = { ...activeMaster, feeComponents: [
      { id: "component-1", name: "Tuition", amount: "10.00", isActive: true, isMandatory: true, discountApplicable: false },
      { id: "component-2", name: "Transport", amount: "5.00", isActive: false, isMandatory: false, discountApplicable: false },
    ] };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender } = render(<RealFeeDetail id="master-1" session={session} />);
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    rerender(<RealFeeDetail id="master-1" session={lifecycleSession} />);
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
    expect(screen.getByText("Tuition").parentElement).toHaveTextContent("Active");
    expect(screen.getByText("Transport").parentElement).toHaveTextContent("Inactive");
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Historical fee references will be retained"));
    expect(mocks.deactivateMaster).not.toHaveBeenCalled();
  });

  it("hides inactive master edit/add/deactivate actions and preserves the status", () => {
    mocks.structure = { ...activeMaster, isActive: false };
    render(<RealFeeDetail id="master-1" session={lifecycleSession} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit fee structure/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /add fee component/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("deactivates an active master and navigates only after success", async () => {
    mocks.structure = activeMaster;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RealFeeDetail id="master-1" session={updateSession} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(mocks.deactivateMaster).toHaveBeenCalledWith("master-1"));
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Fee structure deactivated" });
    expect(mocks.navigate).toHaveBeenCalledWith("/fees");
  });

  it("shows a readable master deactivation conflict without navigating", async () => {
    mocks.structure = activeMaster;
    mocks.deactivateMaster.mockRejectedValueOnce(new ApiError(409, { message: "Fee master has historical references." }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RealFeeDetail id="master-1" session={updateSession} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Could not deactivate fee structure", description: "Fee master has historical references." }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith({ title: "Fee structure deactivated" });
  });

  it("shows component state and gates inactive component actions", () => {
    mocks.component = { id: "component-1", name: "Tuition", amount: "10.00", isActive: false, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    mocks.structure = activeMaster;
    render(<RealFeeComponentDetail id="component-1" session={lifecycleSession} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit fee component/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it("confirms active component deactivation and returns to its parent master", async () => {
    mocks.component = { id: "component-1", name: "Tuition", amount: "10.00", isActive: true, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    mocks.structure = activeMaster;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { rerender } = render(<RealFeeComponentDetail id="component-1" session={session} />);
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit fee component/i })).not.toBeInTheDocument();
    rerender(<RealFeeComponentDetail id="component-1" session={updateSession} />);
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Historical fee references will be retained"));
    await waitFor(() => expect(mocks.deactivateComponent).toHaveBeenCalledWith("component-1"));
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Fee component deactivated" });
    expect(mocks.navigate).toHaveBeenCalledWith("/fees/master-1");
  });

  it("does not invoke component deactivation when confirmation is cancelled", async () => {
    mocks.component = { id: "component-1", name: "Tuition", amount: "10.00", isActive: true, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    mocks.structure = activeMaster;
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RealFeeComponentDetail id="component-1" session={updateSession} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    expect(mocks.deactivateComponent).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows a readable component conflict without navigating", async () => {
    mocks.component = { id: "component-1", name: "Tuition", amount: "10.00", isActive: true, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    mocks.structure = activeMaster;
    mocks.deactivateComponent.mockRejectedValueOnce(new ApiError(409, { message: "Component is referenced by an admission snapshot." }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RealFeeComponentDetail id="component-1" session={updateSession} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Could not deactivate fee component", description: "Component is referenced by an admission snapshot." }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith({ title: "Fee component deactivated" });
  });

  it("blocks direct editing of an inactive component and links to its master", () => {
    mocks.component = { id: "component-1", name: "Tuition", amount: "10.00", isActive: false, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    render(<FeeComponentForm id="component-1" session={updateSession} />);
    expect(screen.getByText("Inactive fee component")).toBeInTheDocument();
    expect(screen.getByText("This fee component is inactive and cannot be edited.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View fee structure" })).toHaveAttribute("href", "/fees/master-1");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
  });

  it("keeps the active component edit form available", async () => {
    mocks.component = { id: "component-1", name: "Tuition", description: "Annual tuition", amount: "10.00", isActive: true, isMandatory: true, discountApplicable: false, feeStructureId: "master-1" };
    render(<FeeComponentForm id="component-1" session={updateSession} />);
    expect(await screen.findByLabelText("Name")).toHaveValue("Tuition");
    expect(screen.getByLabelText("Amount (INR)")).toHaveValue("10.00");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("preserves component edit permission, loading, and error states", () => {
    mocks.component = { ...activeMaster, isActive: false };
    const denied = render(<FeeComponentForm id="component-1" session={session} />);
    expect(screen.getByText("That view is outside your role")).toBeInTheDocument();
    denied.unmount();

    mocks.componentLoading = true;
    const loading = render(<FeeComponentForm id="component-1" session={updateSession} />);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
    loading.unmount();

    mocks.componentLoading = false;
    mocks.componentError = true;
    mocks.componentErrorValue = new ApiError(409, { message: "Component lookup conflict." });
    render(<FeeComponentForm id="component-1" session={updateSession} />);
    expect(screen.getByText("Could not load fee component")).toBeInTheDocument();
    expect(screen.getByText("Component lookup conflict.")).toBeInTheDocument();
  });
});
