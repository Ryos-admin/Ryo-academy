import { type User } from "@/lib/mock-erp";
import { CalendarDays, CircleDollarSign, ClipboardCheck, ClipboardList, Clock3, GraduationCap, BookOpen, Users, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAcademicYears } from "@/lib/academic-years-api";
import { useAdmissions } from "@/lib/admissions-api";
import { useAttendance } from "@/lib/attendance-api";
import { useClasses } from "@/lib/classes-api";
import { useFeeStructures } from "@/lib/fees-api";
import { useStaff } from "@/lib/staff-api";
import { useStudents } from "@/lib/students-api";
import { AppButton, PageHeader, Status, date } from "@/pages/page-primitives";
import { Link } from "wouter";
export function Dashboard({ session }: { session: User }) {
  console.log(session);

  const students = useStudents();
  const admissions = useAdmissions();
  const staff = useStaff();
  const feeStructures = useFeeStructures();
  const years = useAcademicYears();
  const classes = useClasses();
  const attendance = useAttendance();

  const studentRows = students.data || [];
  const admissionRows = admissions.data || [];
  const feeRows = feeStructures.data || [];
  const role = session.role;

  const studentCount = students.isLoading ? "…" : students.isError ? "Unavailable" : String(studentRows.length);
  const openApplicationsCount = admissions.isLoading ? "…" : admissions.isError ? "Unavailable" : String(admissionRows.filter((row) => row.admissionStatus === "DRAFT").length);
  const classesCount = classes.isLoading ? "…" : classes.isError ? "Unavailable" : String(classes.data?.length || 0);
  const academicYearsCount = years.isLoading ? "…" : years.isError ? "Unavailable" : String(years.data?.length || 0);
  const activeFacultyCount = staff.isLoading ? "…" : staff.isError ? "Unavailable" : String((staff.data || []).filter((row) => row.status).length);
  const attendanceCount = attendance.isLoading ? "…" : attendance.isError ? "Unavailable" : String(attendance.data?.length || 0);

  const cards: { label: string; value: string; meta: string; icon: typeof GraduationCap; tone: string }[] = role === "Staff" ? [
    { label: "Students", value: studentCount, meta: "Student register", icon: GraduationCap, tone: "blue" },
    { label: "Classes", value: classesCount, meta: "Active cohorts", icon: BookOpen, tone: "orange" },
    { label: "Attendance days", value: attendanceCount, meta: "Recent records", icon: ClipboardCheck, tone: "teal" },
    { label: "Timetable", value: "5", meta: "Published periods", icon: CalendarDays, tone: "gold" },
  ] : role === "Office Admin" ? [
    { label: "Open applications", value: openApplicationsCount, meta: "Needs a decision", icon: ClipboardList, tone: "orange" },
    { label: "Students", value: studentCount, meta: "Current register", icon: GraduationCap, tone: "blue" },
    { label: "Fee accounts", value: String(feeRows.length), meta: "Real fee structures", icon: CircleDollarSign, tone: "teal" },
    { label: "Classes", value: classesCount, meta: "Academic cohorts", icon: BookOpen, tone: "gold" },
  ] : [
    { label: "Enrolled students", value: studentCount, meta: "Across current cohorts", icon: GraduationCap, tone: "blue" },
    { label: "Open applications", value: openApplicationsCount, meta: "Needs a decision", icon: ClipboardList, tone: "orange" },
    { label: "Academic years", value: academicYearsCount, meta: "Configured workspace", icon: CalendarDays, tone: "gold" },
    { label: "Active faculty", value: activeFacultyCount, meta: "People at Nalanda", icon: Users, tone: "teal" },
  ];
  const quick = role === "Staff" ? [{ href: "/attendance/mark", label: "Mark attendance", detail: "Record today’s class", icon: ClipboardCheck, tone: "orange" }, { href: "/students", label: "Open students", detail: "Find a learner record", icon: GraduationCap, tone: "blue" }, { href: "/timetable", label: "View timetable", detail: "See the teaching week", icon: CalendarDays, tone: "gold" }] : role === "Office Admin" ? [{ href: "/admissions/new", label: "Log an application", detail: "Start an admissions record", icon: ClipboardList, tone: "orange" }, { href: "/fees/new", label: "Create fee structure", detail: "Set a current fee master", icon: CircleDollarSign, tone: "gold" }] : [{ href: "/academic-years/new", label: "Set up academic year", detail: "Add the next cycle", icon: CalendarDays, tone: "blue" }, { href: "/admissions/new", label: "Log an application", detail: "Start an admissions record", icon: ClipboardList, tone: "orange" }, { href: "/attendance/mark", label: "Mark attendance", detail: "Record a class register", icon: ClipboardCheck, tone: "gold" }];
  return <><PageHeader eyebrow={`Tuesday, ${date("2025-05-13")}`} title={`Good morning, ${session.name.split(" ")[0]}`} description="Here’s the pulse of Nalanda College today." action={<AppButton variant="soft" onClick={() => toast({ title: "Workspace current", description: "Mock records are stored in this browser." })}><Clock3 size={16} />AY 2025–26</AppButton>} /><div className="stats-grid">{cards.map((stat) => { const StatIcon = stat.icon; return <div className="stat-card" key={stat.label}><div className={`stat-icon stat-${stat.tone}`}><StatIcon size={19} /></div><div className="stat-label">{stat.label}</div><div className="stat-value" data-testid={`stat-${stat.label.toLowerCase().replaceAll(" ", "-")}`}>{stat.value}</div><div className="stat-meta">{stat.meta}</div></div>; })}</div><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-head"><div><div className="eyebrow">Workspace view</div><h2>Today at a glance</h2></div><Status>{role === "Staff" ? "Active" : "Confirmed"}</Status></div><div className="activity-list">{[{ icon: GraduationCap, title: "Student register ready", detail: studentCount === "Unavailable" ? "Student count unavailable" : `${studentRows.length} learner records available`, time: "Now", tone: "terracotta" }, { icon: CalendarDays, title: "Academic workspace", detail: classesCount === "Unavailable" || academicYearsCount === "Unavailable" ? "Academic workspace unavailable" : `${classes.data?.length || 0} classes across ${years.data?.length || 0} years`, time: "Current", tone: "teal" }, { icon: ClipboardCheck, title: "Attendance desk", detail: attendanceCount === "Unavailable" ? "Attendance desk unavailable" : `${attendance.data?.length || 0} class registers recorded`, time: "Recent", tone: "yellow" }].map((activity) => { const ActivityIcon = activity.icon as typeof GraduationCap; return <div className="activity-row" key={activity.title}><div className={`activity-icon activity-${activity.tone}`}><ActivityIcon size={16} /></div><div className="activity-copy"><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{activity.time}</time></div>; })}</div></section><section className="panel actions-panel"><div className="panel-head"><div><div className="eyebrow">Keep moving</div><h2>Useful routes</h2></div><span className="action-badge">{quick.length}</span></div><div className="pending-list">{quick.map((item, index) => { const QuickIcon = item.icon as typeof GraduationCap; return <Link key={item.href} href={item.href} className="pending-item"><span className="pending-number">0{index + 1}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><QuickIcon size={15} /></Link>; })}</div></section></div><section className="quick-section"><div className="section-title"><div><div className="eyebrow">Shortcuts</div><h2>Start with a task</h2></div><span className="muted-note">Role-aware actions</span></div><div className="quick-grid">{quick.map((item) => { const QuickIcon = item.icon as typeof GraduationCap; return <Link key={item.href} href={item.href} className={`quick-card quick-card-${item.tone}`}><span><QuickIcon size={18} /><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={16} /></Link>; })}</div></section></>;
}

