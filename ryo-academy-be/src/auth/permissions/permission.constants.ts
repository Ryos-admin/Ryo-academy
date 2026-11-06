export const PERMISSIONS = {
  ADMISSION_READ: 'admission:read',
  ADMISSION_CREATE: 'admission:create',
  ADMISSION_UPDATE: 'admission:update',

  FEES_READ: 'fees:read',
  FEES_CREATE: 'fees:create',
  FEES_UPDATE: 'fees:update',
  FEES_REVERSE: 'fees:reverse',
  EXPENSE_CREATE: 'expense:create',
  EXPENSE_DELETE: 'expense:delete',

  CLASS_READ: 'class:read',
  CLASS_CREATE: 'class:create',
  CLASS_UPDATE: 'class:update',

  SUBJECT_READ: 'subject:read',
  SUBJECT_CREATE: 'subject:create',
  SUBJECT_UPDATE: 'subject:update',

  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_UPDATE: 'attendance:update',

  STAFF_READ: 'staff:read',
  STAFF_CREATE: 'staff:create',
  STAFF_UPDATE: 'staff:update',

  STUDENT_READ: 'student:read',
  STUDENT_CREATE: 'student:create',
  STUDENT_UPDATE: 'student:update',

  SHIFT_READ: 'shift:read',
  SHIFT_CREATE: 'shift:create',
  SHIFT_UPDATE: 'shift:update',

  TIMETABLE_READ: 'timetable:read',

  INSTALLMENT_TEMPLATE_READ: 'installment-template:read',
  INSTALLMENT_TEMPLATE_CREATE: 'installment-template:create',
  INSTALLMENT_TEMPLATE_DEACTIVATE: 'installment-template:deactivate',

  INSTALLMENT_SCHEDULE_READ: 'installment-schedule:read',
  INSTALLMENT_SCHEDULE_MANAGE: 'installment-schedule:manage',
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
