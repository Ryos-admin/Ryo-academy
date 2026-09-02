import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type Role = "Office Admin" | "College Admin" | "Staff";
export type Permission =
  | "ADMISSION_READ" | "ADMISSION_CREATE" | "ADMISSION_UPDATE"
  | "FEES_READ" | "FEES_CREATE" | "FEES_UPDATE"
  | "CLASS_READ" | "CLASS_CREATE" | "CLASS_UPDATE"
  | "ATTENDANCE_READ" | "ATTENDANCE_MARK" | "ATTENDANCE_UPDATE"
  | "STAFF_READ" | "STAFF_CREATE" | "STAFF_UPDATE"
  | "STUDENT_READ" | "STUDENT_CREATE" | "STUDENT_UPDATE"
  | "SHIFT_READ" | "SHIFT_CREATE" | "SHIFT_UPDATE"
  | "TIMETABLE_READ";
export const ALL_PERMISSIONS: Permission[] = [
  "ADMISSION_READ", "ADMISSION_CREATE", "ADMISSION_UPDATE", "FEES_READ", "FEES_CREATE", "FEES_UPDATE",
  "CLASS_READ", "CLASS_CREATE", "CLASS_UPDATE", "ATTENDANCE_READ", "ATTENDANCE_MARK", "ATTENDANCE_UPDATE",
  "STAFF_READ", "STAFF_CREATE", "STAFF_UPDATE", "STUDENT_READ", "STUDENT_CREATE", "STUDENT_UPDATE",
  "SHIFT_READ", "SHIFT_CREATE", "SHIFT_UPDATE", "TIMETABLE_READ",
];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  "College Admin": ALL_PERMISSIONS,
  "Office Admin": ["ADMISSION_READ", "ADMISSION_CREATE", "ADMISSION_UPDATE", "FEES_READ", "FEES_CREATE", "FEES_UPDATE", "CLASS_READ", "CLASS_CREATE", "CLASS_UPDATE", "STUDENT_READ", "STUDENT_CREATE", "STUDENT_UPDATE", "STAFF_READ", "SHIFT_READ", "SHIFT_CREATE", "SHIFT_UPDATE", "TIMETABLE_READ"],
  Staff: ["STUDENT_READ", "CLASS_READ", "ATTENDANCE_READ", "ATTENDANCE_MARK", "ATTENDANCE_UPDATE", "TIMETABLE_READ", "SHIFT_READ"],
};
export const hasPermission = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
export const hasAnyPermission = (role: Role, permissions: Permission[]) => permissions.some((permission) => hasPermission(role, permission));
export const hasAllPermissions = (role: Role, permissions: Permission[]) => permissions.every((permission) => hasPermission(role, permission));
export type User = { id: string; name: string; email: string; role: Role; avatar: string; title: string };
export type Student = { id: string; admissionNumber: string; name: string; email: string; phone: string; className: string; section: string; dateOfBirth: string; gender: string; guardianName: string; guardianPhone: string; status: "Active" | "Inactive"; admissionId: string; feeStatus: "Paid" | "Partial" | "Pending" };
export type Admission = { id: string; applicationNumber: string; applicantName: string; email: string; phone: string; appliedClass: string; appliedOn: string; status: "Pending" | "Confirmed" | "Cancelled"; source: string; notes: string; parentName?: string; parentPhone?: string; address?: string; academicQualification?: string; convertedStudentId?: string };
export type Staff = { id: string; employeeNumber: string; name: string; email: string; phone: string; department: string; designation: string; joinedOn: string; status: "Active" | "On Leave" | "Inactive"; systemRole?: Role };
export type Subject = { id: string; code: string; name: string; department: string; gradeLevel: string; credits: number; status: "Active" | "Archived"; description: string };
export type Assignment = { id: string; staffId: string; subjectId: string; academicYear: string; term: string; className: string; section: string; weeklyPeriods: number; status: "Active" | "Completed" };
export type FeeRecord = { id: string; studentId: string; academicYear: string; totalAmount: number; paidAmount: number; dueAmount: number; dueDate: string; status: "Paid" | "Partial" | "Pending" };
export type Payment = { id: string; feeRecordId: string; studentId: string; amount: number; paidOn: string; method: string; receiptNumber: string; status: "Cleared" | "Reversed" };
export type AcademicYear = { id: string; schoolId: string; name: string; startDate: string; endDate: string };
export type ProgramShift = { id: string; name: string; academicYearId: string; academicYear: string; primary: boolean; daysOfWeek: string[]; startTime: string; endTime: string };
export type SchoolClass = { id: string; name: string; programId: string; program: string };
export type Section = { id: string; name: string; classId: string; class: string };
export type FeeStructure = { id: string; name: string; description: string; academicYearId: string; academicYear: string; programId: string; program: string; classId: string; class: string; totalAmount: number };
export type FeeComponent = { id: string; name: string; description: string; amount: number; feeStructureId: string; discountApplicable: boolean; mandatory: boolean };
export type AttendanceStatus = "Present" | "Absent" | "Late";
export type AttendanceRecord = { id: string; academicYearId: string; programId: string; classId: string; sectionId: string; academicYear: string; program: string; class: string; section: string; date: string; markedBy: string; entries: { studentId: string; studentName: string; status: AttendanceStatus }[] };
export type TimetableEntry = { id: string; day: string; period: string; time: string; program: string; class: string; section: string; subject: string; faculty: string; room: string };
export type DB = { users: User[]; students: Student[]; admissions: Admission[]; staff: Staff[]; subjects: Subject[]; assignments: Assignment[]; fees: FeeRecord[]; payments: Payment[]; academicYears: AcademicYear[]; programs: ProgramShift[]; classes: SchoolClass[]; sections: Section[]; feeStructures: FeeStructure[]; feeComponents: FeeComponent[]; attendance: AttendanceRecord[]; timetable: TimetableEntry[] };

const seed: DB = {
  users: [
    { id: "u1", name: "Ananya Rao", email: "ananya.rao@nalanda.edu.in", role: "Office Admin", avatar: "AR", title: "Registrar & Office Admin" },
    { id: "u2", name: "Vikram Menon", email: "vikram.menon@nalanda.edu.in", role: "College Admin", avatar: "VM", title: "Dean of Academics" },
    { id: "u3", name: "Meera Iyer", email: "meera.iyer@nalanda.edu.in", role: "Staff", avatar: "MI", title: "Assistant Professor, Science" },
  ],
  students: [
    { id: "s1", admissionNumber: "NAC-24-0187", name: "Aarav Sharma", email: "aarav.sharma@gmail.com", phone: "+91 98765 41208", className: "B.Sc. Computer Science", section: "A", dateOfBirth: "2005-08-14", gender: "Male", guardianName: "Rakesh Sharma", guardianPhone: "+91 98450 11209", status: "Active", admissionId: "ad4", feeStatus: "Partial" },
    { id: "s2", admissionNumber: "NAC-24-0164", name: "Ishita Kulkarni", email: "ishita.k@gmail.com", phone: "+91 98204 77831", className: "B.Com. Honours", section: "B", dateOfBirth: "2005-11-02", gender: "Female", guardianName: "Sunita Kulkarni", guardianPhone: "+91 98201 22660", status: "Active", admissionId: "ad3", feeStatus: "Paid" },
    { id: "s3", admissionNumber: "NAC-23-0098", name: "Kabir Thomas", email: "kabir.thomas@outlook.com", phone: "+91 99872 40310", className: "B.A. Economics", section: "A", dateOfBirth: "2004-05-26", gender: "Male", guardianName: "Leena Thomas", guardianPhone: "+91 99870 76122", status: "Active", admissionId: "ad2", feeStatus: "Pending" },
    { id: "s4", admissionNumber: "NAC-24-0201", name: "Nandini Joshi", email: "nandini.joshi@gmail.com", phone: "+91 98923 51076", className: "B.Sc. Biotechnology", section: "C", dateOfBirth: "2006-01-17", gender: "Female", guardianName: "Madhav Joshi", guardianPhone: "+91 98213 18890", status: "Active", admissionId: "ad1", feeStatus: "Partial" },
    { id: "s5", admissionNumber: "NAC-22-0043", name: "Rahul Bhat", email: "rahul.bhat@yahoo.com", phone: "+91 98198 66402", className: "B.A. English", section: "A", dateOfBirth: "2003-10-09", gender: "Male", guardianName: "Prakash Bhat", guardianPhone: "+91 98191 22109", status: "Inactive", admissionId: "ad5", feeStatus: "Paid" },
  ],
  admissions: [
    { id: "ad1", applicationNumber: "APP-25-0041", applicantName: "Nandini Joshi", email: "nandini.joshi@gmail.com", phone: "+91 98923 51076", appliedClass: "B.Sc. Biotechnology", appliedOn: "2025-04-18", status: "Confirmed", source: "Website", notes: "Strong biology score; scholarship considered.", parentName: "Madhav Joshi", parentPhone: "+91 98213 18890", address: "18, 3rd Cross, Indiranagar, Bengaluru", academicQualification: "Karnataka PUC — 92%", convertedStudentId: "s4" },
    { id: "ad2", applicationNumber: "APP-25-0038", applicantName: "Kabir Thomas", email: "kabir.thomas@outlook.com", phone: "+91 99872 40310", appliedClass: "B.A. Economics", appliedOn: "2025-04-14", status: "Confirmed", source: "Alumni referral", notes: "Documents verified.", parentName: "Leena Thomas", parentPhone: "+91 99870 76122", address: "7, Richmond Town, Bengaluru", academicQualification: "ISC — 87%", convertedStudentId: "s3" },
    { id: "ad3", applicationNumber: "APP-25-0052", applicantName: "Ishita Kulkarni", email: "ishita.k@gmail.com", phone: "+91 98204 77831", appliedClass: "B.Com. Honours", appliedOn: "2025-04-22", status: "Confirmed", source: "Website", notes: "Merit list round one.", parentName: "Sunita Kulkarni", parentPhone: "+91 98201 22660", address: "42, Banashankari II Stage, Bengaluru", academicQualification: "CBSE — 94%", convertedStudentId: "s2" },
    { id: "ad4", applicationNumber: "APP-25-0058", applicantName: "Aarav Sharma", email: "aarav.sharma@gmail.com", phone: "+91 98765 41208", appliedClass: "B.Sc. Computer Science", appliedOn: "2025-04-25", status: "Confirmed", source: "Open day", notes: "Transfer certificate received.", parentName: "Rakesh Sharma", parentPhone: "+91 98450 11209", address: "12, HSR Layout, Bengaluru", academicQualification: "CBSE — 90%", convertedStudentId: "s1" },
    { id: "ad5", applicationNumber: "APP-24-0312", applicantName: "Rahul Bhat", email: "rahul.bhat@yahoo.com", phone: "+91 98198 66402", appliedClass: "B.A. English", appliedOn: "2024-06-07", status: "Confirmed", source: "Website", notes: "Programme completed.", parentName: "Prakash Bhat", parentPhone: "+91 98191 22109", address: "9, Malleshwaram, Bengaluru", academicQualification: "PUC — 81%", convertedStudentId: "s5" },
    { id: "ad6", applicationNumber: "APP-25-0067", applicantName: "Diya Nair", email: "diya.nair@gmail.com", phone: "+91 99452 11184", appliedClass: "B.Com. Honours", appliedOn: "2025-05-03", status: "Pending", source: "Counsellor", notes: "Waiting for final marksheet.", parentName: "Anil Nair", parentPhone: "+91 99451 33184", address: "21, Jayanagar 4th Block, Bengaluru", academicQualification: "Kerala HSE — 89%" },
    { id: "ad7", applicationNumber: "APP-25-0071", applicantName: "Arjun Pillai", email: "arjun.pillai@gmail.com", phone: "+91 90356 22410", appliedClass: "B.Sc. Computer Science", appliedOn: "2025-05-06", status: "Pending", source: "Website", notes: "Application fee paid.", parentName: "Suresh Pillai", parentPhone: "+91 90356 22411", address: "5, Whitefield Main Road, Bengaluru", academicQualification: "CBSE — 88%" },
  ],
  staff: [
    { id: "t1", employeeNumber: "NAC-F-018", name: "Meera Iyer", email: "meera.iyer@nalanda.edu.in", phone: "+91 98452 11980", department: "Science", designation: "Assistant Professor", joinedOn: "2019-07-01", status: "Active", systemRole: "Staff" },
    { id: "t2", employeeNumber: "NAC-F-007", name: "Vikram Menon", email: "vikram.menon@nalanda.edu.in", phone: "+91 98200 34190", department: "Administration", designation: "Dean of Academics", joinedOn: "2015-06-15", status: "Active", systemRole: "College Admin" },
    { id: "t3", employeeNumber: "NAC-F-024", name: "Sanjay Deshpande", email: "sanjay.d@nalanda.edu.in", phone: "+91 98811 45007", department: "Commerce", designation: "Associate Professor", joinedOn: "2018-08-20", status: "On Leave" },
    { id: "t4", employeeNumber: "NAC-F-031", name: "Asha Thomas", email: "asha.t@nalanda.edu.in", phone: "+91 99162 88014", department: "Humanities", designation: "Lecturer", joinedOn: "2022-01-10", status: "Active" },
  ],
  subjects: [
    { id: "sub1", code: "CSC-201", name: "Data Structures & Algorithms", department: "Computer Science", gradeLevel: "Year 2", credits: 4, status: "Active", description: "Core structures, algorithmic thinking, and complexity analysis." },
    { id: "sub2", code: "COM-103", name: "Financial Accounting", department: "Commerce", gradeLevel: "Year 1", credits: 4, status: "Active", description: "Principles of accounting, ledgers, and financial statements." },
    { id: "sub3", code: "ECO-205", name: "Indian Economic Policy", department: "Economics", gradeLevel: "Year 2", credits: 3, status: "Active", description: "Institutions, reforms, and contemporary policy questions." },
    { id: "sub4", code: "BIO-111", name: "Cell Biology", department: "Biotechnology", gradeLevel: "Year 1", credits: 3, status: "Active", description: "Cell structure, processes, and laboratory methods." },
    { id: "sub5", code: "ENG-308", name: "Modern Indian Literature", department: "English", gradeLevel: "Year 3", credits: 3, status: "Archived", description: "A survey of modern Indian writing in English and translation." },
  ],
  assignments: [
    { id: "as1", staffId: "t1", subjectId: "sub1", academicYear: "2025–26", term: "Monsoon", className: "B.Sc. Computer Science", section: "A", weeklyPeriods: 5, status: "Active" },
    { id: "as2", staffId: "t3", subjectId: "sub3", academicYear: "2025–26", term: "Monsoon", className: "B.A. Economics", section: "A", weeklyPeriods: 4, status: "Active" },
    { id: "as3", staffId: "t2", subjectId: "sub2", academicYear: "2025–26", term: "Monsoon", className: "B.Com. Honours", section: "B", weeklyPeriods: 4, status: "Active" },
    { id: "as4", staffId: "t4", subjectId: "sub4", academicYear: "2024–25", term: "Spring", className: "B.Sc. Biotechnology", section: "C", weeklyPeriods: 3, status: "Completed" },
  ],
  fees: [
    { id: "fee1", studentId: "s1", academicYear: "2025–26", totalAmount: 78500, paidAmount: 50000, dueAmount: 28500, dueDate: "2025-07-15", status: "Partial" },
    { id: "fee2", studentId: "s2", academicYear: "2025–26", totalAmount: 72000, paidAmount: 72000, dueAmount: 0, dueDate: "2025-07-15", status: "Paid" },
    { id: "fee3", studentId: "s3", academicYear: "2025–26", totalAmount: 68000, paidAmount: 0, dueAmount: 68000, dueDate: "2025-07-15", status: "Pending" },
    { id: "fee4", studentId: "s4", academicYear: "2025–26", totalAmount: 81000, paidAmount: 42000, dueAmount: 39000, dueDate: "2025-07-15", status: "Partial" },
    { id: "fee5", studentId: "s5", academicYear: "2024–25", totalAmount: 64000, paidAmount: 64000, dueAmount: 0, dueDate: "2024-07-15", status: "Paid" },
  ],
  payments: [
    { id: "pay1", feeRecordId: "fee1", studentId: "s1", amount: 50000, paidOn: "2025-05-02", method: "NEFT", receiptNumber: "REC-250502-18", status: "Cleared" },
    { id: "pay2", feeRecordId: "fee2", studentId: "s2", amount: 72000, paidOn: "2025-04-30", method: "UPI", receiptNumber: "REC-250430-11", status: "Cleared" },
    { id: "pay3", feeRecordId: "fee4", studentId: "s4", amount: 42000, paidOn: "2025-05-05", method: "Card", receiptNumber: "REC-250505-06", status: "Cleared" },
    { id: "pay4", feeRecordId: "fee5", studentId: "s5", amount: 64000, paidOn: "2024-07-02", method: "NEFT", receiptNumber: "REC-240702-41", status: "Cleared" },
  ],
  academicYears: [
    { id: "ay25", schoolId: "NAC-BLR", name: "2025–26", startDate: "2025-06-01", endDate: "2026-05-31" },
    { id: "ay24", schoolId: "NAC-BLR", name: "2024–25", startDate: "2024-06-01", endDate: "2025-05-31" },
  ],
  programs: [
    { id: "prg-day", name: "Regular Day Programme", academicYearId: "ay25", academicYear: "2025–26", primary: true, daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "16:00" },
    { id: "prg-evening", name: "Evening Programme", academicYearId: "ay25", academicYear: "2025–26", primary: false, daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "17:00", endTime: "20:30" },
  ],
  classes: [
    { id: "cls-csc", name: "B.Sc. Computer Science", programId: "prg-day", program: "Regular Day Programme" },
    { id: "cls-com", name: "B.Com. Honours", programId: "prg-day", program: "Regular Day Programme" },
    { id: "cls-eco", name: "B.A. Economics", programId: "prg-day", program: "Regular Day Programme" },
    { id: "cls-bio", name: "B.Sc. Biotechnology", programId: "prg-day", program: "Regular Day Programme" },
  ],
  sections: [
    { id: "sec-csc-a", name: "A", classId: "cls-csc", class: "B.Sc. Computer Science" },
    { id: "sec-csc-b", name: "B", classId: "cls-csc", class: "B.Sc. Computer Science" },
    { id: "sec-com-b", name: "B", classId: "cls-com", class: "B.Com. Honours" },
    { id: "sec-eco-a", name: "A", classId: "cls-eco", class: "B.A. Economics" },
    { id: "sec-bio-c", name: "C", classId: "cls-bio", class: "B.Sc. Biotechnology" },
  ],
  feeStructures: [
    { id: "fs-regular", name: "2025–26 Regular Undergraduate", description: "Core annual fees for regular day programmes.", academicYearId: "ay25", academicYear: "2025–26", programId: "prg-day", program: "Regular Day Programme", classId: "cls-csc", class: "B.Sc. Computer Science", totalAmount: 78500 },
    { id: "fs-commerce", name: "2025–26 Commerce", description: "Annual fee schedule for commerce cohorts.", academicYearId: "ay25", academicYear: "2025–26", programId: "prg-day", program: "Regular Day Programme", classId: "cls-com", class: "B.Com. Honours", totalAmount: 72000 },
  ],
  feeComponents: [
    { id: "fc-tuition", name: "Tuition fee", description: "Instruction and academic services.", amount: 56000, feeStructureId: "fs-regular", discountApplicable: true, mandatory: true },
    { id: "fc-library", name: "Library & digital access", description: "Library, journals, and digital resources.", amount: 8500, feeStructureId: "fs-regular", discountApplicable: false, mandatory: true },
    { id: "fc-lab", name: "Laboratory fee", description: "Laboratory access and consumables.", amount: 14000, feeStructureId: "fs-regular", discountApplicable: false, mandatory: true },
    { id: "fc-commerce-tuition", name: "Tuition fee", description: "Instruction and academic services.", amount: 56000, feeStructureId: "fs-commerce", discountApplicable: true, mandatory: true },
    { id: "fc-commerce-library", name: "Library & digital access", description: "Library and digital resources.", amount: 16000, feeStructureId: "fs-commerce", discountApplicable: false, mandatory: true },
  ],
  attendance: [
    { id: "att-250513-csc-a", academicYearId: "ay25", programId: "prg-day", classId: "cls-csc", sectionId: "sec-csc-a", academicYear: "2025–26", program: "Regular Day Programme", class: "B.Sc. Computer Science", section: "A", date: "2025-05-13", markedBy: "Meera Iyer", entries: [{ studentId: "s1", studentName: "Aarav Sharma", status: "Present" }, { studentId: "s2", studentName: "Ishita Kulkarni", status: "Late" }] },
    { id: "att-250512-csc-a", academicYearId: "ay25", programId: "prg-day", classId: "cls-csc", sectionId: "sec-csc-a", academicYear: "2025–26", program: "Regular Day Programme", class: "B.Sc. Computer Science", section: "A", date: "2025-05-12", markedBy: "Meera Iyer", entries: [{ studentId: "s1", studentName: "Aarav Sharma", status: "Present" }, { studentId: "s2", studentName: "Ishita Kulkarni", status: "Present" }] },
  ],
  timetable: [
    { id: "tt1", day: "Monday", period: "1", time: "09:00–10:00", program: "Regular Day Programme", class: "B.Sc. Computer Science", section: "A", subject: "Data Structures & Algorithms", faculty: "Meera Iyer", room: "Lab 2" },
    { id: "tt2", day: "Monday", period: "2", time: "10:15–11:15", program: "Regular Day Programme", class: "B.Sc. Computer Science", section: "A", subject: "Discrete Mathematics", faculty: "Asha Thomas", room: "Room 204" },
    { id: "tt3", day: "Tuesday", period: "1", time: "09:00–10:00", program: "Regular Day Programme", class: "B.Com. Honours", section: "B", subject: "Financial Accounting", faculty: "Vikram Menon", room: "Room 118" },
    { id: "tt4", day: "Wednesday", period: "3", time: "11:30–12:30", program: "Regular Day Programme", class: "B.A. Economics", section: "A", subject: "Indian Economic Policy", faculty: "Sanjay Deshpande", room: "Room 106" },
    { id: "tt5", day: "Thursday", period: "2", time: "10:15–11:15", program: "Regular Day Programme", class: "B.Sc. Biotechnology", section: "C", subject: "Cell Biology", faculty: "Asha Thomas", room: "Lab 1" },
  ],
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const readDb = (): DB => {
  const saved = localStorage.getItem("nalanda-erp-db");
  if (saved) try {
    const parsed = JSON.parse(saved) as Partial<DB>;
    const merged = { ...clone(seed), ...parsed } as DB;
    merged.admissions = merged.admissions.map((admission) => {
      const oldStatus = String(admission.status);
      const status = oldStatus === "New" || oldStatus === "Under Review" ? "Pending" : oldStatus === "Approved" || oldStatus === "Enrolled" ? "Confirmed" : oldStatus === "Declined" ? "Cancelled" : oldStatus;
      return { ...admission, status };
    }) as unknown as Admission[];
    saveDb(merged);
    return merged;
  } catch { /* reset below */ }
  localStorage.setItem("nalanda-erp-db", JSON.stringify(seed));
  return clone(seed);
};
const saveDb = (db: DB) => localStorage.setItem("nalanda-erp-db", JSON.stringify(db));
const wait = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (resource: keyof DB) => ["erp", resource] as const;

export const getSession = (): User | null => {
  const id = localStorage.getItem("nalanda-erp-session");
  return id ? readDb().users.find((user) => user.id === id) ?? null : null;
};
export const setSession = (user: User | null) => user ? localStorage.setItem("nalanda-erp-session", user.id) : localStorage.removeItem("nalanda-erp-session");
let sessionMemory: User | null = getSession();
const sessionListeners = new Set<(user: User | null) => void>();
const updateSession = (user: User | null) => {
  sessionMemory = user;
  setSession(user);
  sessionListeners.forEach((listener) => listener(user));
};

export const useSession = () => {
  const [session, setSessionState] = useState<User | null>(sessionMemory);
  useEffect(() => { sessionListeners.add(setSessionState); return () => { sessionListeners.delete(setSessionState); }; }, []);
  const login = (role: Role) => { const user = readDb().users.find((item) => item.role === role) ?? null; updateSession(user); return user; };
  const logout = () => updateSession(null);
  return { session, login, logout };
};

export const useResource = <K extends keyof DB>(resource: K) => useQuery({ queryKey: key(resource), queryFn: async () => { await wait(); return readDb()[resource] as DB[K]; } });
export const useItem = <K extends keyof DB>(resource: K, id?: string) => {
  const query = useResource(resource);
  return { ...query, item: (query.data as Array<{ id: string }> | undefined)?.find((entry) => entry.id === id) as DB[K] extends Array<infer T> ? T | undefined : never };
};
export const useSaveResource = <K extends keyof DB>(resource: K) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id?: string; value: DB[K] extends Array<infer T> ? Omit<T, "id"> & { id?: string } : never }) => {
      await wait(420);
      const db = readDb(); const list = db[resource] as Array<{ id: string }>; const id = payload.id ?? payload.value.id ?? `${String(resource).slice(0, 2)}${Date.now()}`;
      const record = { ...payload.value, id } as { id: string };
      const index = list.findIndex((entry) => entry.id === id);
      if (index >= 0) list[index] = record; else list.unshift(record);
      saveDb(db); return record;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(resource) }),
  });
};
export const useDeleteResource = <K extends keyof DB>(resource: K) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => { await wait(300); const db = readDb(); db[resource] = (db[resource] as Array<{ id: string }>).filter((item) => item.id !== id) as DB[K]; saveDb(db); }, onSuccess: () => qc.invalidateQueries({ queryKey: key(resource) }) });
};
export const useAddPayment = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (payment: Omit<Payment, "id">) => { await wait(380); const db = readDb(); const record = { ...payment, id: `pay${Date.now()}` }; db.payments.unshift(record); const fee = db.fees.find((item) => item.id === payment.feeRecordId); if (fee) { fee.paidAmount += payment.amount; fee.dueAmount = Math.max(0, fee.totalAmount - fee.paidAmount); fee.status = fee.dueAmount === 0 ? "Paid" : "Partial"; } saveDb(db); return record; }, onSuccess: () => { qc.invalidateQueries({ queryKey: key("payments") }); qc.invalidateQueries({ queryKey: key("fees") }); } });
};

export const useSaveAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<AttendanceRecord, "id"> & { id?: string }) => {
      await wait(420);
      const db = readDb();
      const id = payload.id ?? `att-${Date.now()}`;
      const record = { ...payload, id };
      const index = db.attendance.findIndex((item) => item.id === id);
      if (index >= 0) db.attendance[index] = record; else db.attendance.unshift(record);
      saveDb(db);
      return record;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key("attendance") }),
  });
};

export const formatINR = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
export const initials = (name: string) => name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();