import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ClipboardList, Search, ShieldCheck } from "lucide-react";
import { type Role, formatINR, initials } from "@/lib/mock-erp";

export const money = (value: number) => formatINR(value);
export const date = (value?: string) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
};
export const titleCase = (value: string) =>
    value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function AppButton({
    children,
    variant = "primary",
    className = "",
    ...props
}: {
    children: ReactNode;
    variant?: "primary" | "ghost" | "soft" | "danger";
    className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const styles = {
        primary: "bg-primary text-primary-foreground shadow-sm hover:brightness-95",
        ghost: "border border-border bg-card text-foreground hover:bg-muted",
        soft: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    };

    return (
        <button
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
export function Status({ children }: { children: string }) {
    const tone = ["Paid", "Active", "Confirmed", "Present", "Cleared"].includes(children)
        ? "green"
        : ["Partial", "On Leave", "Late"].includes(children)
            ? "amber"
            : ["Pending", "Absent"].includes(children)
                ? "blue"
                : "slate";

    return (
        <span
            data-testid={`status-${children.toLowerCase().replaceAll(" ", "-")}`}
            className={`status status-${tone}`}
        >
            {children}
        </span>
    );
}
export function Avatar({ user, size = "md" }: { user: { avatar?: string; name?: string }; size?: "sm" | "md" | "lg" }) {
    return <span className={`avatar avatar-${size}`}>{user.avatar || initials(user.name || "")}</span>;
}
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-rise">
            <div>
                <div className="eyebrow">{eyebrow || "Nalanda administration"}</div>
                <h1 className="mt-1 font-serif text-3xl tracking-[-.02em] text-foreground md:text-[2.2rem]">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {action}
        </div>
    );
}
export function Loading({ label = "Loading records" }: { label?: string }) {
    return (
        <div className="flex min-h-[230px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <span className="loader" />
            <span>{label}</span>
        </div>
    );
}
export function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
    return (
        <div className="empty-state">
            <div className="empty-mark">
                <ClipboardList size={20} />
            </div>
            <h3>{title}</h3>
            <p>{detail}</p>
            {action}
        </div>
    );
}
export function SearchBox({ value, onChange, placeholder = "Search by name, ID or email" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <label className="search-box">
            <Search size={16} />
            <input
                data-testid="input-search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
        </label>
    );
}
export function SelectBox({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
    return (
        <label className="filter-box">
            <span>{label}</span>
            <select
                data-testid={`select-${label.toLowerCase().replaceAll(" ", "-")}`}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="All">All</option>
                {options.map((option) => <option key={option}>{option}</option>)}
            </select>
            <ChevronDown size={14} />
        </label>
    );
}
export function AccessState({ role }: { role: Role }) {
    const [, setLocation] = useLocation();

    return (
        <div className="access-state">
            <div className="empty-mark">
                <ShieldCheck size={20} />
            </div>
            <h2>That view is outside your role</h2>
            <p>{role} can only open records covered by its assigned permissions.</p>
            <AppButton onClick={() => setLocation("/dashboard")} data-testid="button-return-dashboard">
                Return to dashboard
            </AppButton>
        </div>
    );
}
