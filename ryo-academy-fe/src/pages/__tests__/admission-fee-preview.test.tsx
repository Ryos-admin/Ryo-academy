import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicableFeeConfiguration } from "@/lib/admissions-api";
import type { AdmissionFeeConfiguration } from "@/lib/concessions-api";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  preview: null as any,
  previewQuery: vi.fn(),
  admission: null as any,
  feeConfiguration: null as any,
  concessions: null as any,
  feeConfigurationState: {} as any,
  concessionsState: {} as any,
  updateFeeSelection: vi.fn(),
  assignConcession: vi.fn(),
  updateConcession: vi.fn(),
  removeConcession: vi.fn(),
}));

vi.mock("@/lib/admissions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admissions-api")>();
  return {
    ...actual,
    useAdmission: () => ({ data: mocks.admission, isLoading: false, isError: false }),
    useAdmissionWorkflow: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useApplicableFeeConfiguration: (query: unknown) => { mocks.previewQuery(query); return mocks.preview; },
    useSaveAdmission: () => ({ mutateAsync: mocks.save, isPending: false }),
  };
});
vi.mock("@/lib/concessions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/concessions-api")>();
  return {
    ...actual,
    useAdmissionConcessions: () => ({ data: mocks.concessions, isLoading: false, isFetching: false, isError: false, error: null, ...mocks.concessionsState }),
    useAdmissionFeeConfiguration: () => ({ data: mocks.feeConfiguration, isLoading: false, isFetching: false, isError: false, error: null, ...mocks.feeConfigurationState }),
    useUpdateAdmissionFeeConfiguration: () => ({ mutateAsync: mocks.updateFeeSelection, isPending: false }),
    useAssignAdmissionConcession: () => ({ mutateAsync: mocks.assignConcession, isPending: false }),
    useUpdateAdmissionConcession: () => ({ mutateAsync: mocks.updateConcession, isPending: false }),
    useRemoveAdmissionConcession: () => ({ mutateAsync: mocks.removeConcession, isPending: false }),
  };
});
vi.mock("@/lib/academic-years-api", () => ({
  useAcademicYears: () => ({ data: [
    { id: "year-1", name: "2026–27", schoolId: "school-1" },
    { id: "year-2", name: "2027–28", schoolId: "school-1" },
  ] }),
}));
vi.mock("@/lib/programs-api", () => ({ usePrograms: () => ({ data: [
  { id: "program-1", name: "Primary", academicYearId: "year-1" },
  { id: "program-2", name: "Secondary", academicYearId: "year-2" },
] }) }));
vi.mock("@/lib/classes-api", () => ({ useClasses: () => ({ data: [
  { id: "class-1", name: "Class 1", programId: "program-1" },
  { id: "class-2", name: "Class 2", programId: "program-2" },
] }) }));
vi.mock("@/lib/sections-api", () => ({ useSectionsByClass: (classId: string) => ({ data: classId ? [
  { id: classId === "class-1" ? "section-1" : "section-2", name: "Section A" },
] : [] }), useSections: () => ({ data: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("wouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wouter")>()),
  useLocation: () => ["", mocks.navigate],
}));

import { AdmissionDetail, AdmissionForm } from "@/pages/admissions-students-pages";

const session = { id: "user-1", name: "Admin", email: "admin@example.test", schoolId: "school-1", role: "OFFICE_ADMIN" as const, permissions: ["ADMISSION_CREATE" as const], avatar: "A", title: "Admin" };
const readSession = { ...session, permissions: ["ADMISSION_READ" as const] };
const updateSession = { ...session, permissions: ["ADMISSION_READ" as const, "ADMISSION_UPDATE" as const] };

const admissionDetail = () => ({
  id: "admission-1", admissionNumber: "ADM-1", admissionSequence: 1, admissionStatus: "DRAFT",
  schoolId: "school-1", academicYearId: "year-1", programId: "program-1", classId: "class-1", sectionId: "section-1",
  studentName: "Asha Student", gender: "FEMALE", dateOfBirth: "2015-04-03T00:00:00.000Z", createdById: "user-1",
});

const feeConfiguration = (details: AdmissionFeeConfiguration["feePaymentHeader"]["feePaymentDetails"] = [
  { id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null },
]): AdmissionFeeConfiguration => ({ admissionId: "admission-1", feePaymentHeader: { id: "header-1", grossAmount: "100.00", discountAmount: "0.00", netAmount: "100.00", totalFeeAmount: "100.00", totalPaidAmount: "0.00", totalDueAmount: "100.00", feePaymentDetails: details } });

const concessionBreakdown = (concession: any = null) => ({ components: [{ id: "snapshot-1", nameSnapshot: "Tuition snapshot", concession }] });
const setReviewRequired = (discountApplicable = true) => {
  mocks.feeConfiguration = feeConfiguration([{ id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable, isActive: true, isIncluded: true, concession: { id: "concession-1", requiresReview: true, calculationMode: "PAYABLE" } }]);
  mocks.concessions = concessionBreakdown({ id: "concession-1", requiresReview: true, categoryName: null, calculatedDiscountAmount: "0.00" });
};

const preview = (year = "year-1", program = "program-1", classId = "class-1"): ApplicableFeeConfiguration => ({
  feeStructure: {
    id: `master-${year}`, name: "Standard Fees", totalAmount: "1500.00",
    academicYearId: year, programId: program, classId, description: "Annual fees",
  },
  components: year === "year-1" ? [
    { id: "source-tuition", name: "Tuition", originalAmount: "1200.00", isDiscountApplicable: true, isMandatory: true, description: null, initiallySelected: true, locked: true },
    { id: "source-library", name: "Library", originalAmount: "200.50", isDiscountApplicable: false, isMandatory: false, description: "Library services", initiallySelected: true, locked: false },
  ] : [
    { id: "source-tuition-2", name: "Tuition 2", originalAmount: "1300.00", isDiscountApplicable: true, isMandatory: true, description: null, initiallySelected: true, locked: true },
    { id: "source-library-2", name: "Library 2", originalAmount: "250.00", isDiscountApplicable: false, isMandatory: false, description: null, initiallySelected: true, locked: false },
  ],
});

const readyPreview = (data: ApplicableFeeConfiguration | null = preview()) => ({
  data, isLoading: false, isFetching: false, isError: false, error: null,
});

function renderForm() {
  return render(<AdmissionForm session={session} />);
}

async function selectScope(user: ReturnType<typeof userEvent.setup>, year = "year-1", program = "program-1", classId = "class-1") {
  await user.selectOptions(screen.getByLabelText("Academic year"), year);
  await user.selectOptions(screen.getByLabelText("Program"), program);
  await user.selectOptions(screen.getByLabelText("Class"), classId);
  await user.selectOptions(screen.getByLabelText("Section"), classId === "class-1" ? "section-1" : "section-2");
}

function fieldInput(label: string) {
  const input = screen.getByText(label).parentElement?.querySelector("input");
  if (!input) throw new Error(`Missing input for ${label}`);
  return input;
}

async function fillAdmissionFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(fieldInput("Student name"), "Asha Student");
  await user.type(fieldInput("Date of birth"), "2015-04-03");
  await user.type(fieldInput("Parent name"), "Parent Name");
  await user.type(fieldInput("Parent phone"), "9876543210");
  await user.type(fieldInput("Parent email"), "parent@example.test");
  await user.type(fieldInput("Address line 1"), "1 School Road");
  await user.type(fieldInput("City"), "Chennai");
  await user.type(fieldInput("State"), "Tamil Nadu");
  await user.type(fieldInput("Postal code"), "600001");
}

describe("applicable fee preview in admission creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview = readyPreview();
    mocks.admission = null;
    mocks.feeConfiguration = null;
    mocks.concessions = { components: [] };
    mocks.feeConfigurationState = {};
    mocks.concessionsState = {};
    mocks.save.mockResolvedValue({ id: "admission-1" });
    mocks.updateFeeSelection.mockResolvedValue(undefined);
    mocks.assignConcession.mockReset();
    mocks.updateConcession.mockReset();
    mocks.removeConcession.mockReset();
  });

  it("renders the backend-shaped master and component data with backend selection flags", async () => {
    const user = userEvent.setup();
    renderForm();
    await selectScope(user);

    expect(await screen.findByText("Standard Fees")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "(master-year-1)")).toBeInTheDocument();
    expect(screen.getByText("Tuition — 1200.00 (Mandatory) · Discount applicable")).toBeInTheDocument();
    expect(screen.getByText("Library — 200.50 · No discount")).toBeInTheDocument();
    const tuition = screen.getByRole("checkbox", { name: /Tuition/ });
    const library = screen.getByRole("checkbox", { name: /Library/ });
    expect(tuition).toBeChecked();
    expect(tuition).toBeDisabled();
    expect(library).toBeChecked();
    expect(library).toBeEnabled();
    await user.click(library);
    expect(library).not.toBeChecked();
    await user.click(library);
    expect(library).toBeChecked();
  });

  it("submits selected source IDs only and omits master and monetary fields", async () => {
    const user = userEvent.setup();
    renderForm();
    await selectScope(user);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Library/ })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: /Library/ }));
    await fillAdmissionFields(user);
    await user.click(screen.getByRole("button", { name: "Create admission" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const payload = mocks.save.mock.calls[0][0];
    expect(payload.selectedFeeComponentIds).toEqual(["source-tuition"]);
    expect(payload).not.toHaveProperty("feeStructureId");
    expect(payload).not.toHaveProperty("feeStructure");
    expect(payload).not.toHaveProperty("components");
    expect(payload).not.toHaveProperty("feeComponents");
    expect(payload).not.toHaveProperty("totalAmount");
    expect(payload).not.toHaveProperty("grossAmount");
    expect(payload).not.toHaveProperty("discountAmount");
    expect(payload).not.toHaveProperty("netAmount");
  });

  it("blocks creation when no component is selected", async () => {
    const user = userEvent.setup();
    mocks.preview = readyPreview({ ...preview(), components: [
      { id: "source-optional", name: "Optional", originalAmount: "25.00", isDiscountApplicable: false, isMandatory: false, description: null, initiallySelected: true, locked: false },
    ] });
    renderForm();
    await selectScope(user);
    const optional = screen.getByRole("checkbox", { name: /Optional/ });
    await user.click(optional);
    expect(screen.getByRole("button", { name: "Create admission" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("updates admission metadata while preview is unavailable and sends no fee fields", async () => {
    const user = userEvent.setup();
    mocks.admission = {
      id: "admission-1", admissionNumber: "ADM-1", admissionSequence: 1, admissionStatus: "DRAFT",
      schoolId: "school-1", academicYearId: "year-1", programId: "program-1", classId: "class-1", sectionId: "section-1",
      studentName: "Asha Student", gender: "FEMALE", dateOfBirth: "2015-04-03T00:00:00.000Z",
      parentName: "Parent Name", parentRelation: "MOTHER", parentPhone: "9876543210", parentAlternatePhone: "",
      parentEmail: "parent@example.test", addressLine1: "1 School Road", addressLine2: "", city: "Chennai",
      state: "Tamil Nadu", country: "India", pincode: "600001", createdById: "user-1",
    };
    mocks.preview = { data: null, isLoading: true, isFetching: true, isError: false, error: null };
    render(<AdmissionForm id="admission-1" session={session} />);
    await waitFor(() => expect(fieldInput("Student name")).toHaveValue("Asha Student"));
    expect(mocks.previewQuery).toHaveBeenCalledWith({ academicYearId: "", programId: "", classId: "" });
    await user.clear(fieldInput("Student name"));
    await user.type(fieldInput("Student name"), "Asha Updated");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const payload = mocks.save.mock.calls[0][0];
    expect(payload).toEqual({
      admissionId: "admission-1", programId: "program-1", classId: "class-1", sectionId: "section-1",
      studentName: "Asha Updated", gender: "FEMALE", dateOfBirth: "2015-04-03", parentName: "Parent Name",
      parentRelation: "MOTHER", parentPhone: "9876543210", parentAlternatePhone: "", parentEmail: "parent@example.test",
      addressLine1: "1 School Road", addressLine2: "", city: "Chennai", state: "Tamil Nadu", country: "India", postalCode: "600001",
    });
    for (const key of ["selectedFeeComponentIds", "feeStructureId", "feeStructure", "feeComponents", "originalAmount", "amount", "totalAmount", "grossAmount", "discountAmount", "netAmount", "concession"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("keeps dedicated DRAFT fee selection on snapshot detail IDs", async () => {
    const user = userEvent.setup();
    mocks.admission = admissionDetail();
    mocks.feeConfiguration = { admissionId: "admission-1", feePaymentHeader: { id: "header-1", grossAmount: "30.00", discountAmount: "0.00", netAmount: "30.00", totalFeeAmount: "30.00", totalPaidAmount: "0.00", totalDueAmount: "30.00", feePaymentDetails: [
      { id: "snapshot-detail-1", feeComponentId: "source-component-1", name: "Snapshot one", originalAmount: "10.00", discountAmount: "0.00", finalAmount: "10.00", totalAmountToBePaid: "10.00", amountPaid: "0.00", isMandatory: false, discountApplicable: false, isActive: true, isIncluded: true, concession: null },
      { id: "snapshot-detail-2", feeComponentId: "source-component-2", name: "Snapshot two", originalAmount: "20.00", discountAmount: "0.00", finalAmount: "20.00", totalAmountToBePaid: "20.00", amountPaid: "0.00", isMandatory: false, discountApplicable: false, isActive: true, isIncluded: false, concession: null },
    ] } };
    render(<AdmissionDetail id="admission-1" session={updateSession} />);
    await user.click(screen.getByRole("checkbox", { name: "Include Snapshot two" }));
    await user.click(screen.getByRole("button", { name: "Save fee selection" }));

    await waitFor(() => expect(mocks.updateFeeSelection).toHaveBeenCalledWith(["snapshot-detail-1", "snapshot-detail-2"]));
    expect(mocks.updateFeeSelection).not.toHaveBeenCalledWith(expect.arrayContaining(["source-component-1", "source-component-2"]));
  });

  it("clears the old selection on scope changes and initializes from the new matching preview", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await selectScope(user);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Library/ })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: /Library/ }));
    await user.selectOptions(screen.getByLabelText("Academic year"), "year-2");
    await user.selectOptions(screen.getByLabelText("Program"), "program-2");
    await user.selectOptions(screen.getByLabelText("Class"), "class-2");
    await user.selectOptions(screen.getByLabelText("Section"), "section-2");
    expect(screen.getByRole("button", { name: "Create admission" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("does not match the selected academic year");

    mocks.preview = readyPreview(preview("year-2", "program-2", "class-2"));
    rerender(<AdmissionForm session={session} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Library 2/ })).toBeChecked());
    expect(screen.queryByRole("checkbox", { name: /^Tuition$/ })).not.toBeInTheDocument();
  });

  it.each([
    ["loading", () => ({ data: null, isLoading: true, isFetching: true, isError: false, error: null }), "Loading fee components…"],
    ["failed", () => ({ data: null, isLoading: false, isFetching: false, isError: true, error: new Error("offline") }), "Could not load the applicable fee configuration."],
    ["empty", () => readyPreview({ ...preview(), components: [] }), "This fee structure has no active components."],
    ["mismatched", () => readyPreview(preview("year-2", "program-2", "class-2")), "does not match the selected academic year"],
  ])("blocks creation for a %s preview", async (_name, previewState, message) => {
    const user = userEvent.setup();
    mocks.preview = previewState();
    renderForm();
    await selectScope(user);
    expect(screen.getByRole("button", { name: "Create admission" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  describe("DRAFT fee and concession permissions and query states", () => {
    beforeEach(() => {
      mocks.admission = admissionDetail();
      mocks.feeConfiguration = feeConfiguration();
      mocks.concessions = concessionBreakdown();
    });

    it("lets read-only users view fee data without mutation controls", () => {
      mocks.concessions = concessionBreakdown({ id: "concession-1", requiresReview: true, categoryName: "Sibling discount", calculatedDiscountAmount: "10.00" });
      render(<AdmissionDetail id="admission-1" session={readSession} />);
      expect(screen.getByText("Tuition snapshot")).toBeInTheDocument();
      expect(screen.getByText("Included")).toBeInTheDocument();
      expect(screen.getByText("Sibling discount")).toBeInTheDocument();
      expect(screen.getByText("Review required")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /Include/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save fee selection" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add Concession|Remove|Reapply \/ acknowledge/ })).not.toBeInTheDocument();
    });

    it("keeps excluded snapshots visible to read-only users", () => {
      mocks.feeConfiguration = feeConfiguration([
        { id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null },
        { id: "snapshot-2", feeComponentId: "source-2", name: "Excluded snapshot", originalAmount: "20.00", discountAmount: "0.00", finalAmount: "20.00", totalAmountToBePaid: "20.00", amountPaid: "0.00", isMandatory: false, discountApplicable: false, isActive: true, isIncluded: false, concession: null },
      ]);
      render(<AdmissionDetail id="admission-1" session={readSession} />);
      expect(screen.getByText("Excluded snapshot")).toBeInTheDocument();
      expect(screen.getAllByText("Excluded")).toHaveLength(2);
      expect(screen.queryByRole("checkbox", { name: /Include/ })).not.toBeInTheDocument();
    });

    it("shows DRAFT mutation controls to a user with ADMISSION_UPDATE", () => {
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByRole("checkbox", { name: "Include Tuition snapshot" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save fee selection" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Concession" })).toBeInTheDocument();
    });

    it("consumes the fee-configuration response fields and minimal concession summary", () => {
      setReviewRequired();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByRole("checkbox", { name: "Include Tuition snapshot" })).toBeInTheDocument();
      expect(screen.getByText("Review required")).toBeInTheDocument();
    });

    it("uses the concession snapshot name when the fee serializer omits name", () => {
      mocks.feeConfiguration = feeConfiguration([{ id: "snapshot-1", feeComponentId: "source-1", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null }]);
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByText("Tuition snapshot")).toBeInTheDocument();
    });

    it("displays the canonical payable instead of the finalAmount mirror", () => {
      mocks.feeConfiguration = feeConfiguration([{ id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "5.00", finalAmount: "95.00", totalAmountToBePaid: "88.25", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null }]);
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      const row = screen.getByText("Tuition snapshot").closest("tr");
      expect(row).not.toBeNull();
      expect(within(row!).getByText("₹88.25")).toBeInTheDocument();
      expect(within(row!).queryByText("₹95.00")).not.toBeInTheDocument();
    });

    it("shows a missing canonical payable as unavailable without falling back to finalAmount", () => {
      mocks.feeConfiguration = feeConfiguration([{ id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "5.00", finalAmount: "95.00", totalAmountToBePaid: null, amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null }]);
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      const row = screen.getByText("Tuition snapshot").closest("tr");
      expect(row).not.toBeNull();
      expect(within(row!).getByText("—")).toBeInTheDocument();
      expect(within(row!).queryByText("₹95.00")).not.toBeInTheDocument();
    });

    it("reapplies a review-required discount with the exact selected payable string", async () => {
      setReviewRequired();
      const user = userEvent.setup();
      const view = render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Resolve review" }));
      await user.click(screen.getByRole("button", { name: "Reapply concession" }));
      const input = screen.getByLabelText("Payable amount");
      await user.clear(input);
      await user.type(input, "90.25");
      await user.click(screen.getByRole("button", { name: "Submit reapplication" }));
      await waitFor(() => expect(mocks.updateConcession).toHaveBeenCalledWith({
        concessionId: "concession-1",
        payload: { payableAmount: "90.25" },
      }));
      expect(screen.getByText("Review required")).toBeInTheDocument();

      mocks.concessions = concessionBreakdown({ id: "concession-1", requiresReview: false, categoryName: null, calculatedDiscountAmount: "9.75" });
      view.rerender(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.queryByText("Review required")).not.toBeInTheDocument();
    });

    it("does not submit the original amount through reapplication", async () => {
      setReviewRequired();
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Resolve review" }));
      await user.click(screen.getByRole("button", { name: "Reapply concession" }));
      await user.click(screen.getByRole("button", { name: "Submit reapplication" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Reapply requires a payable amount below the original amount");
      expect(mocks.updateConcession).not.toHaveBeenCalled();
      expect(screen.getByText("Review required")).toBeInTheDocument();
    });

    it("acknowledges no discount using the original snapshot amount regardless of prior input", async () => {
      setReviewRequired();
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Resolve review" }));
      const input = screen.getByLabelText("Payable amount");
      await user.clear(input);
      await user.type(input, "70.00");
      await user.click(screen.getByRole("button", { name: "Acknowledge no discount" }));
      expect(input).toHaveValue("100.00");
      expect(input).toHaveAttribute("readonly");
      await user.click(screen.getByRole("button", { name: "Confirm no-discount acknowledgement" }));
      expect(mocks.updateConcession).toHaveBeenCalledWith({
        concessionId: "concession-1",
        payload: { payableAmount: "100.00" },
      });
    });

    it("offers only no-discount acknowledgement for non-discountable review rows", async () => {
      setReviewRequired(false);
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Resolve review" }));
      expect(screen.queryByRole("button", { name: "Reapply concession" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Acknowledge no discount" }));
      await user.click(screen.getByRole("button", { name: "Confirm no-discount acknowledgement" }));
      expect(mocks.updateConcession).toHaveBeenCalledWith({
        concessionId: "concession-1",
        payload: { payableAmount: "100.00" },
      });
    });

    it.each(["", ".", "letters", "-1", "1.234", "100.01"])(
      "keeps invalid payable input %j without rendering a calculation",
      async (value) => {
        const user = userEvent.setup();
        render(<AdmissionDetail id="admission-1" session={updateSession} />);
        await user.click(screen.getByRole("button", { name: "Add Concession" }));
        const input = screen.getByLabelText("Payable amount");
        await user.clear(input);
        if (value) await user.type(input, value);
        expect(input).toHaveValue(value);
        expect(screen.getByRole("alert")).toBeVisible();
        expect(screen.queryByText("Calculated Deduction:")).not.toBeInTheDocument();
      },
    );

    it.each([
      ["0", "- ₹100.00"],
      ["99.99", "- ₹0.01"],
    ])("renders an exact preview for payable %s", async (value, deduction) => {
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Add Concession" }));
      const input = screen.getByLabelText("Payable amount");
      await user.clear(input);
      await user.type(input, value);
      expect(input).toHaveValue(value);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText(deduction)).toBeInTheDocument();
    });

    it.each([
      ["loading", null, { isLoading: true }, "Loading fee configuration…"],
      ["failed", null, { isError: true, error: new Error("configuration offline") }, "Could not load fee configuration."],
      ["empty", feeConfiguration([]), {}, "No fee snapshot details are available."],
      ["populated", feeConfiguration(), {}, "Tuition snapshot"],
    ])("shows the fee configuration %s state", (_state, data, state, expected) => {
      mocks.feeConfiguration = data;
      mocks.feeConfigurationState = state;
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      if (_state === "failed") expect(screen.getByRole("alert")).toHaveTextContent(expected);
      else expect(screen.getByText(expected)).toBeInTheDocument();
      if (_state !== "populated") expect(screen.queryByRole("button", { name: "Save fee selection" })).not.toBeInTheDocument();
    });

    it("surfaces a failed refresh while showing cached configuration without mutation controls", () => {
      mocks.feeConfigurationState = { isError: true, isFetching: false, error: new Error("refresh failed") };
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByRole("alert")).toHaveTextContent("displayed snapshot may be stale");
      expect(screen.getByText("Tuition snapshot")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save fee selection" })).not.toBeInTheDocument();
    });

    it.each([
      ["loading", null, { isLoading: true }, "Loading concession details…"],
      ["failed", null, { isError: true, error: new Error("concession offline") }, "Could not load concession details."],
      ["empty", { components: [] }, {}, "No concessions are assigned."],
      ["populated", concessionBreakdown({ id: "concession-1", requiresReview: true, categoryName: null, calculatedDiscountAmount: "0.00" }), {}, "Review required"],
    ])("shows the concession GET %s state", async (_state, data, state, expected) => {
      mocks.concessions = data;
      mocks.concessionsState = state;
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      if (_state === "failed") expect(screen.getByRole("alert")).toHaveTextContent(expected);
      else expect(screen.getByText(expected)).toBeInTheDocument();
      if (_state === "loading" || _state === "failed") {
        expect(screen.queryByRole("button", { name: "Add Concession" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      }
      if (_state === "populated") {
        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Resolve review" }));
        expect(screen.getByRole("button", { name: "Acknowledge no discount" })).toBeInTheDocument();
      }
    });

    it("does not treat a failed concession GET as an empty concession", () => {
      mocks.concessions = null;
      mocks.concessionsState = { isError: true, error: new Error("offline") };
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByText("Concession status unavailable")).toBeInTheDocument();
      expect(screen.queryByText("No concession")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Concession" })).not.toBeInTheDocument();
    });

    it("renders inactive snapshot rows returned by the API without exposing row mutations", () => {
      mocks.feeConfiguration = feeConfiguration([{ id: "inactive-snapshot", feeComponentId: "source-1", name: "Historical snapshot", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: false, isIncluded: false, concession: null }]);
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      expect(screen.getByText("Historical snapshot")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Include Historical snapshot" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Concession" })).not.toBeInTheDocument();
    });

    it("restores backend-confirmed checkbox selection after a failed fee update", async () => {
      mocks.feeConfiguration = feeConfiguration([
        { id: "snapshot-1", feeComponentId: "source-1", name: "Tuition snapshot", originalAmount: "100.00", discountAmount: "0.00", finalAmount: "100.00", totalAmountToBePaid: "100.00", amountPaid: "0.00", isMandatory: false, discountApplicable: true, isActive: true, isIncluded: true, concession: null },
        { id: "snapshot-2", feeComponentId: "source-2", name: "Excluded snapshot", originalAmount: "20.00", discountAmount: "0.00", finalAmount: "20.00", totalAmountToBePaid: "20.00", amountPaid: "0.00", isMandatory: false, discountApplicable: false, isActive: true, isIncluded: false, concession: null },
      ]);
      mocks.updateFeeSelection.mockRejectedValueOnce(new Error("Fee activity prevents changes"));
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      const included = screen.getByRole("checkbox", { name: "Include Tuition snapshot" });
      const excluded = screen.getByRole("checkbox", { name: "Include Excluded snapshot" });
      expect(included).toBeChecked();
      expect(excluded).not.toBeChecked();
      await user.click(excluded);
      expect(excluded).toBeChecked();
      await user.click(screen.getByRole("button", { name: "Save fee selection" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Fee activity prevents changes");
      expect(included).toBeChecked();
      expect(excluded).not.toBeChecked();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps concession POST and PATCH failures visible in the dialog", async () => {
      const user = userEvent.setup();
      mocks.assignConcession.mockRejectedValueOnce(new Error("POST rejected"));
      const first = render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Add Concession" }));
      await user.click(screen.getByRole("button", { name: "Save Payable" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("POST rejected");
      first.unmount();

      setReviewRequired();
      mocks.updateConcession.mockRejectedValueOnce(new Error("PATCH rejected"));
      const { unmount } = render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Resolve review" }));
      await user.click(screen.getByRole("button", { name: "Reapply concession" }));
      const input = screen.getByLabelText("Payable amount");
      await user.clear(input);
      await user.type(input, "90.00");
      await user.click(screen.getByRole("button", { name: "Submit reapplication" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("PATCH rejected");
      expect(screen.getByText("Review required")).toBeInTheDocument();
      unmount();
    });

    it("shows concession DELETE failures without reporting success", async () => {
      mocks.concessions = concessionBreakdown({ id: "concession-1", requiresReview: false, categoryName: "Sibling discount", calculatedDiscountAmount: "10.00" });
      mocks.removeConcession.mockRejectedValueOnce(new Error("DELETE rejected"));
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      render(<AdmissionDetail id="admission-1" session={updateSession} />);
      await user.click(screen.getByRole("button", { name: "Remove" }));
      await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not remove concession", description: "DELETE rejected" })));
      expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Concession removed" }));
      confirm.mockRestore();
    });
  });
});
