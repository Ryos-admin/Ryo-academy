import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  toPermissions,
  type Permission,
  type Role,
  type User,
} from "@/lib/mock-erp";

const userWith = (permissions: string[], role: Role = "STAFF"): User => ({
  id: "u1",
  name: "Test User",
  email: "test@example.com",
  role,
  permissions: toPermissions(permissions),
  avatar: "TU",
  title: role,
});

/**
 * Transcribed from the backend RBAC constants
 * (ryo-academy-be/src/auth/permissions/permission.constants.ts). If the backend
 * gains or renames a permission this test fails, keeping the frontend in step.
 */
const BACKEND_PERMISSIONS: string[] = [
  "admission:read", "admission:create", "admission:update",
  "fees:read", "fees:create", "fees:update",
  "class:read", "class:create", "class:update",
  "subject:read", "subject:create", "subject:update",
  "attendance:read", "attendance:mark", "attendance:update",
  "staff:read", "staff:create", "staff:update",
  "student:read", "student:create", "student:update",
  "shift:read", "shift:create", "shift:update",
  "timetable:read",
];

const normalise = (name: string) => name.toUpperCase().replace(/:/g, "_");

describe("PERMISSIONS", () => {
  it("mirrors every backend permission name", () => {
    expect([...PERMISSIONS].sort()).toEqual(BACKEND_PERMISSIONS.map(normalise).sort());
  });

  it("has no duplicates", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("includes the subject permissions the backend defines", () => {
    expect(PERMISSIONS).toContain("SUBJECT_READ");
    expect(PERMISSIONS).toContain("SUBJECT_CREATE");
    expect(PERMISSIONS).toContain("SUBJECT_UPDATE");
  });
});

describe("toPermissions", () => {
  it("keeps known permission names", () => {
    expect(toPermissions(["STUDENT_READ", "FEES_READ"])).toEqual(["STUDENT_READ", "FEES_READ"]);
  });

  it("drops unknown names, failing closed", () => {
    expect(toPermissions(["STUDENT_READ", "NOT_A_PERMISSION"])).toEqual(["STUDENT_READ"]);
  });

  it("returns an empty array for null, undefined and non-arrays", () => {
    expect(toPermissions(null)).toEqual([]);
    expect(toPermissions(undefined)).toEqual([]);
    expect(toPermissions("STUDENT_READ" as unknown as string[])).toEqual([]);
  });

  it("ignores non-string entries", () => {
    expect(toPermissions([1, null, "STUDENT_READ"])).toEqual(["STUDENT_READ"]);
  });
});

describe("hasPermission", () => {
  it("reads the permission list supplied by the server", () => {
    const user = userWith(["STUDENT_READ", "CLASS_READ"]);
    expect(hasPermission(user, "STUDENT_READ")).toBe(true);
    expect(hasPermission(user, "CLASS_READ")).toBe(true);
  });

  it("denies a permission the server did not grant", () => {
    expect(hasPermission(userWith(["STUDENT_READ"]), "FEES_READ")).toBe(false);
  });

  it("denies everything for a user with no permissions", () => {
    const user = userWith([]);
    expect(hasPermission(user, "STUDENT_READ")).toBe(false);
    expect(hasPermission(user, "TIMETABLE_READ")).toBe(false);
  });

  it("denies everything for a null or undefined user instead of throwing", () => {
    expect(hasPermission(null, "STUDENT_READ")).toBe(false);
    expect(hasPermission(undefined, "STUDENT_READ")).toBe(false);
  });

  it("tolerates a user object with no permissions array", () => {
    const broken = { role: "STAFF" } as unknown as User;
    expect(hasPermission(broken, "STUDENT_READ")).toBe(false);
  });

  it("does not depend on the role at all", () => {
    // The role is presentation only; authority comes from the server list.
    const asStaff = userWith(["FEES_READ"], "STAFF");
    const asAdmin = userWith(["FEES_READ"], "COLLEGE_ADMIN");
    expect(hasPermission(asStaff, "FEES_READ")).toBe(hasPermission(asAdmin, "FEES_READ"));
    expect(hasPermission(asStaff, "ADMISSION_CREATE")).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("is true when at least one permission is granted", () => {
    expect(hasAnyPermission(userWith(["FEES_READ"]), ["ADMISSION_READ", "FEES_READ"])).toBe(true);
  });

  it("is false when none are granted", () => {
    expect(hasAnyPermission(userWith(["STUDENT_READ"]), ["FEES_READ", "ADMISSION_CREATE"])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasAnyPermission(userWith(["STUDENT_READ"]), [])).toBe(false);
  });
});

describe("hasAllPermissions", () => {
  it("is true only when every permission is granted", () => {
    expect(
      hasAllPermissions(userWith(["STUDENT_READ", "CLASS_READ"]), ["STUDENT_READ", "CLASS_READ"]),
    ).toBe(true);
  });

  it("is false when one permission is missing", () => {
    expect(hasAllPermissions(userWith(["STUDENT_READ"]), ["STUDENT_READ", "FEES_READ"])).toBe(false);
  });

  it("is vacuously true for an empty list", () => {
    expect(hasAllPermissions(userWith([]), [])).toBe(true);
  });
});

describe("Permission naming", () => {
  it("maps a backend-style name to the frontend constant", () => {
    const normalised = normalise("subject:read");
    expect(normalised).toBe("SUBJECT_READ");
    const asPermission: Permission = "SUBJECT_READ";
    expect(asPermission).toBe(normalised);
  });
});
