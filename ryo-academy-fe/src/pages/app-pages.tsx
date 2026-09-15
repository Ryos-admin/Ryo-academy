import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { Link, Route, Switch, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser, useLogin, useLogout } from "@/lib/auth-api";
import { session } from "@/lib/session";
import NotFound from "@/pages/not-found";
import {
  type Permission,
  type Role,
  type User,
  hasPermission,
} from "@/lib/mock-erp";
import {
  AcademicCalendarDetail,
  AcademicCalendarForm,
  AcademicCalendarList,
  AcademicYearDetail,
  AcademicYearForm,
  AcademicYearsList,
  ClassDetail,
  ClassForm,
  ClassList,
  ProgramDetail,
  ProgramForm,
  ProgramsList,
  SectionDetail,
  SectionForm,
  SectionList,
  SetupDetail,
  SetupForm,
  SetupList,
  SubjectDetail,
  SubjectForm,
  SubjectList,
  type SetupResource,
} from "@/pages/academic-pages";
import {
  StaffDetail,
  StaffForm,
  StaffList,
  TeachingAssignmentForm,
  TeachingAssignmentsList,
} from "@/pages/staff-pages";
import {
  FeeComponentForm,
  FeeComponentsPage,
  FeeForm,
  FeesPage,
  RealFeeComponentDetail,
  RealFeeComponentsPage,
  RealFeeDetail,
  RealFeesPage,
} from "@/pages/fee-pages";
import {
  AttendanceDetail,
  AttendanceMark,
  AttendancePage,
  RealAttendanceDetail,
  RealAttendanceMark,
  RealAttendancePage,
} from "@/pages/attendance-pages";
import {
  AdmissionDetail,
  AdmissionDetailWithStudent,
  AdmissionForm,
  AdmissionList,
  BasicForm,
  ParamBasicDetail,
  ParamBasicForm,
  StudentDetail,
  StudentList,
} from "@/pages/admissions-students-pages";
import { TimetablePage, Profile } from "@/pages/operations-pages";
import { Dashboard } from "@/pages/dashboard-page";
import {
  AccessState,
  AppButton,
  Avatar,
  Loading,
} from "@/pages/page-primitives";

export const queryClient = new QueryClient();
const authUserToUiUser = (user: { userId: string }): User => ({
  id: user.userId,
  name: "Authenticated user",
  email: "",
  role: "Staff",
  avatar: "AU",
  title: "Backend-authenticated user",
});

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  roles?: Role[];
  children?: { label: string; href: string; permission: Permission }[];
};
const nav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Academic Setup",
    href: "/academic-years",
    icon: GraduationCap,
    permission: "CLASS_READ",
    roles: ["College Admin"],
    children: [
      {
        label: "Academic Years",
        href: "/academic-years",
        permission: "CLASS_READ",
      },
      {
        label: "Academic Calendar",
        href: "/academic-calendar",
        permission: "SHIFT_READ",
      },
      {
        label: "Programs & Shifts",
        href: "/academic-programs",
        permission: "SHIFT_READ",
      },
      { label: "Classes", href: "/classes", permission: "CLASS_READ" },
      { label: "Sections", href: "/sections", permission: "CLASS_READ" },
    ],
  },
  {
    label: "Classes",
    href: "/classes",
    icon: BookOpen,
    permission: "CLASS_READ",
    roles: ["Office Admin", "Staff"],
  },
  {
    label: "Programs & Shifts",
    href: "/academic-programs",
    icon: Clock3,
    permission: "SHIFT_READ",
    roles: ["Office Admin", "Staff"],
  },
  {
    label: "Academic Calendar",
    href: "/academic-calendar",
    icon: CalendarDays,
    permission: "SHIFT_READ",
    roles: ["Office Admin"],
  },
  {
    label: "Admissions",
    href: "/admissions",
    icon: ClipboardList,
    permission: "ADMISSION_READ",
  },
  {
    label: "Students",
    href: "/students",
    icon: GraduationCap,
    permission: "STUDENT_READ",
  },
  {
    label: "Staff",
    href: "/staff",
    icon: BriefcaseBusiness,
    permission: "STAFF_READ",
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: ClipboardCheck,
    permission: "ATTENDANCE_READ",
  },
  {
    label: "Fees",
    href: "/fees",
    icon: CircleDollarSign,
    permission: "FEES_READ",
    children: [
      { label: "Fee Structures", href: "/fees", permission: "FEES_READ" },
      {
        label: "Fee Components",
        href: "/fee-components",
        permission: "FEES_READ",
      },
    ],
  },
  {
    label: "Timetable",
    href: "/timetable",
    icon: CalendarDays,
    permission: "TIMETABLE_READ",
  },
];

function Shell({
  children,
  session,
  onLogout,
}: {
  children: ReactNode;
  session: User;
  onLogout: () => void;
}) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const visible = nav.filter(
    (item) =>
      (!item.roles || item.roles.includes(session.role)) &&
      (!item.permission || hasPermission(session.role, item.permission)),
  );
  const label =
    nav
      .flatMap((item) => [item, ...(item.children || [])])
      .find(
        (item) =>
          location === item.href ||
          (item.href !== "/dashboard" && location.startsWith(item.href)),
      )?.label || "Profile";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-seal">N</div>
          <div>
            <div className="brand-name">NALANDA</div>
            <div className="brand-sub">college office</div>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-chip">
          <span className="live-dot" />
          <span>AY 2025–26</span>
          <ChevronDown size={13} />
        </div>
        <div className="nav-label">Workspace</div>
        <nav className="side-nav">
          {visible.map((item) => {
            const Icon = item.icon;
            const active =
              location === item.href ||
              (item.href !== "/dashboard" && location.startsWith(item.href));
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`side-link ${active ? "side-link-active" : ""}`}
                  data-testid={`link-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
                {active && item.children && (
                  <div className="sub-nav">
                    {item.children
                      .filter((child) =>
                        hasPermission(session.role, child.permission),
                      )
                      .map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className={`sub-link ${location.startsWith(child.href) ? "sub-link-active" : ""}`}
                        >
                          {child.label}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Account</div>
          <Link
            href="/profile"
            className={`side-link ${location === "/profile" ? "side-link-active" : ""}`}
            data-testid="link-profile"
          >
            <UserRound size={18} />
            <span>My profile</span>
          </Link>
          <button
            className="side-link side-button"
            onClick={onLogout}
            data-testid="button-logout"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
          <div className="sidebar-footer">
            <span className="footer-line" />
            <span>Built for focused work</span>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Academic year 2025–26</span>
            <span className="breadcrumb-sep">/</span>
            <strong>{label}</strong>
          </div>
          <div className="top-actions">
            <div className="role-pip">
              <span className="role-dot" />
              {session.role}
            </div>
            <div className="profile-wrap">
              <button
                className="profile-trigger"
                onClick={() => setProfileOpen(!profileOpen)}
                data-testid="button-profile-menu"
              >
                <Avatar user={session} size="sm" />
                <span className="profile-trigger-name">{session.name}</span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-head">
                    <Avatar user={session} />
                    <div>
                      <strong>{session.name}</strong>
                      <span>{session.email}</span>
                    </div>
                  </div>
                  <Link href="/profile" onClick={() => setProfileOpen(false)}>
                    <UserRound size={15} />
                    Profile settings
                  </Link>
                  <button onClick={onLogout}>
                    <LogOut size={15} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

function AuthLayout({
  children,
  title,
  note,
}: {
  children: ReactNode;
  title: string;
  note: string;
}) {
  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <div className="auth-grid" />
        <div className="auth-brand">
          <div className="brand-seal">N</div>
          <div>
            <div className="brand-name">NALANDA</div>
            <div className="brand-sub">college office</div>
          </div>
        </div>
        <div className="auth-quote">
          <p>“Good administration gives learning room to happen.”</p>
          <span>— Office handbook, 1987</span>
        </div>
        <div className="auth-visual-foot">NAC · Bengaluru · Est. 1987</div>
      </div>
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-auth-brand">
            <div className="brand-seal">N</div>
            <div className="brand-name">NALANDA</div>
          </div>
          <div className="eyebrow">Secure sign in</div>
          <h1>{title}</h1>
          <p className="auth-note">{note}</p>
          {children}
          <div className="auth-foot">
            Authenticated by the Ryo Academy backend
          </div>
        </div>
      </div>
    </div>
  );
}
function Login() {
  const [, setLocation] = useLocation();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      toast({ title: "Welcome back", description: "You are now signed in." });
      setLocation("/dashboard");
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? Array.isArray(reason.backendMessage)
            ? reason.backendMessage.join(" ")
            : reason.backendMessage
          : "Unable to sign in. Please try again.",
      );
    }
  };
  return (
    <AuthLayout
      title="Sign in to your office"
      note="Use your Ryo Academy account to continue."
    >
      <form onSubmit={submit} className="auth-form">
        <label>
          Email address
          <input
            data-testid="input-login-email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            data-testid="input-login-password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <AppButton
          className="w-full mt-2 h-11"
          type="submit"
          disabled={login.isPending}
          data-testid="button-sign-in"
        >
          {login.isPending ? "Signing in…" : "Sign in"}
          <ArrowRight size={16} />
        </AppButton>
      </form>
      <Link href="/forgot-password" className="auth-link">
        Need to reset a password?
      </Link>
    </AuthLayout>
  );
}
function ForgotPassword() {
  const [email, setEmail] = useState("");
  return (
    <AuthLayout
      title="Reset access"
      note="Enter a work email and we’ll prepare a development reset link."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          toast({
            title: "Reset request noted",
            description: `A development link is ready for ${email}.`,
          });
        }}
        className="auth-form"
      >
        <label>
          Email address
          <input
            data-testid="input-reset-email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@nalanda.edu.in"
          />
        </label>
        <AppButton className="w-full mt-2" type="submit">
          Request reset link
        </AppButton>
      </form>
      <Link href="/login" className="back-link">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </AuthLayout>
  );
}

function ResetPassword() {
  const [saved, setSaved] = useState(false);
  return (
    <AuthLayout
      title="Set a new password"
      note="This screen is available only in the development workspace."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
          toast({
            title: "Password updated",
            description: "Your development password has been updated.",
          });
        }}
        className="auth-form"
      >
        <input
          type="text"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          style={{ display: "none" }}
        />
        <label>
          New password
          <input
            required
            minLength={6}
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />
        </label>
        <label>
          Confirm password
          <input
            required
            minLength={6}
            type="password"
            autoComplete="new-password"
            placeholder="Repeat the password"
          />
        </label>
        <AppButton className="w-full mt-2" type="submit">
          {saved ? "Password saved" : "Save new password"}
          {saved && <Check size={16} />}
        </AppButton>
      </form>
      <Link href="/login" className="back-link">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </AuthLayout>
  );
}
function Protected({
  session,
  permission,
  children,
}: {
  session: User;
  permission?: Permission;
  children: ReactNode;
}) {
  return permission && !hasPermission(session.role, permission) ? (
    <AccessState role={session.role} />
  ) : (
    <>{children}</>
  );
}
function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation(href), [href, setLocation]);
  return null;
}
function SessionError({ error }: { error: unknown }) {
  const detail =
    error instanceof ApiError && error.status === 403
      ? "Your account is signed in but is not allowed to load the current user profile."
      : "The authenticated session could not be restored.";
  return (
    <AuthLayout title="Unable to restore session" note={detail}>
      <AppButton
        onClick={() => {
          session.clear();
          queryClient.removeQueries({ queryKey: ["auth", "me"] });
        }}
      >
        Return to sign in
      </AppButton>
    </AuthLayout>
  );
}

function ParamAdmissionList({ session }: { session: User }) {
  return <AdmissionList session={session} />;
}
function ParamFeeForm({ session }: { session: User }) {
  const { id } = useParams();
  return <FeeForm id={id} session={session} />;
}
function ParamRealFeeDetail({ session }: { session: User }) {
  const { id } = useParams();
  return <RealFeeDetail id={id || ""} session={session} />;
}
function ParamComponentForm({ session }: { session: User }) {
  const { id } = useParams();
  return <FeeComponentForm id={id} session={session} />;
}
function ParamRealFeeComponentDetail({ session }: { session: User }) {
  const { id } = useParams();
  return <RealFeeComponentDetail id={id || ""} session={session} />;
}
function ParamAttendanceMark({ session }: { session: User }) {
  const { id } = useParams();
  return <RealAttendanceMark id={id} session={session} />;
}
function ParamAttendanceDetail({ session }: { session: User }) {
  const { id } = useParams();
  return <RealAttendanceDetail id={id || ""} session={session} />;
}
function AcademicYearEditRoute() {
  const { id } = useParams();
  return <AcademicYearForm id={id} />;
}
function AcademicYearDetailRoute() {
  const { id } = useParams();
  return <AcademicYearDetail id={id || ""} />;
}
function AcademicCalendarEditRoute() {
  const { id } = useParams();
  return <AcademicCalendarForm id={id} />;
}
function AcademicCalendarDetailRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <AcademicCalendarDetail id={id || ""} session={session} />;
}
function ProgramEditRoute() {
  const { id } = useParams();
  return <ProgramForm id={id} />;
}
function ProgramDetailRoute() {
  const { id } = useParams();
  return <ProgramDetail id={id || ""} />;
}
function ClassDetailRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <ClassDetail id={id || ""} session={session} />;
}
function SectionDetailRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <SectionDetail id={id || ""} session={session} />;
}
function SubjectDetailRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <SubjectDetail id={id || ""} session={session} />;
}
function StaffDetailRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <StaffDetail id={id || ""} session={session} />;
}
function TeachingAssignmentFormRoute({ session }: { session: User }) {
  const { id } = useParams();
  return <TeachingAssignmentForm id={id} session={session} />;
}

function RoutedApp({
  session,
  onLogout,
}: {
  session: User;
  onLogout: () => void;
}) {
  return (
    <Shell session={session} onLogout={onLogout}>
      <Switch>
        <Route path="/dashboard">
          <Dashboard session={session} />
        </Route>
        <Route path="/academic-years/new">
          <AcademicYearForm />
        </Route>
        <Route path="/academic-years/:id/edit">
          <AcademicYearEditRoute />
        </Route>
        <Route path="/academic-years/:id">
          <AcademicYearDetailRoute />
        </Route>
        <Route path="/academic-years">
          <AcademicYearsList />
        </Route>
        <Route path="/academic-calendar/new">
          <Protected session={session} permission="SHIFT_CREATE">
            <AcademicCalendarForm />
          </Protected>
        </Route>
        <Route path="/academic-calendar/:id/edit">
          <Protected session={session} permission="SHIFT_UPDATE">
            <AcademicCalendarEditRoute />
          </Protected>
        </Route>
        <Route path="/academic-calendar/:id">
          <Protected session={session} permission="SHIFT_READ">
            <AcademicCalendarDetailRoute session={session} />
          </Protected>
        </Route>
        <Route path="/academic-calendar">
          <Protected session={session} permission="SHIFT_READ">
            <AcademicCalendarList session={session} />
          </Protected>
        </Route>
        <Route path="/academic-programs/new">
          <ProgramForm />
        </Route>
        <Route path="/academic-programs/:id/edit">
          <ProgramEditRoute />
        </Route>
        <Route path="/academic-programs/:id">
          <ProgramDetailRoute />
        </Route>
        <Route path="/academic-programs">
          <ProgramsList />
        </Route>
        <Route path="/classes/new">
          <Protected session={session} permission="CLASS_CREATE">
            <ClassForm session={session} />
          </Protected>
        </Route>
        <Route path="/classes/:id/edit">
          <Protected session={session} permission="CLASS_UPDATE">
            <ClassForm session={session} />
          </Protected>
        </Route>
        <Route path="/classes/:id">
          <Protected session={session} permission="CLASS_READ">
            <ClassDetailRoute session={session} />
          </Protected>
        </Route>
        <Route path="/classes">
          <Protected session={session} permission="CLASS_READ">
            <ClassList session={session} />
          </Protected>
        </Route>
        <Route path="/sections/new">
          <Protected session={session} permission="CLASS_CREATE">
            <SectionForm session={session} />
          </Protected>
        </Route>
        <Route path="/sections/:id/edit">
          <Protected session={session} permission="CLASS_UPDATE">
            <SectionForm session={session} />
          </Protected>
        </Route>
        <Route path="/sections/:id">
          <Protected session={session} permission="CLASS_READ">
            <SectionDetailRoute session={session} />
          </Protected>
        </Route>
        <Route path="/sections">
          <Protected session={session} permission="CLASS_READ">
            <SectionList session={session} />
          </Protected>
        </Route>
        <Route path="/subjects/new">
          <Protected session={session} permission="CLASS_CREATE">
            <SubjectForm session={session} />
          </Protected>
        </Route>
        <Route path="/subjects/:id/edit">
          <Protected session={session} permission="CLASS_UPDATE">
            <SubjectForm session={session} />
          </Protected>
        </Route>
        <Route path="/subjects/:id">
          <Protected session={session} permission="CLASS_READ">
            <SubjectDetailRoute session={session} />
          </Protected>
        </Route>
        <Route path="/subjects">
          <Protected session={session} permission="CLASS_READ">
            <SubjectList session={session} />
          </Protected>
        </Route>
        <Route path="/teaching-assignments/new">
          <Protected session={session} permission="STAFF_UPDATE">
            <TeachingAssignmentForm session={session} />
          </Protected>
        </Route>
        <Route path="/teaching-assignments/:id/edit">
          <Protected session={session} permission="STAFF_UPDATE">
            <TeachingAssignmentFormRoute session={session} />
          </Protected>
        </Route>
        <Route path="/teaching-assignments">
          <Protected session={session} permission="STAFF_READ">
            <TeachingAssignmentsList session={session} />
          </Protected>
        </Route>
        <Route path="/students/new">
          <Protected session={session} permission="STUDENT_CREATE">
            <BasicForm resource="students" session={session} />
          </Protected>
        </Route>
        <Route path="/students/:id/edit">
          <Protected session={session} permission="STUDENT_UPDATE">
            <ParamBasicForm resource="students" session={session} />
          </Protected>
        </Route>
        <Route path="/students/:id">
          <Protected session={session} permission="STUDENT_READ">
            <ParamBasicDetail resource="students" session={session} />
          </Protected>
        </Route>
        <Route path="/students">
          <Protected session={session} permission="STUDENT_READ">
            <StudentList session={session} />
          </Protected>
        </Route>
        <Route path="/admissions/new">
          <Protected session={session} permission="ADMISSION_CREATE">
            <AdmissionForm session={session} />
          </Protected>
        </Route>
        <Route path="/admissions/:id/edit">
          <Protected session={session} permission="ADMISSION_UPDATE">
            <ParamBasicForm resource="admissions" session={session} />
          </Protected>
        </Route>
        <Route path="/admissions/:id">
          <Protected session={session} permission="ADMISSION_READ">
            <ParamBasicDetail resource="admissions" session={session} />
          </Protected>
        </Route>
        <Route path="/admissions">
          <Protected session={session} permission="ADMISSION_READ">
            <ParamAdmissionList session={session} />
          </Protected>
        </Route>
        <Route path="/staff/new">
          <Protected session={session} permission="STAFF_CREATE">
            <StaffForm session={session} />
          </Protected>
        </Route>
        <Route path="/staff/:id/edit">
          <Protected session={session} permission="STAFF_UPDATE">
            <StaffForm session={session} />
          </Protected>
        </Route>
        <Route path="/staff/:id">
          <Protected session={session} permission="STAFF_READ">
            <StaffDetailRoute session={session} />
          </Protected>
        </Route>
        <Route path="/staff">
          <Protected session={session} permission="STAFF_READ">
            <StaffList session={session} />
          </Protected>
        </Route>
        <Route path="/fees/new">
          <Protected session={session} permission="FEES_CREATE">
            <FeeForm session={session} />
          </Protected>
        </Route>
        <Route path="/fees/:id/edit">
          <Protected session={session} permission="FEES_UPDATE">
            <ParamFeeForm session={session} />
          </Protected>
        </Route>
        <Route path="/fees/:id">
          <Protected session={session} permission="FEES_READ">
            <ParamRealFeeDetail session={session} />
          </Protected>
        </Route>
        <Route path="/fees">
          <Protected session={session} permission="FEES_READ">
            <RealFeesPage session={session} />
          </Protected>
        </Route>
        <Route path="/fee-components/new">
          <Protected session={session} permission="FEES_CREATE">
            <FeeComponentForm session={session} />
          </Protected>
        </Route>
        <Route path="/fee-components/:id/edit">
          <Protected session={session} permission="FEES_UPDATE">
            <ParamComponentForm session={session} />
          </Protected>
        </Route>
        <Route path="/fee-components/:id">
          <Protected session={session} permission="FEES_READ">
            <ParamRealFeeComponentDetail session={session} />
          </Protected>
        </Route>
        <Route path="/fee-components">
          <Protected session={session} permission="FEES_READ">
            <RealFeeComponentsPage session={session} />
          </Protected>
        </Route>
        <Route path="/attendance/mark">
          <Protected session={session} permission="ATTENDANCE_MARK">
            <RealAttendanceMark session={session} />
          </Protected>
        </Route>
        <Route path="/attendance/:id/edit">
          <Protected session={session} permission="ATTENDANCE_UPDATE">
            <ParamAttendanceMark session={session} />
          </Protected>
        </Route>
        <Route path="/attendance/:id">
          <Protected session={session} permission="ATTENDANCE_READ">
            <ParamAttendanceDetail session={session} />
          </Protected>
        </Route>
        <Route path="/attendance">
          <Protected session={session} permission="ATTENDANCE_READ">
            <RealAttendancePage session={session} />
          </Protected>
        </Route>
        <Route path="/timetable">
          <Protected session={session} permission="TIMETABLE_READ">
            <TimetablePage />
          </Protected>
        </Route>
        <Route path="/profile">
          <Profile session={session} />
        </Route>
        <Route path="/">
          <RedirectTo href="/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

export function Router() {
  const token = session.hasSession();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  if (token && currentUser.isLoading)
    return <Loading label="Restoring session" />;
  if (token && currentUser.isError)
    return <SessionError error={currentUser.error} />;
  if (!token || !currentUser.data)
    return (
      <Switch>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/login" component={Login} />
        <Route>
          <RedirectTo href="/login" />
        </Route>
      </Switch>
    );
  const authenticatedUser = authUserToUiUser(currentUser.data);
  return (
    <Switch>
      <Route path="/login">
        <RedirectTo href="/dashboard" />
      </Route>
      <Route>
        <RoutedApp
          session={authenticatedUser}
          onLogout={() => {
            logout();
            toast({
              title: "Signed out",
              description: "Your session has ended.",
            });
          }}
        />
      </Route>
    </Switch>
  );
}
