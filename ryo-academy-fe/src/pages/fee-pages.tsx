import { useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, CircleDollarSign, Plus, Settings2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAcademicYears } from "@/lib/academic-years-api";
import { useClasses } from "@/lib/classes-api";
import { usePrograms } from "@/lib/programs-api";
import { feeAmount, feeErrorMessage, useCreateFeeComponent, useCreateFeeStructure, useDeactivateFeeComponent, useDeactivateFeeStructure, useFeeComponent, useFeeComponents, useFeeStructure, useFeeStructures, useUpdateFeeComponent, useUpdateFeeStructure, type FeeComponentCreateRequest, type FeeComponentResponse, type FeeComponentUpdateRequest, type FeeStructureCreateRequest, type FeeStructureResponse, type FeeStructureUpdateRequest } from "@/lib/fees-api";
import { type FeeComponent, type Permission, type User, hasPermission, useDeleteResource, useResource } from "@/lib/mock-erp";
import { AccessState, AppButton, Empty, Loading, PageHeader, SearchBox, Status, money } from "@/pages/page-primitives";
import { Field, SelectField } from "@/pages/academic-pages";
const feeSchema = z.object({ name: z.string().min(2, "Name is required"), description: z.string().min(5, "Description is required"), academicYearId: z.string().min(1, "Choose an academic year"), programId: z.string().min(1, "Choose a programme"), classId: z.string().min(1, "Choose a class"), totalAmount: z.coerce.number().min(1, "Amount is required") });
export function RealFeesPage({ session }: { session: User }) {
  const query = useFeeStructures(); const [search, setSearch] = useState(""); const canCreate = hasPermission(session.role, "FEES_CREATE");
  if (query.isLoading) return <><PageHeader title="Fee Structure Master" /><Loading /></>;
  if (query.isError) return <><PageHeader title="Fee Structure Master" /><Empty title="Could not load fee structures" detail={feeErrorMessage(query.error, "The fee structure service is unavailable.")} action={<AppButton onClick={() => query.refetch()}>Try again</AppButton>} /></>;
  const rows = (query.data || []).filter((item) => `${item.name} ${item.academicYear?.name || ""} ${item.program?.name || ""} ${item.class?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader title="Fee Structure Master" description="Active fee configuration from the real backend." action={canCreate && <Link href="/fees/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add fee structure</Link>} /><div className="list-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search fee structures" /><Link href="/fee-components" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><CircleDollarSign size={16} />Fee Components</Link></div>{rows.length === 0 ? <Empty title="No fee structures found" detail={search ? "Try a different search." : "No active fee structures are available."} /> : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Academic year</th><th>Programme</th><th>Class</th><th>Total amount</th><th>Components</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/fees/${row.id}`} className="table-link"><strong>{row.name}</strong><small className="block text-muted-foreground">{row.description || "No description"}</small></Link></td><td>{row.academicYear?.name || row.academicYearId}</td><td>{row.program?.name || row.programId}</td><td>{row.class?.name || row.classId}</td><td className="amount-positive">{money(feeAmount(row.totalAmount))}</td><td>{row.feeComponents.length}</td><td><Status>{row.isActive ? "Active" : "Inactive"}</Status></td></tr>)}</tbody></table></div><div className="table-foot"><span>{rows.length} active fee structures</span><span className="table-foot-note">Real backend records</span></div></div>}</>;
}
export function RealFeeDetail({ id, session }: { id: string; session: User }) {
  const query = useFeeStructure(id); const [, setLocation] = useLocation(); const canUpdate = hasPermission(session.role, "FEES_UPDATE"); const canCreate = hasPermission(session.role, "FEES_CREATE");
  if (query.isLoading) return <Loading />;
  if (query.isError) return <Empty title="Could not load fee structure" detail={feeErrorMessage(query.error, "The fee structure could not be loaded.")} action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;
  const item = query.data;
  if (!item) return <Empty title="Fee structure not found" detail="The requested fee structure is unavailable." action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;
  return <><button className="back-link page-back" onClick={() => setLocation("/fees")}><ArrowLeft size={15} />Back to Fee Structure Master</button><PageHeader eyebrow="Fee Structure Master" title={item.name} description={`${item.academicYear?.name || item.academicYearId} · ${item.program?.name || item.programId} · ${item.class?.name || item.classId}`} action={<div className="detail-actions">{canUpdate && <Link href={`/fees/${id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Settings2 size={15} />Edit fee structure</Link>}{canCreate && <Link href={`/fee-components/new?feeStructureId=${id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={15} />Add fee component</Link>}</div>} /><div className="detail-grid"><section className="panel detail-panel"><div className="panel-head"><div><div className="eyebrow">Annual fee master</div><h2>{money(feeAmount(item.totalAmount))}</h2></div><Status>{item.isActive ? "Active" : "Inactive"}</Status></div><div className="detail-fields">{[["Description", item.description || "—"], ["Academic year", item.academicYear?.name || item.academicYearId], ["Programme / shift", item.program?.name || item.programId], ["Class", item.class?.name || item.classId], ["Total amount", money(feeAmount(item.totalAmount))]].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section><aside className="panel mini-panel"><div className="panel-head p-0 border-0"><div><div className="eyebrow">Active fee components</div><h2>{item.feeComponents.length} line items</h2></div></div>{item.feeComponents.map((component) => <div className="payment-line" key={component.id}><span><strong>{component.name}</strong><small>{component.isMandatory ? "Mandatory" : "Optional"}{component.discountApplicable ? " · Discountable" : " · Fixed"}</small></span><strong>{money(feeAmount(component.amount))}</strong></div>)}{item.feeComponents.length === 0 && <p>No active components are attached.</p>}</aside></div></>;
}
export function RealFeeComponentsPage({ session }: { session: User }) {
  const query = useFeeComponents(); const structures = useFeeStructures(); const canCreate = hasPermission(session.role, "FEES_CREATE");
  if (query.isLoading || structures.isLoading) return <><PageHeader title="Fee Components" /><Loading /></>;
  if (query.isError || structures.isError) return <><PageHeader title="Fee Components" /><Empty title="Could not load fee components" detail={feeErrorMessage(query.error || structures.error, "The fee component service is unavailable.")} action={<AppButton onClick={() => { query.refetch(); structures.refetch(); }}>Try again</AppButton>} /></>;
  const structureNames = new Map((structures.data || []).map((structure) => [structure.id, structure.name])); const rows = query.data || [];
  return <><PageHeader eyebrow="Fee Structure Master" title="Fee Components" description="Active line items from the real backend." action={canCreate && <Link href="/fee-components/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add fee component</Link>} /><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Component</th><th>Fee structure</th><th>Amount</th><th>Required</th><th>Status</th></tr></thead><tbody>{rows.map((component) => <tr key={component.id}><td><Link href={`/fee-components/${component.id}`} className="table-link"><strong>{component.name}</strong><small className="block text-muted-foreground">{component.description || "No description"}</small></Link></td><td>{structureNames.get(component.feeStructureId) || component.feeStructureId}</td><td className="amount-positive">{money(feeAmount(component.amount))}</td><td>{component.isMandatory ? "Mandatory" : "Optional"}</td><td><Status>{component.isActive ? "Active" : "Inactive"}</Status></td></tr>)}</tbody></table></div><div className="table-foot"><span>{rows.length} active components</span><Link href="/fees" className="table-foot-note">Back to fee structures</Link></div></div></>;
}
export function RealFeeComponentDetail({ id, session }: { id: string; session: User }) {
  const query = useFeeComponent(id); const structure = useFeeStructure(query.data?.feeStructureId); const [, setLocation] = useLocation(); const canUpdate = hasPermission(session.role, "FEES_UPDATE");
  if (query.isLoading || structure.isLoading) return <Loading />;
  if (query.isError) return <Empty title="Could not load fee component" detail={feeErrorMessage(query.error, "The fee component could not be loaded.")} action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  if (structure.isError) return <Empty title="Could not load parent fee structure" detail={feeErrorMessage(structure.error, "The parent fee structure could not be loaded.")} action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  const item = query.data;
  if (!item) return <Empty title="Fee component not found" detail="The requested fee component is unavailable." action={<Link href="/fee-components" className="text-button">Back to components</Link>} />;
  return <><button className="back-link page-back" onClick={() => setLocation("/fee-components")}><ArrowLeft size={15} />Back to Fee Components</button><PageHeader eyebrow="Fee component" title={item.name} description={item.description || "Real backend fee component"} action={canUpdate && <Link href={`/fee-components/${id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Settings2 size={15} />Edit fee component</Link>} /><div className="panel detail-panel"><div className="detail-fields">{[["Component ID", item.id], ["Amount", money(feeAmount(item.amount))], ["Fee structure", structure.data?.name || item.feeStructureId], ["Mandatory", item.isMandatory ? "Yes" : "No"], ["Active", item.isActive ? "Yes" : "No"]].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div></>;
}
export function FeesPage({ session }: { session: User }) {
  const query = useResource("feeStructures"); const components = useResource("feeComponents"); const [search, setSearch] = useState(""); const canCreate = hasPermission(session.role, "FEES_CREATE"); const del = useDeleteResource("feeStructures"); const rows = (query.data || []).filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase()));
  if (query.isLoading || components.isLoading) return <><PageHeader title="Fee Structure Master" /><Loading /></>;
  return <><PageHeader title="Fee Structure Master" description="Annual fee masters connect academic years, programmes, classes, and their components." action={canCreate && <Link href="/fees/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add fee structure</Link>} /><div className="list-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search fee structures" /><Link href="/fee-components" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold"><CircleDollarSign size={16} />Fee Components</Link></div>{rows.length === 0 ? <Empty title="No fee structures found" detail="Create a fee master to begin defining annual components." /> : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Academic year</th><th>Programme</th><th>Class</th><th>Total amount</th><th>Components</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link href={`/fees/${row.id}`} className="table-link"><strong>{row.name}</strong><small className="block text-muted-foreground">{row.description}</small></Link></td><td>{row.academicYear}</td><td>{row.program}</td><td>{row.class}</td><td className="amount-positive">{money(row.totalAmount)}</td><td>{queryClient.getQueryData<FeeComponent[]>(["erp", "feeComponents"])?.filter((component) => component.feeStructureId === row.id).length || "—"}</td><td className="row-actions">{hasPermission(session.role, "FEES_UPDATE") && <Link href={`/fees/${row.id}/edit`} className="icon-button" title="Edit fee structure"><Settings2 size={15} /></Link>}{session.role === "College Admin" && <button className="icon-button icon-danger" onClick={() => { if (confirm("Delete this fee structure?")) del.mutate(row.id, { onSuccess: () => toast({ title: "Fee structure deleted" }) }); }} title="Delete fee structure"><X size={15} /></button>}</td></tr>)}</tbody></table></div><div className="table-foot"><span>{rows.length} fee structures</span><span className="table-foot-note">Amounts shown in Indian Rupees</span></div></div>}</>;
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
  const canEdit = hasPermission(session.role, editing ? "FEES_UPDATE" : "FEES_CREATE");
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(feeSchema),
    defaultValues: { name: "", description: "", academicYearId: "", programId: "", classId: "", totalAmount: 0 },
  });

  useEffect(() => {
    if (!query.data) return;
    form.reset({
      name: query.data.name,
      description: query.data.description || "",
      academicYearId: query.data.academicYearId,
      programId: query.data.programId,
      classId: query.data.classId,
      totalAmount: query.data.totalAmount,
    });
  }, [query.data, form]);

  if (!canEdit) return <AccessState role={session.role} />;
  if (editing && query.isLoading) return <Loading />;
  if (editing && query.isError) return <Empty title="Could not load fee structure" detail={feeErrorMessage(query.error, "The fee structure could not be loaded.")} action={<Link href="/fees" className="text-button">Back to fee structures</Link>} />;

  const submit = async (values: Record<string, unknown>) => {
    const payload = {
      name: String(values.name),
      description: String(values.description || ""),
      academicYearId: String(values.academicYearId),
      programId: String(values.programId),
      classId: String(values.classId),
      totalAmount: Number(values.totalAmount),
      feeComponents: [],
    } as FeeStructureCreateRequest;

    try {
      if (editing && id) {
        await update.mutateAsync({ id, payload: { name: payload.name, description: payload.description, totalAmount: payload.totalAmount } });
        toast({ title: "Fee structure updated", description: "The fee master is ready for components." });
        setLocation(`/fees/${id}`);
      } else {
        const saved = await create.mutateAsync(payload);
        toast({ title: "Fee structure created", description: "The fee master is ready for components." });
        setLocation(`/fees/${saved.id}`);
      }
    } catch (error) {
      toast({ title: "Could not save fee structure", description: feeErrorMessage(error, "Please try again.") });
    }
  };

  return <><button className="back-link page-back" onClick={() => setLocation(id ? `/fees/${id}` : "/fees")}><ArrowLeft size={15} />Back to Fee Structure Master</button><PageHeader eyebrow={editing ? "Edit fee master" : "New fee master"} title={editing ? "Edit fee structure" : "Add fee structure"} description="Define the academic scope before adding fee components." /><form className="form-card" onSubmit={form.handleSubmit(submit, () => toast({ title: "Check the form" }))}><div className="form-grid"><Field form={form} name="name" label="Name" /><SelectField form={form} name="academicYearId" label="Academic year" options={(years.data || []).map((item) => [item.id, item.name])} /><SelectField form={form} name="programId" label="Programme / shift" options={(programs.data || []).map((item) => [item.id, item.name])} /><SelectField form={form} name="classId" label="Class" options={(classes.data || []).map((item) => [item.id, item.name])} /><Field form={form} name="totalAmount" label="Total amount (INR)" type="number" /><div className="field field-wide"><label htmlFor="description">Description</label><textarea id="description" rows={4} {...form.register("description")} /></div></div><div className="form-actions"><AppButton type="button" variant="ghost" onClick={() => setLocation(id ? `/fees/${id}` : "/fees")}>Cancel</AppButton><AppButton type="submit" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving…" : editing ? "Save changes" : "Create fee structure"}<ArrowRight size={16} /></AppButton></div></form></>;
}


const componentSchema = z.object({ name: z.string().min(2, "Name is required"), description: z.string().min(5, "Description is required"), amount: z.coerce.number().min(1, "Amount is required"), feeStructureId: z.string().min(1, "Choose a fee structure"), discountApplicable: z.string(), isMandatory: z.string() });
export function FeeComponentsPage({ session }: { session: User }) {
  const query = useResource("feeComponents"); const structures = useResource("feeStructures"); const del = useDeleteResource("feeComponents"); const canCreate = hasPermission(session.role, "FEES_CREATE"); const canUpdate = hasPermission(session.role, "FEES_UPDATE");
  if (query.isLoading || structures.isLoading) return <><PageHeader title="Fee Components" /><Loading /></>;
  const remove = (id: string) => { if (confirm("Delete this fee component?")) del.mutate(id, { onSuccess: () => toast({ title: "Fee component deleted" }) }); };
  return <><PageHeader eyebrow="Fee Structure Master" title="Fee Components" description="Line items associated with each fee structure." action={canCreate && <Link href="/fee-components/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} />Add component</Link>} /><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Component</th><th>Fee structure</th><th>Amount</th><th>Discount</th><th>Required</th><th /></tr></thead><tbody>{(query.data || []).map((component) => <tr key={component.id}><td><Link href={`/fee-components/${component.id}`} className="table-link"><strong>{component.name}</strong><small className="block text-muted-foreground">{component.description}</small></Link></td><td>{structures.data?.find((structure) => structure.id === component.feeStructureId)?.name || "—"}</td><td className="amount-positive">{money(component.amount)}</td><td>{component.discountApplicable ? "Yes" : "No"}</td><td>{component.mandatory ? "Mandatory" : "Optional"}</td><td className="row-actions">{canUpdate && <Link href={`/fee-components/${component.id}/edit`} className="icon-button" title="Edit component"><Settings2 size={15} /></Link>}{canUpdate && <button className="icon-button icon-danger" onClick={() => remove(component.id)} title="Delete component"><X size={15} /></button>}</td></tr>)}</tbody></table></div><div className="table-foot"><span>{query.data?.length || 0} components</span><Link href="/fees" className="table-foot-note">Back to fee structures</Link></div></div></>;
}
export function FeeComponentForm({ id, session }: { id?: string; session: User }) {
  const editing = Boolean(id);
  const query = useFeeComponent(id);
  const structures = useFeeStructures();
  const create = useCreateFeeComponent();
  const update = useUpdateFeeComponent();
  const [, setLocation] = useLocation();
  const canEdit = hasPermission(session.role, editing ? "FEES_UPDATE" : "FEES_CREATE");
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(componentSchema),
    defaultValues: { name: "", description: "", amount: 0, feeStructureId: new URLSearchParams(window.location.search).get("feeStructureId") || "", discountApplicable: "false", isMandatory: "true" },
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

  const submit = async (values: Record<string, unknown>) => {
    const payload = {
      name: String(values.name),
      description: String(values.description || ""),
      amount: Number(values.amount),
      feeStructureId: String(values.feeStructureId),
      discountApplicable: values.discountApplicable === "true",
      isMandatory: values.isMandatory === "true",
    } as FeeComponentCreateRequest;

    try {
      if (editing && id) {
        await update.mutateAsync({ id, payload: { name: payload.name, description: payload.description, amount: payload.amount, discountApplicable: payload.discountApplicable, isMandatory: payload.isMandatory } });
        toast({ title: "Fee component updated", description: "The component has been saved." });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Fee component created", description: "The component has been added to the fee master." });
      }
      setLocation("/fee-components");
    } catch (error) {
      toast({ title: editing ? "Could not update fee component" : "Could not create fee component", description: feeErrorMessage(error, "Please try again.") });
    }
  };

  return <><button className="back-link page-back" onClick={() => setLocation("/fee-components")}><ArrowLeft size={15} />Back to Fee Components</button><PageHeader eyebrow={editing ? "Edit fee component" : "New fee component"} title={editing ? "Edit component" : "Add fee component"} description="Associate each charge with a fee structure master." /><form className="form-card" onSubmit={form.handleSubmit(submit, () => toast({ title: "Check the form" }))}><div className="form-grid"><Field form={form} name="name" label="Name" /><Field form={form} name="amount" label="Amount (INR)" type="number" /><SelectField form={form} name="feeStructureId" label="Fee structure" options={(structures.data || []).map((item) => [item.id, item.name])} /><SelectField form={form} name="discountApplicable" label="Discount applicable" options={[["true", "Yes"], ["false", "No"]]} /><SelectField form={form} name="isMandatory" label="Mandatory" options={[["true", "Mandatory"], ["false", "Optional"]]} /><div className="field field-wide"><label htmlFor="description">Description</label><textarea id="description" rows={4} {...form.register("description")} /></div></div><div className="form-actions"><AppButton type="button" variant="ghost" onClick={() => setLocation("/fee-components")}>Cancel</AppButton><AppButton type="submit" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving…" : editing ? "Save changes" : "Create component"}<ArrowRight size={16} /></AppButton></div></form></>;
}
