import { type FormEvent, useEffect, useLayoutEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Plus,
  Settings2,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAdmissionConcessions,
  useAdmissionFeeConfiguration,
  useUpdateAdmissionFeeConfiguration,
  useAssignAdmissionConcession,
  useUpdateAdmissionConcession,
  useRemoveAdmissionConcession,
  type ConcessionComponentItem,
  type FeeConfigurationDetail,
} from "@/lib/concessions-api";
import { toast } from "@/hooks/use-toast";
import {
  admissionErrorMessage,
  applicableFeeConfigurationErrorMessage,
  confirmationErrorMessage,
  admissionStatusLabel,
  compareAdmissions,
  useAdmission,
  useApplicableFeeConfiguration,
  useAdmissionWorkflow,
  useAdmissions,
  useSaveAdmission,
  type AdmissionPayload,
  type AdmissionUpdatePayload,
  type AdmissionResponse,
} from "@/lib/admissions-api";
import {
  studentFeesErrorMessage,
  useRecordStudentFeePayment,
  useStudentFees,
  validatePaymentAmount,
} from "@/lib/student-fees-api";
import { useAcademicYears, type AcademicYear } from "@/lib/academic-years-api";
import { useClasses } from "@/lib/classes-api";
import { usePrograms } from "@/lib/programs-api";
import { useSections, useSectionsByClass } from "@/lib/sections-api";
import { feeAmount } from "@/lib/fees-api";
import {
  formatFeeMinorUnits,
  formatFeeMoney,
  parseFeeMoneyMinorUnits,
  sumFeeMoneyMinorUnits,
} from "@/lib/fee-money";
import {
  InstallmentScheduleCard,
  StudentInstallmentScheduleCard,
} from "./installment-schedule-components";
import {
  CollectAdmissionPaymentDialog,
  AdmissionPaymentHistoryCard,
} from "./admission-payment-components";
import { parseMoneyMinor, useAdmissionPayments } from "@/lib/admission-payments-api";
type AdmissionFeeDetailView = Omit<
  FeeConfigurationDetail,
  "name" | "concession"
> & {
  name: string;
  concession: ConcessionComponentItem["concession"];
};
export const displayMoney = (value: string | number | null | undefined) =>
  value == null ? "-" : `₹${String(value)}`;
export const displayMinor = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};
export const parsePayableMinor = (value: string): bigint | null => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
};
export const payableAmountError = (
  value: string,
  original: string | number | null | undefined,
  discountApplicable = true,
): string | null => {
  if (original == null) return "The original amount is unavailable.";
  const source = parsePayableMinor(String(original));
  if (source === null)
    return "The original amount cannot be represented with the current two-decimal payable contract.";
  if (value === "") return "Enter a payable amount.";
  const payable = parsePayableMinor(value);
  if (payable === null)
    return "Enter a non-negative decimal amount with at most two fractional digits.";
  if (payable > source)
    return "Payable amount cannot exceed the original amount.";
  if (!discountApplicable && payable !== source)
    return "A discount is not applicable to this component; payable must equal the original amount.";
  return null;
};
export const validatePayableAmount = (
  value: string,
  original: string | number | null | undefined,
) => {
  if (original == null) return null;
  const payable = parsePayableMinor(value);
  const source = parsePayableMinor(String(original));
  return payable !== null && source !== null && payable <= source
    ? payable
    : null;
};
export const initialFeeSelection = (
  components: Array<{
    id: string;
    initiallySelected: boolean;
    isMandatory: boolean;
  }>,
) =>
  components
    .filter((component) => component.initiallySelected || component.isMandatory)
    .map((component) => component.id);
export const toggleFeeSelection = (
  selected: string[],
  id: string,
  mandatory: boolean,
  checked: boolean,
) =>
  mandatory
    ? selected
    : checked
      ? Array.from(new Set([...selected, id]))
      : selected.filter((value) => value !== id);

export const readableErrorText = (reason: unknown, fallback: string) =>
  reason instanceof Error && reason.message
    ? reason.message
    : admissionErrorMessage(reason, fallback);
import {
  useStudent,
  useStudents,
  studentErrorMessage,
} from "@/lib/students-api";
import {
  type Permission,
  type User,
  hasPermission,
  useItem,
  useResource,
  useSaveResource,
} from "@/lib/mock-erp";
import {
  AccessState,
  AppButton,
  Avatar,
  Empty,
  Loading,
  PageHeader,
  SearchBox,
  SelectBox,
  Status,
  date,
  money,
  titleCase,
} from "@/pages/page-primitives";
type BasicResource = "students" | "admissions" | "staff";
const basicMeta: Record<
  BasicResource,
  {
    title: string;
    singular: string;
    description: string;
    read: Permission;
    create: Permission;
    update: Permission;
    fields: { key: string; label: string; type?: string; options?: string[] }[];
  }
> = {
  students: {
    title: "Students",
    singular: "student",
    description: "The enrolled student register for the current academic year.",
    read: "STUDENT_READ",
    create: "STUDENT_CREATE",
    update: "STUDENT_UPDATE",
    fields: [
      { key: "admissionNumber", label: "Admission number" },
      { key: "name", label: "Full name" },
      { key: "email", label: "Email address", type: "email" },
      { key: "phone", label: "Phone number" },
      { key: "className", label: "Programme" },
      { key: "section", label: "Section" },
      { key: "dateOfBirth", label: "Date of birth", type: "date" },
      { key: "gender", label: "Gender", options: ["Female", "Male", "Other"] },
      { key: "guardianName", label: "Guardian name" },
      { key: "guardianPhone", label: "Guardian phone" },
      {
        key: "status",
        label: "Record status",
        options: ["Active", "Inactive"],
      },
      {
        key: "feeStatus",
        label: "Fee status",
        options: ["Paid", "Partial", "Pending"],
      },
    ],
  },
  admissions: {
    title: "Admissions",
    singular: "application",
    description: "Track applications from first contact to confirmation.",
    read: "ADMISSION_READ",
    create: "ADMISSION_CREATE",
    update: "ADMISSION_UPDATE",
    fields: [
      { key: "applicationNumber", label: "Application number" },
      { key: "applicantName", label: "Applicant name" },
      { key: "email", label: "Email address", type: "email" },
      { key: "phone", label: "Phone number" },
      { key: "parentName", label: "Parent / guardian" },
      { key: "parentPhone", label: "Parent phone" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "academicQualification", label: "Academic qualification" },
      { key: "appliedClass", label: "Applied class" },
      { key: "appliedOn", label: "Application date", type: "date" },
      {
        key: "status",
        label: "Application status",
        options: ["Pending", "Confirmed", "Cancelled"],
      },
      { key: "source", label: "Source" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  staff: {
    title: "Staff",
    singular: "staff member",
    description: "Faculty and operations colleagues at Nalanda.",
    read: "STAFF_READ",
    create: "STAFF_CREATE",
    update: "STAFF_UPDATE",
    fields: [
      { key: "employeeNumber", label: "Employee number" },
      { key: "name", label: "Full name" },
      { key: "email", label: "Email address", type: "email" },
      { key: "phone", label: "Phone number" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "joinedOn", label: "Joined on", type: "date" },
      {
        key: "status",
        label: "Status",
        options: ["Active", "On Leave", "Inactive"],
      },
      {
        key: "systemRole",
        label: "System role",
        options: ["Staff", "Office Admin", "College Admin"],
      },
    ],
  },
};
const defaultBasic: Record<BasicResource, Record<string, unknown>> = {
  students: {
    status: "Active",
    feeStatus: "Pending",
    gender: "Female",
    dateOfBirth: "2005-01-01",
  },
  admissions: {
    status: "Pending",
    appliedOn: "2025-05-13",
    notes: "",
    parentName: "",
    parentPhone: "",
    address: "",
    academicQualification: "",
  },
  staff: { status: "Active", joinedOn: "2025-05-13", systemRole: "Staff" },
};
const basicSchema = z
  .object({
    admissionNumber: z.string().optional(),
    name: z.string().optional(),
    applicantName: z.string().optional(),
    applicationNumber: z.string().optional(),
    email: z.string().email("Enter a valid email"),
    phone: z.string().min(10, "Enter a phone number"),
    appliedClass: z.string().optional(),
    appliedOn: z.string().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    parentName: z.string().optional(),
    parentPhone: z.string().optional(),
    address: z.string().optional(),
    academicQualification: z.string().optional(),
    className: z.string().optional(),
    section: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    employeeNumber: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    joinedOn: z.string().optional(),
    status: z.string(),
    feeStatus: z.string().optional(),
    systemRole: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (!data.name && !data.applicantName)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.applicantName !== undefined ? "applicantName" : "name"],
        message: "Name is required",
      });
  });

export function BasicForm({
  resource,
  id,
  session,
}: {
  resource: BasicResource;
  id?: string;
  session: User;
}) {
  const meta = basicMeta[resource];
  const itemQuery = useItem(resource, id);
  const save = useSaveResource(resource);
  const [, setLocation] = useLocation();
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(basicSchema),
    defaultValues: defaultBasic[resource],
  });
  const editing = !!id;
  const canEdit = hasPermission(session, editing ? meta.update : meta.create);
  useEffect(() => {
    if (itemQuery.item)
      form.reset({ ...defaultBasic[resource], ...(itemQuery.item as object) });
  }, [itemQuery.item]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!canEdit) return <AccessState role={session.role} />;
  if (editing && itemQuery.isLoading) return <Loading />;
  if (editing && !itemQuery.item)
    return (
      <Empty
        title="Record not found"
        detail="This record is no longer in the workspace."
      />
    );
  const submit = (values: Record<string, unknown>) =>
    save.mutate({ id, value: values } as never, {
      onSuccess: (record) => {
        toast({
          title: editing ? "Record updated" : "Record created",
          description: `${meta.singular} saved to the workspace.`,
        });
        setLocation(`/${resource}/${id || (record as { id: string }).id}`);
      },
      onError: () =>
        toast({
          title: "Could not save record",
          description: "Please try again.",
        }),
    });
  return (
    <>
      <button
        className="back-link page-back"
        onClick={() => setLocation(id ? `/${resource}/${id}` : `/${resource}`)}
      >
        <ArrowLeft size={15} />
        Back to {meta.title}
      </button>
      <PageHeader
        eyebrow={editing ? "Edit record" : `New ${meta.singular}`}
        title={
          editing
            ? `Edit ${String((itemQuery.item as Record<string, unknown>)?.name || (itemQuery.item as Record<string, unknown>)?.applicantName || "")}`
            : `Add ${meta.singular}`
        }
        description="Keep the record complete and useful to the next person."
      />
      <form
        className="form-card"
        onSubmit={form.handleSubmit(submit, () =>
          toast({
            title: "Check the form",
            description: "A few required fields still need your attention.",
          }),
        )}
      >
        <div className="form-grid">
          {meta.fields.map((field) => (
            <div
              className={`field ${field.type === "textarea" ? "field-wide" : ""}`}
              key={field.key}
            >
              <label htmlFor={field.key}>{field.label}</label>
              {field.options ? (
                <select id={field.key} {...form.register(field.key)}>
                  {field.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  id={field.key}
                  rows={4}
                  {...form.register(field.key)}
                />
              ) : (
                <input
                  id={field.key}
                  type={field.type || "text"}
                  {...form.register(field.key)}
                />
              )}
              {form.formState.errors[field.key] && (
                <span className="field-error">
                  {String(form.formState.errors[field.key]?.message)}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="form-actions">
          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              setLocation(id ? `/${resource}/${id}` : `/${resource}`)
            }
          >
            Cancel
          </AppButton>
          <AppButton type="submit" disabled={save.isPending}>
            {save.isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : `Create ${meta.singular}`}
            <ArrowRight size={16} />
          </AppButton>
        </div>
      </form>
    </>
  );
}

export function BasicDetail({
  resource,
  id,
  session,
}: {
  resource: BasicResource;
  id: string;
  session: User;
}) {
  const meta = basicMeta[resource];
  const query = useItem(resource, id);
  const [, setLocation] = useLocation();
  const save = useSaveResource(resource);
  if (query.isLoading) return <Loading />;
  const item = query.item as Record<string, unknown> | undefined;
  if (!item)
    return (
      <Empty
        title="Record not found"
        detail="This record may have been deleted."
        action={
          <Link href={`/${resource}`} className="text-button">
            Back to {meta.title}
          </Link>
        }
      />
    );
  const canUpdate = hasPermission(session, meta.update);
  const fields = Object.entries(item).filter(
    ([key]) => !["id", "admissionId", "convertedStudentId"].includes(key),
  );
  const name = String(item.name || item.applicantName || "Record");
  const updateAdmission = (status: "Confirmed" | "Cancelled") =>
    save.mutate({ id, value: { ...item, status } } as never, {
      onSuccess: () =>
        toast({
          title: `Admission ${status.toLowerCase()}`,
          description: "The application status has been updated.",
        }),
      onError: () => toast({ title: "Could not update admission" }),
    });
  return (
    <>
      <button
        className="back-link page-back"
        onClick={() => setLocation(`/${resource}`)}
      >
        <ArrowLeft size={15} />
        Back to {meta.title}
      </button>
      <div className="detail-header">
        <div className="detail-title">
          <Avatar user={{ name }} size="lg" />
          <div>
            <div className="eyebrow">
              {String(
                item.admissionNumber ||
                  item.applicationNumber ||
                  item.employeeNumber ||
                  "Record",
              )}
            </div>
            <h1>{name}</h1>
            <p>
              {resource === "students"
                ? `${item.className} · Section ${item.section}`
                : resource === "staff"
                  ? `${item.designation} · ${item.department}`
                  : `${item.appliedClass} · Applied ${date(String(item.appliedOn))}`}
            </p>
          </div>
        </div>
        <div className="detail-actions">
          {canUpdate && (
            <Link
              href={`/${resource}/${id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"
            >
              <Settings2 size={15} />
              Edit
            </Link>
          )}
          {resource === "admissions" &&
            canUpdate &&
            item.status === "Pending" && (
              <>
                <AppButton
                  variant="soft"
                  onClick={() => updateAdmission("Confirmed")}
                >
                  <Check size={15} />
                  Confirm
                </AppButton>
                <AppButton
                  variant="danger"
                  onClick={() => updateAdmission("Cancelled")}
                >
                  <X size={15} />
                  Cancel
                </AppButton>
              </>
            )}
          {resource === "students" && (
            <Link
              href="/fees"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
            >
              Fee records
              <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Record details</div>
              <h2>Information</h2>
            </div>
            {Boolean(item.status) && <Status>{String(item.status)}</Status>}
          </div>
          <div className="detail-fields">
            {fields.map(([key, value]) => (
              <div className="detail-field" key={key}>
                <span>{titleCase(key)}</span>
                <strong>
                  {["appliedOn", "joinedOn", "dateOfBirth"].includes(key)
                    ? date(String(value))
                    : String(value ?? "-")}
                </strong>
              </div>
            ))}
          </div>
        </section>
        {resource === "admissions" && (
          <aside className="side-stack">
            <section className="panel mini-panel">
              <div className="eyebrow">Application decision</div>
              <h2>
                {item.status === "Confirmed"
                  ? "Ready to enrol"
                  : item.status === "Cancelled"
                    ? "Closed"
                    : "Pending review"}
              </h2>
              <p>
                Confirm once the student, parent, address, and academic
                documents are complete.
              </p>
              {canUpdate && item.status === "Pending" && (
                <div className="detail-actions">
                  <AppButton
                    variant="soft"
                    onClick={() => updateAdmission("Confirmed")}
                  >
                    Confirm
                  </AppButton>
                  <AppButton
                    variant="danger"
                    onClick={() => updateAdmission("Cancelled")}
                  >
                    Cancel
                  </AppButton>
                </div>
              )}
            </section>
          </aside>
        )}
      </div>
    </>
  );
}

type AdmissionFormState = {
  academicYearId: string;
  programId: string;
  classId: string;
  sectionId: string;
  studentName: string;
  gender: string;
  dateOfBirth: string;
  parentName: string;
  parentRelation: string;
  parentPhone: string;
  parentAlternatePhone: string;
  parentEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};
const emptyAdmissionForm: AdmissionFormState = {
  academicYearId: "",
  programId: "",
  classId: "",
  sectionId: "",
  studentName: "",
  gender: "MALE",
  dateOfBirth: "",
  parentName: "",
  parentRelation: "FATHER",
  parentPhone: "",
  parentAlternatePhone: "",
  parentEmail: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "India",
  postalCode: "",
};
const admissionFormSchema = z.object({
  academicYearId: z.string().min(1, "Academic year is required"),
  programId: z.string().min(1, "Program is required"),
  classId: z.string().min(1, "Class is required"),
  sectionId: z.string().min(1, "Section is required"),
  studentName: z.string().min(1, "Student name is required"),
  gender: z.string().min(1),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  parentName: z.string().min(1, "Parent name is required"),
  parentRelation: z.string().min(1),
  parentPhone: z.string().min(1, "Parent phone is required"),
  parentAlternatePhone: z.string(),
  parentEmail: z.string().email("Enter a valid parent email"),
  addressLine1: z.string().min(1, "Address is required"),
  addressLine2: z.string(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  postalCode: z.string().min(1, "Postal code is required"),
});
function admissionToForm(item: AdmissionResponse): AdmissionFormState {
  return {
    academicYearId: item.academicYearId,
    programId: item.programId,
    classId: item.classId,
    sectionId: item.sectionId,
    studentName: item.studentName,
    gender: item.gender,
    dateOfBirth: item.dateOfBirth?.slice(0, 10) || "",
    parentName: item.parentName || "",
    parentRelation: item.parentRelation || "FATHER",
    parentPhone: item.parentPhone || "",
    parentAlternatePhone: item.parentAlternatePhone || "",
    parentEmail: item.parentEmail || "",
    addressLine1: item.addressLine1 || "",
    addressLine2: item.addressLine2 || "",
    city: item.city || "",
    state: item.state || "",
    country: item.country || "India",
    postalCode: item.pincode || "",
  };
}
function admissionCreatePayload(
  form: AdmissionFormState,
  years: AcademicYear[],
  userId: string,
  selectedFeeComponentIds: string[],
): AdmissionPayload {
  const year = years.find((item) => item.id === form.academicYearId);
  return {
    ...form,
    schoolId: year?.schoolId || "",
    createdById: userId,
    selectedFeeComponentIds,
  };
}
function admissionUpdatePayload(
  form: AdmissionFormState,
  admissionId: string,
): AdmissionUpdatePayload {
  return {
    admissionId,
    programId: form.programId,
    classId: form.classId,
    sectionId: form.sectionId,
    studentName: form.studentName,
    gender: form.gender,
    dateOfBirth: form.dateOfBirth,
    parentName: form.parentName,
    parentRelation: form.parentRelation,
    parentPhone: form.parentPhone,
    parentAlternatePhone: form.parentAlternatePhone,
    parentEmail: form.parentEmail,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    city: form.city,
    state: form.state,
    country: form.country,
    postalCode: form.postalCode,
  };
}
export function AdmissionSelectors({
  form,
  setForm,
  editing,
}: {
  form: AdmissionFormState;
  setForm: React.Dispatch<React.SetStateAction<AdmissionFormState>>;
  editing: boolean;
}) {
  const years = useAcademicYears();
  const programs = usePrograms();
  const classes = useClasses();
  const sections = useSectionsByClass(form.classId);
  console.log("Programs data after finally:", programs);
  // console.log(
  //   ...(programs || [])
  //     // .filter((item) => item.academicYearId === form.academicYearId)
  //     .map((item) => [item.id, item.name]),
  //   form.academicYearId,
  // );

  const set = (key: keyof AdmissionFormState, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "academicYearId"
        ? { programId: "", classId: "", sectionId: "" }
        : key === "programId"
          ? { classId: "", sectionId: "" }
          : key === "classId"
            ? { sectionId: "" }
            : {}),
    }));
  return (
    <div className="detail-grid">
      <AdmissionSelectField
        name="academicYearId"
        label="Academic year"
        options={[
          ["", "Select academic year"],
          ...(years.data || []).map((item) => [item.id, item.name]),
        ]}
        value={form.academicYearId}
        onChange={(value) => set("academicYearId", value)}
        disabled={editing}
      />
      <AdmissionSelectField
        name="programId"
        label="Program"
        options={[
          ["", "Select program"],
          ...(programs?.data || [])
            .filter((item) => item.academicYearId === form.academicYearId)
            .map((item) => [item.id, item.name]),
        ]}
        value={form.programId}
        onChange={(value) => set("programId", value)}
        disabled={!form.academicYearId}
      />
      <AdmissionSelectField
        name="classId"
        label="Class"
        options={[
          ["", "Select class"],
          ...(classes.data || [])
            .filter((item) => item.programId === form.programId)
            .map((item) => [item.id, item.name]),
        ]}
        value={form.classId}
        onChange={(value) => set("classId", value)}
        disabled={!form.programId}
      />
      <AdmissionSelectField
        name="sectionId"
        label="Section"
        options={[
          ["", "Select section"],
          ...(sections.data || []).map((item) => [item.id, item.name]),
        ]}
        value={form.sectionId}
        onChange={(value) => set("sectionId", value)}
        disabled={!form.classId}
      />
    </div>
  );
}
export function AdmissionSelectField({
  name,
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  label: string;
  options: string[][];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
export function AdmissionForm({ session, id }: { session: User; id?: string }) {
  const editing = Boolean(id);
  const itemQuery = useAdmission(id);
  const years = useAcademicYears();
  const save = useSaveAdmission(id);
  const [, setLocation] = useLocation();
  const [form, setForm] = useState(emptyAdmissionForm);
  const [error, setError] = useState("");
  const feePreview = useApplicableFeeConfiguration({
    academicYearId: form.academicYearId,
    programId: form.programId,
    classId: form.classId,
  });
  const [selectedFeeComponentIds, setSelectedFeeComponentIds] = useState<
    string[]
  >([]);
  const admissionFeeConfig = useAdmissionFeeConfiguration(id);
  const admissionPayments = useAdmissionPayments(id, { enabled: editing });
  const updateFeeConfig = useUpdateAdmissionFeeConfiguration(id || "");
  const concessionsQuery = useAdmissionConcessions(editing ? id : undefined);
  const assignConcession = useAssignAdmissionConcession(id || "");
  const updateConcession = useUpdateAdmissionConcession(id || "");
  const removeConcession = useRemoveAdmissionConcession(id || "");

  const [editSelectedSnapshotIds, setEditSelectedSnapshotIds] = useState<
    string[]
  >([]);
  const [feeConfigSaveError, setFeeConfigSaveError] = useState("");
  const [concessionModalOpen, setConcessionModalOpen] = useState(false);
  const [selectedConcessionDetail, setSelectedConcessionDetail] =
    useState<FeeConfigurationDetail | null>(null);
  const [concessionPayableInput, setConcessionPayableInput] = useState("");
  const [concessionActionError, setConcessionActionError] = useState("");
  const [removingConcessionId, setRemovingConcessionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (editing && admissionFeeConfig.data) {
      setEditSelectedSnapshotIds(
        admissionFeeConfig.data.feePaymentHeader.feePaymentDetails
          .filter((d) => d.isActive && d.isIncluded)
          .map((d) => d.id),
      );
    }
  }, [editing, admissionFeeConfig.data]);

  const isDraft = itemQuery.data?.admissionStatus === "DRAFT";
  const paymentsLoading = Boolean(
    editing && (admissionPayments.isLoading || admissionPayments.isFetching),
  );
  const paymentsError = Boolean(editing && admissionPayments.isError);
  const paymentsAuthoritative = Boolean(
    editing &&
      !paymentsLoading &&
      !paymentsError &&
      Array.isArray(admissionPayments.data),
  );
  const hasRecordedPayments = Boolean(
    admissionPayments.data && admissionPayments.data.length > 0,
  );
  const hasNonZeroPaidAmount = Boolean(
    admissionFeeConfig.data?.feePaymentHeader.totalPaidAmount &&
      (parseMoneyMinor(
        admissionFeeConfig.data.feePaymentHeader.totalPaidAmount,
      ) ?? 0n) !== 0n,
  );
  const hasPayments = hasRecordedPayments || hasNonZeroPaidAmount;
  const canUpdate = hasPermission(session, "ADMISSION_UPDATE");
  const canEditFeeConfig =
    editing && isDraft && paymentsAuthoritative && !hasPayments && canUpdate;

  let feeConfigLockReason: string | null = null;
  if (editing) {
    if (!isDraft) {
      feeConfigLockReason =
        itemQuery.data?.admissionStatus === "CONFIRMED"
          ? "Fee obligations are confirmed and frozen. Component selection cannot be modified."
          : `Fee selection is locked for ${admissionStatusLabel(itemQuery.data?.admissionStatus)} admissions.`;
    } else if (paymentsLoading) {
      feeConfigLockReason = "Checking payment history and financial lock status…";
    } else if (paymentsError || !paymentsAuthoritative) {
      feeConfigLockReason = "Fee selection is locked because payment history could not be verified.";
    } else if (hasPayments) {
      feeConfigLockReason =
        "Fee selection is locked because financial transactions (payments or reversals) have been recorded for this admission.";
    } else if (!canUpdate) {
      feeConfigLockReason = "You do not have permission to update fee selection.";
    }
  }

  const handleSaveFeeSelection = async () => {
    if (!canEditFeeConfig || editSelectedSnapshotIds.length === 0) return;
    setFeeConfigSaveError("");
    try {
      await updateFeeConfig.mutateAsync(editSelectedSnapshotIds);
      toast({ title: "Fee configuration updated" });
    } catch (err) {
      setFeeConfigSaveError(
        err instanceof Error && err.message
          ? err.message
          : admissionErrorMessage(err, "Could not update fee configuration."),
      );
    }
  };

  const handleOpenAssignConcession = (detail: FeeConfigurationDetail) => {
    setSelectedConcessionDetail(detail);
    setConcessionPayableInput(String(detail.originalAmount ?? "0"));
    setConcessionActionError("");
    setConcessionModalOpen(true);
  };

  const handleOpenEditConcession = (detail: FeeConfigurationDetail) => {
    setSelectedConcessionDetail(detail);
    const existingDiscount = parseMoneyMinor(String(detail.discountAmount ?? "0")) ?? 0n;
    const original = parseMoneyMinor(String(detail.originalAmount ?? "0")) ?? 0n;
    const preTaxPayable = original > existingDiscount ? original - existingDiscount : original;
    setConcessionPayableInput(
      detail.taxableAmount ?? (Number(preTaxPayable) / 100).toFixed(2),
    );
    setConcessionActionError("");
    setConcessionModalOpen(true);
  };

  const handleSaveConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConcessionDetail || !id) return;
    const original = parsePayableMinor(String(selectedConcessionDetail.originalAmount));
    const payableMinor = validatePayableAmount(
      concessionPayableInput,
      selectedConcessionDetail.originalAmount,
    );
    if (payableMinor === null) {
      setConcessionActionError(
        "Enter a valid payable amount with at most two decimal places not exceeding the original amount.",
      );
      return;
    }
    if (!selectedConcessionDetail.discountApplicable && payableMinor !== original) {
      setConcessionActionError(
        "A discount is not applicable to this component; payable must equal the original amount.",
      );
      return;
    }
    setConcessionActionError("");
    try {
      if (selectedConcessionDetail.concession) {
        await updateConcession.mutateAsync({
          concessionId: selectedConcessionDetail.concession.id,
          payload: { payableAmount: concessionPayableInput },
        });
        toast({ title: "Concession updated successfully" });
      } else {
        await assignConcession.mutateAsync({
          feePaymentDetailsId: selectedConcessionDetail.id,
          payableAmount: concessionPayableInput,
        });
        toast({ title: "Concession assigned successfully" });
      }
      setConcessionModalOpen(false);
      setSelectedConcessionDetail(null);
    } catch (err: any) {
      setConcessionActionError(
        readableErrorText(err, "Failed to save concession."),
      );
    }
  };

  const handleRemoveConcession = async (concessionId: string) => {
    if (!id) return;
    setRemovingConcessionId(concessionId);
    try {
      await removeConcession.mutateAsync(concessionId);
      toast({ title: "Concession removed successfully" });
    } catch (err: any) {
      toast({
        title: "Failed to remove concession",
        description: readableErrorText(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setRemovingConcessionId(null);
    }
  };

  const hasFeeLookupCriteria = Boolean(
    form.academicYearId && form.programId && form.classId,
  );
  const previewMatchesLookup = Boolean(
    feePreview.data &&
    feePreview.data.feeStructure.academicYearId === form.academicYearId &&
    feePreview.data.feeStructure.programId === form.programId &&
    feePreview.data.feeStructure.classId === form.classId,
  );
  const previewComponents = previewMatchesLookup
    ? (feePreview.data?.components ?? [])
    : [];
  const selectedComponents = previewComponents.filter((component) =>
    selectedFeeComponentIds.includes(component.id),
  );
  const selectedPreviewTotal =
    selectedComponents.length > 0 &&
    selectedComponents.every(
      (component) => parseFeeMoneyMinorUnits(component.originalAmount) !== null,
    )
      ? sumFeeMoneyMinorUnits(
          selectedComponents.map((component) => component.originalAmount),
        )
      : null;
  const previewMessage = hasFeeLookupCriteria
    ? feePreview.isLoading || feePreview.isFetching
      ? "Loading fee components…"
      : feePreview.isError
        ? applicableFeeConfigurationErrorMessage(feePreview.error)
        : !previewMatchesLookup
          ? "The fee preview does not match the selected academic year, program, and class. Wait for the matching preview."
          : previewComponents.length === 0
            ? "This fee structure has no active components."
            : null
    : null;
  const feeSelectionReady =
    hasFeeLookupCriteria &&
    !feePreview.isLoading &&
    !feePreview.isFetching &&
    !feePreview.isError &&
    previewMatchesLookup &&
    previewComponents.length > 0 &&
    selectedFeeComponentIds.length > 0;
  useEffect(() => {
    if (!editing) {
      setSelectedFeeComponentIds([]);
    }
  }, [editing, form.academicYearId, form.programId, form.classId]);
  useEffect(() => {
    if (!editing && previewMatchesLookup && feePreview.data) {
      setSelectedFeeComponentIds(
        initialFeeSelection(feePreview.data.components),
      );
    }
  }, [
    editing,
    form.academicYearId,
    form.programId,
    form.classId,
    feePreview.data,
    previewMatchesLookup,
  ]);
  useEffect(() => {
    if (itemQuery.data) setForm(admissionToForm(itemQuery.data));
  }, [itemQuery.data]);
  const update =
    (key: keyof AdmissionFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const parsed = admissionFormSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please complete the form");
      return;
    }
    try {
      if (editing) {
        await save.mutateAsync(admissionUpdatePayload(form, id!));
      } else if (!feeSelectionReady) {
        setError(
          previewMessage ||
            "Select an applicable fee configuration and at least one component.",
        );
        return;
      } else {
        const year = years.data?.find(
          (item) => item.id === form.academicYearId,
        );
        if (!year?.schoolId) {
          setError("The selected academic year has no school configured.");
          return;
        }
        await save.mutateAsync(
          admissionCreatePayload(
            form,
            years.data || [],
            session.id,
            selectedFeeComponentIds,
          ),
        );
      }
      toast({ title: editing ? "Admission updated" : "Admission created" });
      setLocation("/admissions");
    } catch (reason) {
      setError(admissionErrorMessage(reason, "Could not save admission."));
    }
  };
  if (editing && itemQuery.isLoading) return <Loading />;
  if (editing && !itemQuery.data)
    return (
      <Empty
        title="Admission not found"
        detail="The requested admission could not be loaded."
      />
    );
  return (
    <>
      <button
        className="back-link page-back"
        onClick={() => setLocation("/admissions")}
      >
        <ArrowLeft size={15} />
        Back to Admissions
      </button>
      <PageHeader
        title={editing ? "Edit admission" : "New admission"}
        description="Capture the student, guardian, and academic placement details."
      />
      <form onSubmit={submit} className="panel form-card space-y-6">
        {/* 1. Academic Placement */}
        <section className="space-y-4">
          <h2>Academic placement</h2>
          <AdmissionSelectors form={form} setForm={setForm} editing={editing} />
        </section>

        {/* 2. Student / Applicant Information */}
        <section className="space-y-4">
          <h2>Student / applicant</h2>
          <div className="form-grid">
            <FieldValue
              label="Student name"
              value={form.studentName}
              onChange={update("studentName")}
            />
            <AdmissionSelectField
              name="gender"
              label="Gender"
              options={[
                ["MALE", "Male"],
                ["FEMALE", "Female"],
                ["OTHER", "Other"],
              ]}
              value={form.gender}
              onChange={(value) =>
                setForm((current) => ({ ...current, gender: value }))
              }
            />
            <FieldValue
              label="Date of birth"
              type="date"
              value={form.dateOfBirth}
              onChange={update("dateOfBirth")}
            />
          </div>
        </section>

        {/* 3. Parent / Guardian & Address Information */}
        <section className="space-y-4">
          <h2>Parent / guardian</h2>
          <div className="form-grid">
            <FieldValue
              label="Parent name"
              value={form.parentName}
              onChange={update("parentName")}
            />
            <AdmissionSelectField
              name="parentRelation"
              label="Relation"
              options={[
                ["FATHER", "Father"],
                ["MOTHER", "Mother"],
                ["GUARDIAN", "Guardian"],
              ]}
              value={form.parentRelation}
              onChange={(value) =>
                setForm((current) => ({ ...current, parentRelation: value }))
              }
            />
            <FieldValue
              label="Parent phone"
              value={form.parentPhone}
              onChange={update("parentPhone")}
            />
            <FieldValue
              label="Alternate phone"
              value={form.parentAlternatePhone}
              onChange={update("parentAlternatePhone")}
            />
            <FieldValue
              label="Parent email"
              type="email"
              value={form.parentEmail}
              onChange={update("parentEmail")}
            />
          </div>

          <h2>Address</h2>
          <div className="form-grid">
            <FieldValue
              label="Address line 1"
              value={form.addressLine1}
              onChange={update("addressLine1")}
            />
            <FieldValue
              label="Address line 2"
              value={form.addressLine2}
              onChange={update("addressLine2")}
            />
            <FieldValue
              label="City"
              value={form.city}
              onChange={update("city")}
            />
            <FieldValue
              label="State"
              value={form.state}
              onChange={update("state")}
            />
            <FieldValue
              label="Country"
              value={form.country}
              onChange={update("country")}
            />
            <FieldValue
              label="Postal code"
              value={form.postalCode}
              onChange={update("postalCode")}
            />
          </div>
        </section>

        {/* 4. Fee Structure & Component Selection */}
        {!editing ? (
          <section className="space-y-3">
            <h2>Fee Structure & Component Selection</h2>
            {!hasFeeLookupCriteria && (
              <p className="text-sm text-muted-foreground">
                Select an academic year, program, and class above to preview
                applicable fees.
              </p>
            )}
            {previewMessage && (
              <p className="field-error" role="alert">
                {previewMessage}
              </p>
            )}
            {previewMatchesLookup &&
              previewComponents.length > 0 &&
              feePreview.data && (
                <div className="table-card">
                  <div className="p-4 border-b border-border bg-muted/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                          Applicable Fee Structure
                        </span>
                        <h3 className="text-base font-semibold text-foreground">
                          {feePreview.data.feeStructure.name}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            ({feePreview.data.feeStructure.id})
                          </span>
                        </h3>
                        {feePreview.data.feeStructure.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {feePreview.data.feeStructure.description}
                          </p>
                        )}
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-muted-foreground block">
                          Master Baseline Total
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatFeeMoney(
                            feePreview.data.feeStructure.totalAmount,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th className="w-12 text-center">Include</th>
                          <th>Fee Component</th>
                          <th>Classification</th>
                          <th>Discount Eligibility</th>
                          <th className="text-right">Amount (INR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewComponents.map((component) => {
                          const isSelected = selectedFeeComponentIds.includes(
                            component.id,
                          );
                          const isLocked =
                            component.locked || component.isMandatory;
                          return (
                            <tr
                              key={component.id}
                              className={
                                !isSelected ? "opacity-60 bg-muted/20" : undefined
                              }
                            >
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  aria-label={component.name}
                                  checked={isSelected}
                                  disabled={isLocked}
                                  onChange={(event) =>
                                    setSelectedFeeComponentIds((current) =>
                                      toggleFeeSelection(
                                        current,
                                        component.id,
                                        isLocked,
                                        event.target.checked,
                                      ),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <div className="font-medium text-foreground">
                                  {component.name}
                                </div>
                                {component.description && (
                                  <small className="block text-xs text-muted-foreground mt-0.5">
                                    {component.description}
                                  </small>
                                )}
                              </td>
                              <td>
                                {component.isMandatory ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                                    <Lock size={11} /> Mandatory
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                    Optional
                                  </span>
                                )}
                              </td>
                              <td>
                                {component.isDiscountApplicable ? (
                                  <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                    Discount applicable
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                                    No discount
                                  </span>
                                )}
                              </td>
                              <td className="text-right font-medium">
                                {formatFeeMoney(component.originalAmount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot flex items-center justify-between p-3 border-t border-border bg-muted/20">
                    <span className="text-xs text-muted-foreground">
                      {selectedFeeComponentIds.length} of{" "}
                      {previewComponents.length} components selected
                    </span>
                    {selectedPreviewTotal !== null && (
                      <span className="text-sm font-semibold text-foreground">
                        Selected Baseline Total:{" "}
                        {formatFeeMinorUnits(selectedPreviewTotal)}
                      </span>
                    )}
                  </div>
                </div>
              )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2>Fee Structure & Concessions</h2>
                <p className="text-sm text-muted-foreground">
                  {feeConfigLockReason ||
                    "Select optional fee components for this admission."}
                </p>
              </div>
              {feeConfigLockReason && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border border-border">
                  <Lock size={12} /> Fee Configuration Locked
                </span>
              )}
            </div>

            {admissionFeeConfig.isLoading && (
              <p role="status">Loading fee configuration…</p>
            )}
            {admissionFeeConfig.isError && (
              <p className="field-error" role="alert">
                Could not load fee configuration.{" "}
                {admissionErrorMessage(
                  admissionFeeConfig.error,
                  "Please try again.",
                )}
              </p>
            )}

            {admissionFeeConfig.data && (
              <div className="table-card">
                {/* Financial Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-muted/20 border-b border-border">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs uppercase font-semibold text-muted-foreground block">
                      Gross Fee Baseline
                    </span>
                    <div className="text-xl font-bold mt-1 text-foreground">
                      {displayMoney(admissionFeeConfig.data.feePaymentHeader.grossAmount)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Before concessions</span>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs uppercase font-semibold text-amber-600 block">
                      Approved Concessions
                    </span>
                    <div className="text-xl font-bold mt-1 text-amber-600">
                      - {displayMoney(admissionFeeConfig.data.feePaymentHeader.discountAmount)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Component reductions</span>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs uppercase font-semibold text-muted-foreground block">
                      Net Taxable Amount
                    </span>
                    <div className="text-xl font-bold mt-1 text-foreground">
                      {displayMoney(
                        admissionFeeConfig.data.feePaymentHeader.taxableAmount ??
                          displayMinor(
                            (parseMoneyMinor(admissionFeeConfig.data.feePaymentHeader.grossAmount) ?? 0n) -
                              (parseMoneyMinor(admissionFeeConfig.data.feePaymentHeader.discountAmount) ?? 0n),
                          ),
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Pre-tax taxable base</span>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs uppercase font-semibold text-muted-foreground block">
                      GST
                    </span>
                    <div className="text-xl font-bold mt-1 text-foreground">
                      {displayMoney(admissionFeeConfig.data.feePaymentHeader.gstAmount ?? "0.00")}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Applicable taxes</span>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs uppercase font-semibold text-primary block">
                      Net Payable Obligation
                    </span>
                    <div className="text-xl font-bold mt-1 text-primary">
                      {displayMoney(admissionFeeConfig.data.feePaymentHeader.netAmount)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Target for payments</span>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="w-12 text-center">Include</th>
                        <th>Fee Component</th>
                        <th>Classification</th>
                        <th>Discount Eligibility</th>
                        <th className="text-right">Original Amount</th>
                        <th>Applied Concession</th>
                        <th className="text-right">Concession Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admissionFeeConfig.data.feePaymentHeader.feePaymentDetails.map(
                        (detail) => {
                          const isSelected = editSelectedSnapshotIds.includes(
                            detail.id,
                          );
                          const isLocked =
                            !canEditFeeConfig ||
                            detail.isMandatory ||
                            !detail.isActive;
                          const concessionData = concessionsQuery.data?.components?.find(
                            (c) => c.id === detail.id,
                          )?.concession;
                          return (
                            <tr
                              key={detail.id}
                              className={
                                !isSelected || !detail.isActive
                                  ? "opacity-60 bg-muted/20"
                                  : undefined
                              }
                            >
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`Include ${detail.name || "Fee component"}`}
                                  checked={isSelected}
                                  disabled={isLocked}
                                  onChange={(event) =>
                                    setEditSelectedSnapshotIds((current) =>
                                      toggleFeeSelection(
                                        current,
                                        detail.id,
                                        detail.isMandatory || !canEditFeeConfig,
                                        event.target.checked,
                                      ),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <div className="font-medium text-foreground">
                                  {detail.name || "Fee component"}
                                </div>
                                {detail.description && (
                                  <small className="block text-xs text-muted-foreground mt-0.5">
                                    {detail.description}
                                  </small>
                                )}
                              </td>
                              <td>
                                {!detail.isActive ? (
                                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                    Inactive
                                  </span>
                                ) : detail.isMandatory ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                                    <Lock size={11} /> Mandatory
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                    Optional
                                  </span>
                                )}
                              </td>
                              <td>
                                {detail.discountApplicable ? (
                                  <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                    Discount applicable
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                                    No discount
                                  </span>
                                )}
                              </td>
                              <td className="text-right font-medium">
                                {displayMoney(detail.originalAmount)}
                              </td>
                              <td>
                                {!detail.isActive ? (
                                  <span className="text-xs text-muted-foreground">Inactive</span>
                                ) : !isSelected ? (
                                  <span className="text-xs text-muted-foreground">Excluded</span>
                                ) : concessionData || detail.concession ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-xs text-emerald-700 dark:text-emerald-300">
                                      {concessionData?.categoryName ?? "Payable concession"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      - {displayMoney(concessionData?.calculatedDiscountAmount ?? detail.discountAmount)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No concession</span>
                                )}
                              </td>
                              <td className="text-right">
                                {canEditFeeConfig && isSelected && detail.isActive && detail.discountApplicable ? (
                                  detail.concession || concessionData ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditConcession(detail)}
                                        className="text-xs font-semibold text-primary hover:underline px-1.5 py-0.5"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveConcession(
                                            detail.concession?.id ?? concessionData?.id ?? "",
                                          )
                                        }
                                        disabled={
                                          removingConcessionId ===
                                          (detail.concession?.id ?? concessionData?.id)
                                        }
                                        className="text-xs font-semibold text-destructive hover:underline px-1.5 py-0.5 disabled:opacity-50"
                                      >
                                        {removingConcessionId ===
                                        (detail.concession?.id ?? concessionData?.id)
                                          ? "Removing…"
                                          : "Remove"}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAssignConcession(detail)}
                                      className="text-xs font-semibold text-primary hover:underline px-1.5 py-0.5"
                                    >
                                      Assign Concession
                                    </button>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {!canEditFeeConfig ? "Locked" : !isSelected ? "Excluded" : "Not eligible"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-foot flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-t border-border bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    {editSelectedSnapshotIds.length} of{" "}
                    {
                      admissionFeeConfig.data.feePaymentHeader.feePaymentDetails.filter(
                        (d) => d.isActive,
                      ).length
                    }{" "}
                    active components selected
                  </span>
                  {canEditFeeConfig && (
                    <div className="flex items-center gap-2">
                      <AppButton
                        type="button"
                        onClick={handleSaveFeeSelection}
                        disabled={
                          updateFeeConfig.isPending ||
                          editSelectedSnapshotIds.length === 0
                        }
                      >
                        {updateFeeConfig.isPending
                          ? "Saving fee selection…"
                          : "Save fee selection"}
                      </AppButton>
                    </div>
                  )}
                </div>
                {feeConfigSaveError && (
                  <div className="p-3 border-t border-border bg-destructive/10">
                    <p className="field-error" role="alert">
                      {feeConfigSaveError}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Modal for Assigning / Updating Concession in Edit Mode */}
            <Dialog
              open={concessionModalOpen}
              onOpenChange={setConcessionModalOpen}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {selectedConcessionDetail?.concession
                      ? "Update Fee Concession"
                      : "Assign Fee Concession"}
                  </DialogTitle>
                  <DialogDescription>
                    Set the payable base amount for{" "}
                    <strong>{selectedConcessionDetail?.name}</strong> (Original:{" "}
                    {displayMoney(selectedConcessionDetail?.originalAmount)}).
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSaveConcession} className="space-y-4 py-2">
                  <div>
                    <label
                      htmlFor="edit-concession-payable"
                      className="text-xs font-semibold text-muted-foreground block mb-1"
                    >
                      Payable amount (pre-tax base)
                    </label>
                    <input
                      id="edit-concession-payable"
                      type="text"
                      inputMode="decimal"
                      value={concessionPayableInput}
                      onChange={(e) => setConcessionPayableInput(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="e.g. 800.00"
                      required
                    />
                  </div>

                  {selectedConcessionDetail && (
                    <div className="rounded-lg bg-muted/50 p-3 border border-border/60 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Original Baseline:</span>
                        <span>{displayMoney(selectedConcessionDetail.originalAmount)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-emerald-600">
                        <span>Calculated Discount:</span>
                        <span>
                          -{" "}
                          {displayMoney(
                            displayMinor(
                              (parsePayableMinor(String(selectedConcessionDetail.originalAmount)) ?? 0n) -
                                (parsePayableMinor(concessionPayableInput) ?? 0n) > 0n
                                ? (parsePayableMinor(String(selectedConcessionDetail.originalAmount)) ?? 0n) -
                                    (parsePayableMinor(concessionPayableInput) ?? 0n)
                                : 0n,
                            ),
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border/40">
                        <span>Payable Amount:</span>
                        <span>{displayMoney(concessionPayableInput || "0.00")}</span>
                      </div>
                    </div>
                  )}

                  {concessionActionError && (
                    <p className="text-xs text-red-600 font-medium" role="alert">
                      {concessionActionError}
                    </p>
                  )}

                  <DialogFooter className="pt-2">
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => setConcessionModalOpen(false)}
                    >
                      Cancel
                    </AppButton>
                    <AppButton
                      type="submit"
                      disabled={
                        assignConcession.isPending || updateConcession.isPending
                      }
                    >
                      {assignConcession.isPending || updateConcession.isPending
                        ? "Saving…"
                        : "Save Concession"}
                    </AppButton>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        )}

        {/* 5. Final Review and Admission Submission */}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="detail-actions">
          <AppButton
            type="submit"
            disabled={
              save.isPending ||
              (!editing && hasFeeLookupCriteria && !feeSelectionReady)
            }
          >
            {save.isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create admission"}
          </AppButton>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() => setLocation("/admissions")}
          >
            Cancel
          </AppButton>
        </div>
      </form>
    </>
  );
}

function FieldValue({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        required={label !== "Address line 2" && label !== "Alternate phone"}
        type={type}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
export function AdmissionList({ session }: { session: User }) {
  const query = useAdmissions();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const years = useAcademicYears();
  const programs = usePrograms();
  const remove = useAdmissionWorkflow();
  const classes = useClasses();
  const sections = useSections();
  const [, setLocation] = useLocation();

  const cancelAdmission = (id: string) => {
    if (
      !window.confirm(
        `Cancel this admission? The status will be set to Cancelled while preserving all financial and audit history.\nDo you want to proceed?`,
      )
    )
      return;
    remove.mutate(
      { id, action: "cancel" },
      {
        onSuccess: () => toast({ title: "Admission cancelled" }),
        onError: (error) =>
          toast({
            title: "Could not cancel admission",
            description: admissionErrorMessage(error, "Please try again."),
          }),
      },
    );
  };

  if (query.isLoading)
    return (
      <>
        <PageHeader title="Admissions" />
        <Loading />
      </>
    );
  if (query.isError)
    return (
      <Empty
        title="Could not load admissions"
        detail={admissionErrorMessage(
          query.error,
          "The admissions service is unavailable.",
        )}
      />
    );
  const rows = (query.data || [])
    .filter((item) => {
      console.log(item);

      const text = `${item.admissionNumber} ${item.studentName}`.toLowerCase();
      return (
        text.includes(search.toLowerCase()) &&
        (filter === "All" ||
          admissionStatusLabel(item.admissionStatus) === filter)
      );
    })
    .sort(compareAdmissions);
  const label = (id: string, values: Array<{ id: string; name: string }>) =>
    values.find((value) => value.id === id)?.name || "-";
  return (
    <>
      <PageHeader
        title="Admissions"
        description="Track applications from first contact to confirmation."
        action={
          hasPermission(session, "ADMISSION_CREATE") ? (
            <Link
              href="/admissions/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Plus size={16} />
              Add application
            </Link>
          ) : undefined
        }
      />
      <div className="list-toolbar">
        <SearchBox value={search} onChange={setSearch} />
        <SelectBox
          value={filter}
          onChange={setFilter}
          label="Status"
          options={["Pending", "Confirmed", "Cancelled"]}
        />
      </div>
      {rows.length === 0 ? (
        <Empty
          title="No admissions found"
          detail="Try a different search or clear the current filter."
        />
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Admission no.</th>
                  <th>Student</th>
                  <th>Academic placement</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        href={`/admissions/${item.id}`}
                        className="table-link"
                      >
                        {item.admissionNumber}
                      </Link>
                    </td>
                    <td>{item.studentName}</td>
                    <td>
                      {label(item.academicYearId, years.data || [])} ·{" "}
                      {label(item.programId, programs.data || [])} ·{" "}
                      {label(item.classId, classes.data || [])} ·{" "}
                      {label(item.sectionId, sections.data || [])}
                    </td>
                    <td>
                      <Status>
                        {admissionStatusLabel(item.admissionStatus)}
                      </Status>
                    </td>
                    <td className="row-actions">
                      <Link
                        href={`/admissions/${item.id}`}
                        className="icon-button"
                        title="Edit admission"
                      >
                        <Settings2 size={15} />
                      </Link>

                      {item.admissionStatus === "DRAFT" &&
                        hasPermission(session, "ADMISSION_UPDATE") && (
                          <button
                            type="button"
                            className="icon-button ml-3"
                            title="Cancel admission"
                            aria-label="Cancel admission"
                            onClick={() => cancelAdmission(item.id)}
                            disabled={remove.isPending}
                          >
                            <Trash2 color="red" size={15} />
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>
              Showing {rows.length} of {rows.length} records
            </span>
            <span className="table-foot-note">
              Click an admission to view details
            </span>
          </div>
        </div>
      )}
    </>
  );
}
export function AdmissionDetail({
  session,
  id,
}: {
  session: User;
  id: string;
}) {
  const query = useAdmission(id);
  const workflow = useAdmissionWorkflow();
  const [, setLocation] = useLocation();
  const years = useAcademicYears();
  const programs = usePrograms();
  const classes = useClasses();
  const sections = useSections();
  const [error, setError] = useState("");

  const concessionsQuery = useAdmissionConcessions(id);
  const feeConfigurationQuery = useAdmissionFeeConfiguration(id);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data)
    return (
      <Empty
        title="Admission not found"
        detail={admissionErrorMessage(
          query.error,
          "The requested admission could not be loaded.",
        )}
      />
    );
  const item = query.data;
  const config = feeConfigurationQuery.data;
  const concessionComponentByDetail = new Map(
    (concessionsQuery.data?.components || []).map((component) => [
      component.id,
      component,
    ]),
  );
  const displayComponents: AdmissionFeeDetailView[] = (
    config?.feePaymentHeader.feePaymentDetails || []
  ).map((detail) => {
    const concessionComponent = concessionComponentByDetail.get(detail.id);
    return {
      ...detail,
      name:
        detail.name ?? concessionComponent?.nameSnapshot ?? "Name unavailable",
      concession: concessionComponent?.concession ?? null,
    };
  });
  const feeDetails = config?.feePaymentHeader.feePaymentDetails || [];
  const isPaymentEligibleStatus =
    item.admissionStatus === "DRAFT" || item.admissionStatus === "CONFIRMED";
  const canCreateFees = hasPermission(session, "FEES_CREATE");
  const isFeeConfigLoading = Boolean(
    feeConfigurationQuery.isLoading && !config,
  );
  const isFeeConfigError = Boolean(feeConfigurationQuery.isError);
  const isPricingVersionSupported =
    config?.feePaymentHeader?.pricingVersion === "V0_SNAPSHOTTED";
  const isFeeConfigMissing = Boolean(
    !feeConfigurationQuery.isLoading &&
      !feeConfigurationQuery.isError &&
      !config,
  );
  const totalDueMinor = config
    ? parseMoneyMinor(
        config.feePaymentHeader.totalDueAmount ??
          config.feePaymentHeader.netAmount ??
          "0",
      ) ?? 0n
    : 0n;
  const hasDueBalance = totalDueMinor > 0n;

  const canCollectPayment =
    isPaymentEligibleStatus &&
    canCreateFees &&
    Boolean(config) &&
    isPricingVersionSupported &&
    hasDueBalance;

  let paymentFeedback: string | null = null;
  if (isPaymentEligibleStatus && canCreateFees && !canCollectPayment) {
    if (isFeeConfigLoading) {
      paymentFeedback = "Checking fee configuration for payment collection…";
    } else if (isFeeConfigError || isFeeConfigMissing) {
      paymentFeedback =
        "Payment collection is unavailable because fee configuration could not be verified.";
    } else if (!isPricingVersionSupported) {
      paymentFeedback =
        "Payment collection is unavailable: pricing version is missing or unsupported.";
    }
  }
  const label = (value: string, values: Array<{ id: string; name: string }>) =>
    values.find((entry) => entry.id === value)?.name || "-";
  const run = async (action: "confirm" | "cancel") => {
    if (
      !window.confirm(
        action === "confirm"
          ? "Confirming creates a real Student record. Continue?"
          : "Cancel this admission? This cannot be reopened here.",
      )
    )
      return;
    try {
      await workflow.mutateAsync({ id, action });
      toast({
        title:
          action === "confirm" ? "Admission confirmed" : "Admission cancelled",
      });
    } catch (reason) {
      setError(
        action === "confirm"
          ? confirmationErrorMessage(reason)
          : admissionErrorMessage(reason, "Could not update admission."),
      );
    }
  };
  const status = admissionStatusLabel(item.admissionStatus);
  return (
    <>
      <button
        className="back-link page-back"
        onClick={() => setLocation("/admissions")}
      >
        <ArrowLeft size={15} />
        Back to Admissions
      </button>
      <PageHeader
        title={item.studentName}
        description={`${item.admissionNumber} · ${status}`}
        action={
          <div className="detail-actions">
            <Link
              href={`/admissions/${id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"
            >
              <Settings2 size={15} />
              Edit
            </Link>
            {canCollectPayment && (
              <AppButton onClick={() => setPaymentDialogOpen(true)}>
                Collect Fee Payment
              </AppButton>
            )}
            {paymentFeedback && (
              <span
                className="text-xs text-muted-foreground self-center"
                role="status"
              >
                {paymentFeedback}
              </span>
            )}
            {status === "Pending" &&
              hasPermission(session, "ADMISSION_UPDATE") && (
                <>
                  <AppButton
                    variant="confirm"
                    // className="bg-green-300"
                    onClick={() => run("confirm")}
                    disabled={workflow.isPending}
                  >
                    <Check size={15} />
                    Confirm
                  </AppButton>
                </>
              )}
          </div>
        }
      />
      <section className="panel">
        <div className="panel-head">
          <h2>Admission Details</h2>
          <Status>{status}</Status>
        </div>
        <div className="detail-fields">
          {[
            ["Admission number", item.admissionNumber],
            ["Student name", item.studentName],
            ["Gender", item.gender],
            ["Date of birth", date(item.dateOfBirth)],
            ["Academic year", label(item.academicYearId, years.data || [])],
            ["Program", label(item.programId, programs?.data || [])],
            ["Class", label(item.classId, classes.data || [])],
            ["Section", label(item.sectionId, sections.data || [])],
            ["Parent", item.parentName],
            ["Parent relation", item.parentRelation],
            ["Parent phone", item.parentPhone],
            ["Parent email", item.parentEmail],
            [
              "Address",
              [
                item.addressLine1,
                item.addressLine2,
                item.city,
                item.state,
                item.country,
                item.pincode,
              ]
                .filter(Boolean)
                .join(", "),
            ],
          ].map(([key, value]) => (
            <div className="detail-field" key={key}>
              <span>{key}</span>
              <strong>{String(value || "-")}</strong>
            </div>
          ))}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {/* Fee Breakdown & Concession Management */}
      <section className="panel mt-6">
        <div className="panel-head flex items-center justify-between">
          <div>
            <h2>Fee Structure & Concessions</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {item.admissionStatus === "CONFIRMED"
                ? "Fee obligations are confirmed and frozen. Concessions cannot be altered."
                : "Authoritative snapshot of fee obligations and concessions."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {item.admissionStatus === "CONFIRMED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Check size={12} /> Obligations Frozen
              </span>
            ) : item.admissionStatus === "CANCELLED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border border-border">
                <X size={12} /> Admission Cancelled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Tag size={12} /> Draft Snapshot
              </span>
            )}
          </div>
        </div>

        {feeConfigurationQuery.isLoading && !config && (
          <p role="status">Loading fee configuration…</p>
        )}
        {feeConfigurationQuery.isFetching && config && (
          <p role="status">Refreshing fee configuration…</p>
        )}
        {feeConfigurationQuery.isError && (
          <p className="field-error" role="alert">
            {config
              ? "Fee configuration refresh failed; the displayed snapshot may be stale."
              : "Could not load fee configuration."}{" "}
            {readableErrorText(
              feeConfigurationQuery.error,
              "Please try again.",
            )}
          </p>
        )}
        {!feeConfigurationQuery.isLoading &&
          !feeConfigurationQuery.isError &&
          !config && <p role="alert">Fee configuration is unavailable.</p>}
        {concessionsQuery.isLoading && (
          <p role="status">Loading concession details…</p>
        )}
        {concessionsQuery.isFetching && concessionsQuery.data && (
          <p role="status">Refreshing concession details…</p>
        )}
        {concessionsQuery.isError && (
          <p className="field-error" role="alert">
            {concessionsQuery.data
              ? "Concession refresh failed; cached concession data may be stale."
              : "Could not load concession details."}{" "}
            {readableErrorText(concessionsQuery.error, "Please try again.")}
          </p>
        )}
        {!concessionsQuery.isLoading &&
          !concessionsQuery.isFetching &&
          !concessionsQuery.isError &&
          !concessionsQuery.data && (
            <p role="alert">Concession details are unavailable.</p>
          )}
        {/* {concessionsLoaded &&
          concessionsQuery.data?.components.every(
            (component) => !component.concession,
          ) && <p role="status">No concessions are assigned.</p>} */}
        {config && (
          <>
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs uppercase font-semibold text-muted-foreground">
                  Gross Fee Baseline
                </span>
                <div className="text-2xl font-bold mt-1 text-foreground">
                  {displayMoney(config?.feePaymentHeader.grossAmount)}
                </div>
                <span className="text-xs text-muted-foreground">
                  Before concessions
                </span>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs uppercase font-semibold text-amber-600">
                  Total Approved Concessions
                </span>
                <div className="text-2xl font-bold mt-1 text-amber-600">
                  - {displayMoney(config?.feePaymentHeader.discountAmount)}
                </div>
                <span className="text-xs text-muted-foreground">
                  Approved component reductions
                </span>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs uppercase font-semibold text-primary">
                  Net Payable Obligation
                </span>
                <div className="text-2xl font-bold mt-1 text-primary">
                  {displayMoney(config?.feePaymentHeader.netAmount)}
                </div>
                <span className="text-xs text-muted-foreground">
                  Frozen target for payments
                </span>
              </div>
            </div>

            {feeDetails.length === 0 ? (
              !feeConfigurationQuery.isError && (
                <p role="status">No fee snapshot details are available.</p>
              )
            ) : (
              <div className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fee Component</th>
                        <th>Classification</th>
                        <th className="text-right">Original Baseline</th>
                        <th>Status</th>
                        <th>Applied Concession</th>
                        <th className="text-right">Net Payable</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Balance Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayComponents.map((comp) => {
                        const isIncludedAndActive =
                          comp.isActive && comp.isIncluded;
                        const compNetMinor =
                          parseMoneyMinor(
                            isIncludedAndActive
                              ? (comp.totalAmountToBePaid ?? "0")
                              : "0",
                          ) ?? 0n;
                        const compPaidMinor =
                          parseMoneyMinor(comp.amountPaid ?? "0") ?? 0n;
                        const compDueMinor =
                          compNetMinor > compPaidMinor
                            ? compNetMinor - compPaidMinor
                            : 0n;
                        return (
                          <tr
                            key={comp.id}
                            className={
                              !isIncludedAndActive ? "bg-muted/30" : undefined
                            }
                          >
                            <td>
                              <div className="font-semibold text-foreground">
                                {comp.name}
                              </div>
                              {comp.description ? (
                                <div className="text-xs text-muted-foreground">
                                  {comp.description}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {comp.isMandatory ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                                  <Lock size={11} /> Mandatory
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  Optional
                                </span>
                              )}
                            </td>
                            <td className="text-right font-medium text-foreground">
                              {displayMoney(comp.originalAmount)}
                            </td>
                            <td>
                              {!comp.isActive ? (
                                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  Inactive
                                </span>
                              ) : comp.isIncluded ? (
                                <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                  Included
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  Excluded
                                </span>
                              )}
                            </td>
                            <td>
                              {!comp.isActive ? (
                                <span className="text-xs text-muted-foreground">
                                  Inactive snapshot
                                </span>
                              ) : !comp.isIncluded ? (
                                <span className="text-xs text-muted-foreground">
                                  Excluded
                                </span>
                              ) : concessionsQuery.isError &&
                                !comp.concession ? (
                                <span className="text-xs text-muted-foreground">
                                  Concession status unavailable
                                </span>
                              ) : (concessionsQuery.isLoading ||
                                  concessionsQuery.isFetching) &&
                                !comp.concession ? (
                                <span className="text-xs text-muted-foreground">
                                  Loading concession status…
                                </span>
                              ) : comp.concession ? (
                                <div className="flex flex-col">
                                  {comp.concession.requiresReview && (
                                    <span
                                      className="text-xs font-semibold text-amber-700"
                                      role="alert"
                                    >
                                      Review required
                                    </span>
                                  )}
                                  <span className="font-semibold text-emerald-700">
                                    {comp.concession.categoryName ??
                                      "Payable concession"}
                                    {comp.concession.discountType &&
                                      ` (${comp.concession.discountType === "PERCENTAGE" ? `${comp.concession.discountValue}%` : `₹${comp.concession.discountValue}`})`}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    -{" "}
                                    {displayMoney(
                                      comp.concession.calculatedDiscountAmount,
                                    )}
                                    {comp.concession.justification &&
                                      ` · ${comp.concession.justification}`}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">
                                  No concession
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              <strong className="text-foreground">
                                {displayMoney(
                                  isIncludedAndActive
                                    ? comp.totalAmountToBePaid
                                    : "0.00",
                                )}
                              </strong>
                            </td>
                            <td className="text-right text-muted-foreground">
                              {displayMoney(comp.amountPaid ?? "0.00")}
                            </td>
                            <td className="text-right font-medium text-foreground">
                              {displayMoney(
                                displayMinor(
                                  compDueMinor,
                                ),
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot flex items-center justify-between p-3 border-t border-border bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    {
                      displayComponents.filter(
                        (d) => d.isActive && d.isIncluded,
                      ).length
                    }{" "}
                    of {displayComponents.filter((d) => d.isActive).length}{" "}
                    active components included in billing snapshot.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <InstallmentScheduleCard
        admissionId={id}
        admissionStatus={item.admissionStatus}
        pricingVersion={config?.feePaymentHeader.pricingVersion}
        netAmount={config?.feePaymentHeader.netAmount}
        session={session}
      />

      <AdmissionPaymentHistoryCard
        admissionId={id}
        admissionStatus={item.admissionStatus}
        studentId={item.studentId}
        session={session}
      />

      {config && (
        <CollectAdmissionPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          admissionId={id}
          admissionNumber={item.admissionNumber}
          applicantName={item.studentName}
          feePaymentHeader={config.feePaymentHeader}
          session={session}
        />
      )}
    </>
  );
}
export function ParamBasicForm({
  resource,
  session,
}: {
  resource: BasicResource;
  session: User;
}) {
  const { id } = useParams();
  return resource === "admissions" ? (
    <AdmissionForm id={id} session={session} />
  ) : (
    <BasicForm resource={resource} id={id} session={session} />
  );
}
function studentLabel(id: string, values: Array<{ id: string; name: string }>) {
  return values.find((value) => value.id === id)?.name || "-";
}

/**
 * The Student.admission relation is required in the schema, but the backend
 * service still guards against a missing admission, so normalise it once here
 * instead of dereferencing it in every render. Unset ids fall through to
 * studentLabel() and render as "-".
 */
const EMPTY_PLACEMENT = {
  id: "",
  schoolId: "",
  academicYearId: "",
  programId: "",
  classId: "",
  sectionId: "",
};
const placementOf = (
  admission:
    | {
        id: string;
        schoolId: string;
        academicYearId: string;
        programId: string;
        classId: string;
        sectionId: string;
      }
    | null
    | undefined,
) => admission ?? EMPTY_PLACEMENT;
export function StudentList({ session }: { session: User }) {
  const query = useStudents();
  const [search, setSearch] = useState("");
  const years = useAcademicYears();
  const programs = usePrograms();
  const classes = useClasses();
  const sections = useSections();
  if (query.isLoading)
    return (
      <>
        <PageHeader title="Students" />
        <Loading />
      </>
    );
  if (query.isError)
    return (
      <Empty
        title="Could not load students"
        detail={studentErrorMessage(
          query.error,
          "The student service is unavailable.",
        )}
      />
    );
  const rows = (query.data || [])
    .map((student) => {
      const placement = placementOf(student.admission);
      return {
        student,
        year: studentLabel(placement.academicYearId, years.data || []),
        program: studentLabel(placement.programId, programs?.data || []),
        className: studentLabel(placement.classId, classes.data || []),
        section: studentLabel(placement.sectionId, sections.data || []),
      };
    })
    .filter(({ student, year, program, className, section }) =>
      `${student.studentNumber} ${student.studentName} ${student.admissionId} ${year} ${program} ${className} ${section}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <>
      <PageHeader
        title="Students"
        description="The enrolled student register from the real backend."
        action={
          hasPermission(session, "STUDENT_CREATE") ? (
            <Link
              href="/students/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"
            >
              Add student (legacy)
            </Link>
          ) : undefined
        }
      />
      <div className="list-toolbar">
        <SearchBox value={search} onChange={setSearch} />
        <span className="muted-note">{rows.length} records</span>
      </div>
      {rows.length === 0 ? (
        <Empty title="No students found" detail="Try a different search." />
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student number</th>
                  <th>Student</th>
                  <th>Academic year</th>
                  <th>Program</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Gender</th>
                  <th>Date of birth</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student, year, program, className, section }) => (
                  <tr key={student.id}>
                    <td>
                      <Link
                        href={`/students/${student.id}`}
                        className="table-link"
                      >
                        {student.studentNumber}
                      </Link>
                    </td>
                    <td>{student.studentName}</td>
                    <td>{year}</td>
                    <td>{program}</td>
                    <td>{className}</td>
                    <td>{section}</td>
                    <td>{student.gender}</td>
                    <td>{date(student.dateOfBirth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>
              Showing {rows.length} of {rows.length} records
            </span>
            <span className="table-foot-note">
              Click a student number to view details
            </span>
          </div>
        </div>
      )}
    </>
  );
}
export function StudentDetail({ id, session }: { id: string; session?: User }) {
  const query = useStudent(id);
  const fees = useStudentFees(id);
  const admission = useAdmission(query.data?.admissionId);
  const feeConfigurationQuery = useAdmissionFeeConfiguration(
    query.data?.admissionId,
  );
  const pricingVersion =
    feeConfigurationQuery.data?.feePaymentHeader?.pricingVersion;
  const isPricingVersionLoading =
    feeConfigurationQuery.isLoading && !feeConfigurationQuery.data;
  const [v0PaymentDialogOpen, setV0PaymentDialogOpen] = useState(false);
  const years = useAcademicYears();
  const programs = usePrograms();
  const classes = useClasses();
  const sections = useSections();
  const [, setLocation] = useLocation();
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const recordPayment = useRecordStudentFeePayment(id);
  const submitPayment = async () => {
    const outstanding = fees.data?.fee?.outstandingAmount ?? "0";
    if (validatePaymentAmount(paymentAmount, outstanding) === null) {
      toast({
        title: "Invalid payment",
        description:
          "Enter a positive amount with at most two decimals, not exceeding the outstanding balance.",
      });
      return;
    }
    try {
      await recordPayment.mutateAsync({
        amount: paymentAmount.trim(),
        paymentDate: paymentDate || undefined,
        idempotencyKey,
      });
      toast({
        title: "Payment recorded",
        description: "The student fee snapshot has been refreshed.",
      });
      setPaymentAmount("");
      setPaymentDate("");
      setIdempotencyKey(crypto.randomUUID());
    } catch (error) {
      toast({
        title: "Could not record payment",
        description: studentFeesErrorMessage(error, "Please try again later."),
      });
    }
  };
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data)
    return (
      <Empty
        title="Student not found"
        detail={studentErrorMessage(
          query.error,
          "The requested student could not be loaded.",
        )}
      />
    );
  const student = query.data;
  const placement = placementOf(student.admission);
  const admissionRecord = admission.data;
  const feeState = fees.data?.fee;
  const payments = fees.data?.payments || [];
  return (
    <>
      <button
        className="back-link page-back"
        onClick={() => setLocation("/students")}
      >
        <ArrowLeft size={15} />
        Back to Students
      </button>
      <PageHeader
        title={student.studentName}
        description={`${student.studentNumber} · Read-only backend record`}
      />
      <section className="panel">
        <div className="panel-head">
          <h2>Student details</h2>
        </div>
        <div className="detail-fields">
          {[
            ["Student number", student.studentNumber],
            ["Student sequence", String(student.studentSequence)],
            ["Student name", student.studentName],
            ["Gender", student.gender],
            ["Date of birth", date(student.dateOfBirth)],
            ["Created", date(student.createdAt)],
            ["Updated", date(student.updatedAt)],
            ["Admission number", admissionRecord?.admissionNumber],
            [
              "Admission status",
              admissionRecord
                ? admissionStatusLabel(admissionRecord.admissionStatus)
                : undefined,
            ],
            [
              "Academic year",
              studentLabel(placement.academicYearId, years.data || []),
            ],
            ["Program", studentLabel(placement.programId, programs.data || [])],
            ["Class", studentLabel(placement.classId, classes.data || [])],
            ["Section", studentLabel(placement.sectionId, sections.data || [])],
          ].map(([key, value]) => (
            <div className="detail-field" key={key}>
              <span>{key}</span>
              <strong>{String(value || "-")}</strong>
            </div>
          ))}
        </div>
        <p className="muted-note mt-5">
          Student records are read-only until the backend write contract is
          implemented.
        </p>
      </section>
      {fees.isLoading ? (
        <div className="mt-6">
          <Loading label="Loading fee snapshot" />
        </div>
      ) : fees.isError ? (
        <div className="mt-6">
          <Empty
            title="Could not load fee snapshot"
            detail={studentFeesErrorMessage(
              fees.error,
              "The live fee snapshot is unavailable.",
            )}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Student fee snapshot</div>
                <h2>
                  {feeState
                    ? feeState.totalAmount
                      ? money(feeAmount(feeState.totalAmount))
                      : "No fee snapshot"
                    : "No fee snapshot"}
                </h2>
              </div>
              {feeState && (
                <Status>
                  {feeState.outstandingAmount &&
                  Number(feeState.outstandingAmount) > 0
                    ? "Partial"
                    : "Paid"}
                </Status>
              )}
            </div>
            {feeState ? (
              <>
                <div className="detail-fields">
                  {[
                    ["Total amount", money(feeAmount(feeState.totalAmount))],
                    ["Paid amount", money(feeAmount(feeState.paidAmount))],
                    [
                      "Outstanding amount",
                      money(feeAmount(feeState.outstandingAmount)),
                    ],
                  ].map(([label, value]) => (
                    <div className="detail-field" key={label}>
                      <span>{label}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  {feeState.components.map((component) => (
                    <div
                      className={`payment-line ${component.isActive && component.isIncluded ? "" : "opacity-60"}`}
                      key={component.id}
                    >
                      <span>
                        <strong>{component.nameSnapshot}</strong>
                        <small>
                          {component.isMandatory ? "Mandatory" : "Optional"} ·{" "}
                          {component.discountApplicable
                            ? "Discountable"
                            : "Fixed"}
                          {!(component.isActive && component.isIncluded) &&
                            " · Historical / not currently payable"}
                        </small>
                      </span>
                      <div className="text-right">
                        <strong>
                          {money(feeAmount(component.finalAmount))}
                        </strong>
                        <small className="block text-muted-foreground">
                          Paid {money(feeAmount(component.amountPaid))} ·
                          Outstanding{" "}
                          {money(feeAmount(component.amountOutstanding))}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted-note mt-4">
                No live fee snapshot exists for this admission yet.
              </p>
            )}
            <StudentInstallmentScheduleCard
              admissionId={student.admissionId}
              session={session}
            />
          </section>
          <aside className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Record payment</div>
                <h2>
                  {pricingVersion === "V0_SNAPSHOTTED"
                    ? "Fee payment"
                    : "Quick payment"}
                </h2>
              </div>
            </div>
            {isPricingVersionLoading ||
            (query.data?.admissionId && pricingVersion === undefined) ? (
              <div className="p-4 text-xs text-muted-foreground">
                Resolving pricing version configuration…
              </div>
            ) : pricingVersion === "V0_SNAPSHOTTED" ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  This student uses V0 Structured Fees. Payments require
                  explicit component allocations.
                </div>
                {hasPermission(session, "FEES_CREATE") && (
                  <AppButton
                    onClick={() => setV0PaymentDialogOpen(true)}
                    disabled={
                      !feeConfigurationQuery.data ||
                      admission.data?.admissionStatus === "CANCELLED"
                    }
                    className="w-full"
                  >
                    Collect Fee Payment (V0)
                  </AppButton>
                )}
                {query.data?.admissionId && (
                  <AppButton
                    variant="ghost"
                    onClick={() =>
                      setLocation(`/admissions/${query.data.admissionId}`)
                    }
                    className="w-full text-xs"
                  >
                    View Admission Record
                  </AppButton>
                )}
                {payments.length > 0 && (
                  <div className="mt-4">
                    <div className="eyebrow">Recent payments</div>
                    <div className="space-y-3 mt-2">
                      {payments.slice(0, 5).map((payment) => (
                        <div className="payment-line" key={payment.id}>
                          <span>
                            <strong>{money(feeAmount(payment.amount))}</strong>
                            <small>
                              {payment.paymentDate
                                ? date(payment.paymentDate)
                                : "No date"}
                            </small>
                          </span>
                          <small className="text-muted-foreground">
                            {payment.createdAt ? date(payment.createdAt) : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {feeConfigurationQuery.data && query.data?.admissionId && (
                  <CollectAdmissionPaymentDialog
                    open={v0PaymentDialogOpen}
                    onOpenChange={setV0PaymentDialogOpen}
                    admissionId={query.data.admissionId}
                    studentId={id}
                    feePaymentHeader={
                      feeConfigurationQuery.data.feePaymentHeader
                    }
                    session={session}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="field">
                  <label htmlFor="student-fee-amount">Amount (INR)</label>
                  <input
                    id="student-fee-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="student-fee-date">Payment date</label>
                  <input
                    id="student-fee-date"
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                  />
                </div>
                <AppButton
                  onClick={submitPayment}
                  disabled={recordPayment.isPending || !feeState}
                  className="w-full"
                >
                  {recordPayment.isPending ? "Recording…" : "Record payment"}
                </AppButton>
                {payments.length > 0 && (
                  <div className="mt-4">
                    <div className="eyebrow">Recent payments</div>
                    <div className="space-y-3 mt-2">
                      {payments.slice(0, 5).map((payment) => (
                        <div className="payment-line" key={payment.id}>
                          <span>
                            <strong>{money(feeAmount(payment.amount))}</strong>
                            <small>
                              {payment.paymentDate
                                ? date(payment.paymentDate)
                                : "No date"}
                            </small>
                          </span>
                          <small className="text-muted-foreground">
                            {payment.createdAt ? date(payment.createdAt) : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
export function AdmissionDetailWithStudent({
  id,
  session,
}: {
  id: string;
  session: User;
}) {
  const query = useAdmission(id);
  return (
    <>
      <AdmissionDetail id={id} session={session} />
      {query.data?.student?.id && (
        <div className="mt-4">
          <Link
            href={`/students/${query.data.student.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
          >
            View Student
          </Link>
        </div>
      )}
    </>
  );
}
export function ParamBasicDetail({
  resource,
  session,
}: {
  resource: BasicResource;
  session: User;
}) {
  const { id } = useParams();
  return resource === "admissions" ? (
    <AdmissionDetailWithStudent id={id || ""} session={session} />
  ) : resource === "students" ? (
    <StudentDetail id={id || ""} session={session} />
  ) : (
    <BasicDetail resource={resource} id={id || ""} session={session} />
  );
}
