import { useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, CircleDollarSign, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { academicYearErrorMessage, useAcademicYears } from "@/lib/academic-years-api";
import { classErrorMessage, useClasses } from "@/lib/classes-api";
import { queryClient } from "@/lib/query-client";
import { programErrorMessage, usePrograms } from "@/lib/programs-api";
import { feeErrorMessage, useCreateFeeComponent, useCreateFeeStructure, useDeactivateFeeComponent, useDeactivateFeeStructure, useFeeComponent, useFeeComponents, useFeeStructure, useFeeStructures, useUpdateFeeComponent, useUpdateFeeStructure, type FeeStructureCreateRequest } from "@/lib/fees-api";
import { buildFeeComponentPayload, formatFeeMinorUnits, formatFeeMoney, isPositiveFeeMoney, sumFeeMoneyMinorUnits } from "@/lib/fee-money";
import { type FeeComponent, type Permission, type User, hasPermission, useDeleteResource, useResource } from "@/lib/mock-erp";
import { AccessState, AppButton, Empty, Loading, PageHeader, SearchBox, Status, money } from "@/pages/page-primitives";
import { Field, SelectField } from "@/pages/academic-pages";
const feeSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().min(5, "Description is required"),
  academicYearId: z.string().min(1, "Choose an academic year"),
  programId: z.string().min(1, "Choose a programme"),
  classId: z.string().min(1, "Choose a class"),
  feeComponents: z.array(z.object({
    name: z.string().refine((value) => value.trim().length > 0, "Component name is required."),
    amount: z.string().refine(isPositiveFeeMoney, "Enter an amount greater than zero with at most two decimal places."),
    isMandatory: z.boolean(),
    discountApplicable: z.boolean(),
  })).optional(),
}).superRefine(({ feeComponents }, context) => {
  const seen = new Set<string>();
  feeComponents?.forEach((component, index) => {
    if (seen.has(component.name)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["feeComponents", index, "name"], message: "Component names must be unique within this fee structure." });
    }
    seen.add(component.name);
  });
});
type FeeFormValues = z.infer<typeof feeSchema>;
export function RealFeesPage({ session }: { session: User }) {
  const query = useFeeStructures(); const [search, setSearch] = useState(""); const canCreate = hasPermission(session, "FEES_CREATE");
  if (query.isLoading) return <><PageHeader title="Fee Structure Master" /><Loading /></>;
  if (query.isError) return <><PageHeader title="Fee Structure Master" /><Empty title="Could not load fee structures" detail={feeErrorMessage(query.error, "The fee structure service is unavailable.")} action={<AppButton onClick={() => query.refetch()}>Try again</AppButton>} /></>;
  const rows = (query.data || []).filter((item) => `${item.name} ${item.academicYear?.name || ""} ${item.program?.name || ""} ${item.class?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader title="Fee Structure Master" description="Active fee configuration from the real backend." action={canCreate && <Link href="/fees/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add fee structure</Link>} /><div className="list-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search fee structures" /><Link href="/fee-components" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><CircleDollarSign size={16} />Fee Components</Link></div>{rows.length === 0 ? <Empty title="No fee structures found" detail={search ? "Try a different search." : "No active fee structures are available."} /> : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Academic year</th><th>Programme</th><th>Class</th><th>Total amount</th><th>Components</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/fees/${row.id}`} className="table-link"><strong>{row.name}</strong><small className="block text-muted-foreground">{row.description || "No description"}</small></Link></td><td>{row.academicYear?.name || '—'}</td><td>{row.program?.name || '—'}</td><td>{row.class?.name || '—'}</td><td className="amount-positive">{formatFeeMoney(row.totalAmount)}</td><td>{row.feeComponents.length}</td><td><Status>{row.isActive ? "Active" : "Inactive"}</Status></td></tr>)}</tbody></table></div><div className="table-foot"><span>{rows.length} active fee structures</span><span className="table-foot-note">Real backend records</span></div></div>}</>;
}
export function RealFeeDetail({ id, session }: { id: string; session: User }) {
  const query = useFeeStructure(id); const deactivate = useDeactivateFeeStructure(); const [, setLocation] = useLocation(); const canUpdate = hasPermission(session, "FEES_UPDATE"); const canCreate = hasPermission(session, "FEES_CREATE");
  if (query.isLoading) return <Loading />;
  if (query.isError) return <Empty title="Could not load fee structure" detail={feeErrorMessage(query.error, "The fee structure could not be loaded.")} action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;
  const item = query.data;
  if (!item) return <Empty title="Fee structure not found" detail="The requested fee structure is unavailable." action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;
  const deactivateMaster = async () => {
    if (!window.confirm("Deactivate this fee structure? Historical fee references will be retained. Continue?")) return;
    try {
      await deactivate.mutateAsync(id);
      toast({ title: "Fee structure deactivated" });
      setLocation("/fees");
    } catch (error) {
      toast({ title: "Could not deactivate fee structure", description: feeErrorMessage(error, "Please try again.") });
    }
  };
  return <><button className="back-link page-back" onClick={() => setLocation("/fees")}><ArrowLeft size={15} />Back to Fee Structure Master</button><PageHeader eyebrow="Fee Structure Master" title={item.name} description={`${item.academicYear?.name || '—'} · ${item.program?.name || '—'} · ${item.class?.name || '—'}`} action={<div className="detail-actions">{item.isActive && canUpdate && <Link href={`/fees/${id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Settings2 size={15} />Edit fee structure</Link>}{item.isActive && canCreate && <Link href={`/fee-components/new?feeStructureId=${id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={15} />Add fee component</Link>}{item.isActive && canUpdate && <AppButton type="button" variant="danger" onClick={deactivateMaster} disabled={deactivate.isPending}>{deactivate.isPending ? "Deactivating…" : "Deactivate"}<Trash2 size={15} /></AppButton>}</div>} /><div className="detail-grid"><section className="panel detail-panel"><div className="panel-head"><div><div className="eyebrow">Annual fee master</div><h2>{formatFeeMoney(item.totalAmount)}</h2></div><Status>{item.isActive ? "Active" : "Inactive"}</Status></div><div className="detail-fields">{[["Description", item.description || "—"], ["Academic year", item.academicYear?.name || '—'], ["Programme / shift", item.program?.name || '—'], ["Class", item.class?.name || '—'], ["Total amount", formatFeeMoney(item.totalAmount)]].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section><aside className="panel mini-panel"><div className="panel-head p-0 border-0"><div><div className="eyebrow">Fee components</div><h2>{item.feeComponents.length} line items</h2></div></div>{item.feeComponents.map((component) => <div className="payment-line" key={component.id}><span><strong>{component.name}</strong><small>{component.isMandatory ? "Mandatory" : "Optional"}{component.discountApplicable ? " · Discountable" : " · Fixed"} · {component.isActive ? "Active" : "Inactive"}</small></span><strong>{formatFeeMoney(component.amount)}</strong></div>)}{item.feeComponents.length === 0 && <p>No fee components are attached.</p>}</aside></div></>;
}
export function RealFeeComponentsPage({ session }: { session: User }) {
  const query = useFeeComponents(); const structures = useFeeStructures(); const canCreate = hasPermission(session, "FEES_CREATE");
  if (query.isLoading || structures.isLoading) return <><PageHeader title="Fee Components" /><Loading /></>;
  if (query.isError || structures.isError) return <><PageHeader title="Fee Components" /><Empty title="Could not load fee components" detail={feeErrorMessage(query.error || structures.error, "The fee component service is unavailable.")} action={<AppButton onClick={() => { query.refetch(); structures.refetch(); }}>Try again</AppButton>} /></>;
  const structureNames = new Map((structures.data || []).map((structure) => [structure.id, structure.name])); const rows = query.data || [];
  return <><PageHeader eyebrow="Fee Structure Master" title="Fee Components" description="Active line items from the real backend." action={canCreate && <Link href="/fee-components/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add fee component</Link>} /><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Component</th><th>Fee structure</th><th>Amount</th><th>Required</th><th>Status</th></tr></thead><tbody>{rows.map((component) => <tr key={component.id}><td><Link href={`/fee-components/${component.id}`} className="table-link"><strong>{component.name}</strong><small className="block text-muted-foreground">{component.description || "No description"}</small></Link></td><td>{structureNames.get(component.feeStructureId) || '—'}</td><td className="amount-positive">{formatFeeMoney(component.amount)}</td><td>{component.isMandatory ? "Mandatory" : "Optional"}</td><td><Status>{component.isActive ? "Active" : "Inactive"}</Status></td></tr>)}</tbody></table></div><div className="table-foot"><span>{rows.length} active components</span><Link href="/fees" className="table-foot-note">Back to fee structures</Link></div></div></>;
}
export function RealFeeComponentDetail({ id, session }: { id: string; session: User }) {
  const query = useFeeComponent(id); const deactivate = useDeactivateFeeComponent(); const structure = useFeeStructure(query.data?.feeStructureId); const [, setLocation] = useLocation(); const canUpdate = hasPermission(session, "FEES_UPDATE");
  if (query.isLoading || structure.isLoading) return <Loading />;
  if (query.isError) return <Empty title="Could not load fee component" detail={feeErrorMessage(query.error, "The fee component could not be loaded.")} action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  if (structure.isError) return <Empty title="Could not load parent fee structure" detail={feeErrorMessage(structure.error, "The parent fee structure could not be loaded.")} action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  const item = query.data;
  if (!item) return <Empty title="Fee component not found" detail="The requested fee component is unavailable." action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  const deactivateComponent = async () => {
    if (!window.confirm("Deactivate this fee component? Historical fee references will be retained. Continue?")) return;
    try {
      await deactivate.mutateAsync(id);
      toast({ title: "Fee component deactivated" });
      setLocation(`/fees/${item.feeStructureId}`);
    } catch (error) {
      toast({ title: "Could not deactivate fee component", description: feeErrorMessage(error, "Please try again.") });
    }
  };
  return <><button className="back-link page-back" onClick={() => setLocation("/fee-components")}><ArrowLeft size={15} />Back to Fee Components</button><PageHeader eyebrow="Fee component" title={item.name} description={item.description || "Real backend fee component"} action={<div className="detail-actions">{item.isActive && canUpdate && <Link href={`/fee-components/${id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Settings2 size={15} />Edit fee component</Link>}{item.isActive && canUpdate && <AppButton type="button" variant="danger" onClick={deactivateComponent} disabled={deactivate.isPending}>{deactivate.isPending ? "Deactivating…" : "Deactivate"}<Trash2 size={15} /></AppButton>}</div>} /><div className="panel detail-panel"><div className="detail-fields">{[["Amount", formatFeeMoney(item.amount)], ["Fee structure", structure.data?.name || '—'], ["Mandatory", item.isMandatory ? "Yes" : "No"], ["Status", item.isActive ? "Active" : "Inactive"]].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></>;
}
export function FeeForm({ id, session }: { id?: string; session: User }) {
  const editing = Boolean(id);
  const query = useFeeStructure(id);
  const years = useAcademicYears();
  const programs = usePrograms();
  const classes = useClasses();
  const create = useCreateFeeStructure();
  const update = useUpdateFeeStructure();
  const [, setLocation] = useLocation();
  const canEdit = hasPermission(session, editing ? "FEES_UPDATE" : "FEES_CREATE");
  const form = useForm<FeeFormValues>({
    resolver: zodResolver(feeSchema),
    defaultValues: { name: "", description: "", academicYearId: "", programId: "", classId: "", feeComponents: [{ name: "", amount: "", isMandatory: true, discountApplicable: false }] },
  });
  const feeComponents = useFieldArray({ control: form.control, name: "feeComponents" });
  const watchedComponents = useWatch({ control: form.control, name: "feeComponents" });
  const academicYearId = form.watch("academicYearId");
  const programId = form.watch("programId");
  const filteredPrograms = (programs.data || []).filter((program) => program.academicYearId === academicYearId);
  const filteredClasses = (classes.data || []).filter((item) => item.programId === programId);
  const previewTotal = !editing && watchedComponents?.length && watchedComponents.every((component) => isPositiveFeeMoney(component.amount))
    ? sumFeeMoneyMinorUnits(watchedComponents.map((component) => component.amount))
    : null;

  useEffect(() => {
    if (!query.data) return;
    form.reset({
      name: query.data.name,
      description: query.data.description || "",
      academicYearId: query.data.academicYearId,
      programId: query.data.programId,
      classId: query.data.classId,
      feeComponents: [],
    });
  }, [query.data, form]);

  if (!canEdit) return <AccessState role={session.role} />;
  if (years.isLoading || programs.isLoading || classes.isLoading || (editing && query.isLoading)) return <Loading />;
  if (years.isError || programs.isError || classes.isError) return <Empty title="Could not load fee form options" detail={years.isError ? academicYearErrorMessage(years.error, "Academic years could not be loaded.") : programs.isError ? programErrorMessage(programs.error, "Programs could not be loaded.") : classErrorMessage(classes.error, "Classes could not be loaded.")} action={<AppButton onClick={() => { years.refetch(); programs.refetch(); classes.refetch(); }}>Try again</AppButton>} />;
  if (editing && query.isError) return <Empty title="Could not load fee structure" detail={feeErrorMessage(query.error, "The fee structure could not be loaded.")} action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;
  if (editing && query.data && !query.data.isActive) return <Empty title="Inactive fee structure" detail="This fee structure is inactive and cannot be edited." action={<Link href={`/fees/${id}`} className="text-button">View fee structure</Link>} />;

  const submit = async (values: FeeFormValues) => {
    if (!editing && !values.feeComponents?.length) {
      form.setError("feeComponents", { type: "required", message: "Add at least one fee component." });
      return;
    }
    const payload = {
      name: values.name,
      description: values.description,
      academicYearId: values.academicYearId,
      programId: values.programId,
      classId: values.classId,
      feeComponents: (values.feeComponents || []).map((component) => ({
        name: component.name,
        amount: component.amount,
        isMandatory: component.isMandatory,
        discountApplicable: component.discountApplicable,
      })),
    } satisfies FeeStructureCreateRequest;

    try {
      if (editing && id) {
        await update.mutateAsync({ id, payload: { name: payload.name, description: payload.description } });
        toast({ title: "Fee structure updated", description: "The fee master is ready for components." });
        setLocation(`/fees/${id}`);
      } else {
        const saved = await create.mutateAsync(payload);
        toast({ title: "Fee structure created", description: `Backend total: ${formatFeeMoney(saved.totalAmount)}.` });
        setLocation(`/fees/${saved.id}`);
      }
    } catch (error) {
      toast({ title: "Could not save fee structure", description: feeErrorMessage(error, "Please try again.") });
    }
  };

  return (
    <>
      <button className="back-link page-back" onClick={() => setLocation(id ? `/fees/${id}` : "/fees")}>
        <ArrowLeft size={15} />Back to Fee Structure Master
      </button>
      <PageHeader
        eyebrow={editing ? "Edit fee master" : "New fee master"}
        title={editing ? "Edit fee structure" : "Add fee structure"}
        description="Define the academic scope before adding fee components."
      />
      <form
        className="form-card"
        onSubmit={form.handleSubmit(submit, () => toast({ title: "Check the form" }))}
      >
        <div className="form-grid">
          <Field form={form} name="name" label="Name" />
          {editing && query.data ? (
            <>
              <div className="field"><span>Academic year</span><strong>{query.data.academicYear?.name || query.data.academicYearId}</strong></div>
              <div className="field"><span>Program</span><strong>{query.data.program?.name || query.data.programId}</strong></div>
              <div className="field"><span>Class</span><strong>{query.data.class?.name || query.data.classId}</strong></div>
            </>
          ) : (
            <>
              <SelectField
                form={form}
                name="academicYearId"
                label="Academic year"
                options={[["", "Select academic year"], ...(years.data || []).map((item) => [item.id, item.name])]}
                onChange={() => { form.setValue("programId", ""); form.setValue("classId", ""); }}
              />
              <SelectField
                form={form}
                name="programId"
                label="Programme / shift"
                options={[["", "Select program"], ...filteredPrograms.map((item) => [item.id, item.name])]}
                disabled={!academicYearId}
                onChange={() => form.setValue("classId", "")}
              />
              <SelectField
                form={form}
                name="classId"
                label="Class"
                options={[["", "Select class"], ...filteredClasses.map((item) => [item.id, item.name])]}
                disabled={!programId}
              />
            </>
          )}
          <div className="field field-wide">
            <label htmlFor="description">Description</label>
            <textarea id="description" rows={4} {...form.register("description")} />
            {form.formState.errors.description && <span className="field-error">{String(form.formState.errors.description.message)}</span>}
          </div>
        </div>
        {!editing && (
          <section className="mt-6 space-y-4" aria-label="Fee components">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Fee components</h2>
              <AppButton type="button" variant="ghost" onClick={() => { feeComponents.append({ name: "", amount: "", isMandatory: true, discountApplicable: false }); form.clearErrors("feeComponents"); }}>
                <Plus size={15} />Add component
              </AppButton>
            </div>
            {feeComponents.fields.map((field, index) => (
              <div className="form-grid rounded-lg border border-border p-4" key={field.id}>
                <div className="field">
                  <label htmlFor={`feeComponents.${index}.name`}>Component name</label>
                  <input id={`feeComponents.${index}.name`} {...form.register(`feeComponents.${index}.name`)} />
                  {form.formState.errors.feeComponents?.[index]?.name && <span className="field-error">{String(form.formState.errors.feeComponents[index]?.name?.message)}</span>}
                </div>
                <div className="field">
                  <label htmlFor={`feeComponents.${index}.amount`}>Amount (INR)</label>
                  <input id={`feeComponents.${index}.amount`} type="text" inputMode="decimal" {...form.register(`feeComponents.${index}.amount`)} />
                  {form.formState.errors.feeComponents?.[index]?.amount && <span className="field-error">{String(form.formState.errors.feeComponents[index]?.amount?.message)}</span>}
                </div>
                <label className="field flex-row"><input type="checkbox" {...form.register(`feeComponents.${index}.isMandatory`)} />Mandatory</label>
                <label className="field flex-row"><input type="checkbox" {...form.register(`feeComponents.${index}.discountApplicable`)} />Discount applicable</label>
                <div className="form-actions">
                  <AppButton type="button" variant="ghost" onClick={() => { feeComponents.remove(index); if (feeComponents.fields.length === 1) form.setError("feeComponents", { type: "required", message: "Add at least one fee component." }); }}>
                    Remove component<X size={15} />
                  </AppButton>
                </div>
              </div>
            ))}
            {form.formState.errors.feeComponents?.message && <span className="field-error">{String(form.formState.errors.feeComponents.message)}</span>}
            {previewTotal !== null && <p role="status" className="font-semibold">Preview total: {formatFeeMinorUnits(previewTotal)}</p>}
          </section>
        )}
        <div className="form-actions">
          <AppButton type="button" variant="ghost" onClick={() => setLocation(id ? `/fees/${id}` : "/fees")}>Cancel</AppButton>
          <AppButton type="submit" disabled={create.isPending || update.isPending}>
            {create.isPending || update.isPending ? "Saving…" : editing ? "Save changes" : "Create fee structure"}
            <ArrowRight size={16} />
          </AppButton>
        </div>
      </form>
    </>
  );
}


const componentSchema = z.object({ name: z.string().min(2, "Name is required"), description: z.string().min(5, "Description is required"), amount: z.string().refine(isPositiveFeeMoney, "Enter a positive amount with at most two decimal places."), feeStructureId: z.string().min(1, "Choose a fee structure"), discountApplicable: z.string(), isMandatory: z.string() });
type ComponentFormValues = z.infer<typeof componentSchema>;
export function FeeComponentForm({ id, session }: { id?: string; session: User }) {
  const editing = Boolean(id);
  const query = useFeeComponent(id);
  const structures = useFeeStructures();
  const create = useCreateFeeComponent();
  const update = useUpdateFeeComponent();
  const [, setLocation] = useLocation();
  const canEdit = hasPermission(session, editing ? "FEES_UPDATE" : "FEES_CREATE");
  const form = useForm<ComponentFormValues>({
    resolver: zodResolver(componentSchema),
    defaultValues: { name: "", description: "", amount: "", feeStructureId: new URLSearchParams(window.location.search).get("feeStructureId") || "", discountApplicable: "false", isMandatory: "true" },
  });

  useEffect(() => {
    if (!query.data) return;
    form.reset({
      name: query.data.name,
      description: query.data.description || "",
      amount: query.data.amount,
      feeStructureId: query.data.feeStructureId,
      discountApplicable: String(query.data.discountApplicable),
      isMandatory: String(query.data.isMandatory),
    });
  }, [query.data, form]);

  if (!canEdit) return <AccessState role={session.role} />;
  if (editing && query.isLoading) return <Loading />;
  if (editing && query.isError) return <Empty title="Could not load fee component" detail={feeErrorMessage(query.error, "The fee component could not be loaded.")} action={<Link href="/fee-components" className="text-button">Back to fee components</Link>} />;
  if (editing && query.data && !query.data.isActive) return <Empty title="Inactive fee component" detail="This fee component is inactive and cannot be edited." action={<Link href={`/fees/${query.data.feeStructureId}`} className="text-button">View fee structure</Link>} />;

  const submit = async (values: ComponentFormValues) => {
    const payload = {
      name: values.name,
      description: values.description,
      amount: values.amount,
      feeStructureId: values.feeStructureId,
      discountApplicable: values.discountApplicable === "true",
      isMandatory: values.isMandatory === "true",
    };
    const feeComponentPayload = buildFeeComponentPayload(payload);
    if (!feeComponentPayload) return;

    try {
      if (editing && id) {
        await update.mutateAsync({ id, payload: { name: feeComponentPayload.name, description: feeComponentPayload.description, amount: feeComponentPayload.amount, discountApplicable: feeComponentPayload.discountApplicable, isMandatory: feeComponentPayload.isMandatory } });
        toast({ title: "Fee component updated", description: "The component has been saved." });
      } else {
        await create.mutateAsync(feeComponentPayload);
        toast({ title: "Fee component created", description: "The component has been added to the fee master." });
      }
      setLocation("/fee-components");
    } catch (error) {
      toast({ title: editing ? "Could not update fee component" : "Could not create fee component", description: feeErrorMessage(error, "Please try again.") });
    }
  };

  return <><button className="back-link page-back" onClick={() => setLocation("/fee-components")}><ArrowLeft size={15} />Back to Fee Components</button><PageHeader eyebrow={editing ? "Edit fee component" : "New fee component"} title={editing ? "Edit component" : "Add fee component"} description="Associate each charge with a fee structure master." /><form className="form-card" onSubmit={form.handleSubmit(submit, () => toast({ title: "Check the form" }))}><div className="form-grid"><Field form={form} name="name" label="Name" /><div className="field"><label htmlFor="amount">Amount (INR)</label><input id="amount" type="text" inputMode="decimal" {...form.register("amount")} />{form.formState.errors.amount && <span className="field-error">{String(form.formState.errors.amount.message)}</span>}</div><SelectField form={form} name="feeStructureId" label="Fee structure" options={(structures.data || []).map((item) => [item.id, item.name])} /><SelectField form={form} name="discountApplicable" label="Discount applicable" options={[["true", "Yes"], ["false", "No"]]} /><SelectField form={form} name="isMandatory" label="Mandatory" options={[["true", "Mandatory"], ["false", "Optional"]]} /><div className="field field-wide"><label htmlFor="description">Description</label><textarea id="description" rows={4} {...form.register("description")} /></div></div><div className="form-actions"><AppButton type="button" variant="ghost" onClick={() => setLocation("/fee-components")}>Cancel</AppButton><AppButton type="submit" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving…" : editing ? "Save changes" : "Create component"}<ArrowRight size={16} /></AppButton></div></form></>;
}
