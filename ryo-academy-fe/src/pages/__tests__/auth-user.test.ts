import { describe, expect, it } from "vitest";
import { authUserToUiUser } from "@/pages/app-pages";
import { hasPermission } from "@/lib/mock-erp";
import type { CurrentUser } from "@/lib/auth-api";

const profile = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  user: { id: "u-1", email: "ananya@nalanda.edu.in", firstName: "Ananya", lastName: "Rao" },
  roles: [{ id: "r-1", name: "OFFICE_ADMIN" }],
  permissions: ["ADMISSION_READ", "FEES_READ"],
  ...overrides,
});

describe("authUserToUiUser", () => {
  it("maps a well-formed /protected/me payload", () => {
    const user = authUserToUiUser(profile());
    expect(user.id).toBe("u-1");
    expect(user.name).toBe("Ananya Rao");
    expect(user.email).toBe("ananya@nalanda.edu.in");
    expect(user.role).toBe("OFFICE_ADMIN");
    expect(user.permissions).toEqual(["ADMISSION_READ", "FEES_READ"]);
  });

  it("uses the permissions the server sent, not a role lookup", () => {
    const user = authUserToUiUser(profile({ permissions: ["SUBJECT_READ"] }));
    expect(hasPermission(user, "SUBJECT_READ")).toBe(true);
    expect(hasPermission(user, "FEES_READ")).toBe(false);
  });

  it("does not throw for a null payload (inactive or unknown user)", () => {
    expect(() => authUserToUiUser(null)).not.toThrow();
    const user = authUserToUiUser(null);
    expect(user.permissions).toEqual([]);
    expect(user.name).toBe("");
    expect(user.id).toBe("");
  });

  it("does not throw for a user with no roles", () => {
    expect(() => authUserToUiUser(profile({ roles: [] }))).not.toThrow();
    const user = authUserToUiUser(profile({ roles: [] }));
    expect(user.permissions).toEqual(["ADMISSION_READ", "FEES_READ"]);
  });

  it("falls back to a known role when the role name is unrecognised", () => {
    const user = authUserToUiUser(profile({ roles: [{ id: "r-9", name: "SUPER_ADMIN" }] }));
    expect(["OFFICE_ADMIN", "COLLEGE_ADMIN", "STAFF"]).toContain(user.role);
  });

  it("does not throw when the nested user object is null", () => {
    expect(() => authUserToUiUser(profile({ user: null }))).not.toThrow();
    const user = authUserToUiUser(profile({ user: null }));
    expect(user.name).toBe("");
    expect(user.email).toBe("");
    expect(user.permissions).toEqual(["ADMISSION_READ", "FEES_READ"]);
  });

  it("tolerates a missing permissions array", () => {
    const broken = { user: null, roles: [] } as unknown as CurrentUser;
    expect(() => authUserToUiUser(broken)).not.toThrow();
    expect(authUserToUiUser(broken).permissions).toEqual([]);
  });

  it("builds a title for the profile screen", () => {
    expect(authUserToUiUser(profile()).title).toBe("OFFICE_ADMIN - Ananya Rao");
  });
});
