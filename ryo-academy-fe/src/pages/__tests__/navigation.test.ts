import { describe, expect, it } from "vitest";
import { isNavItemActive, matchesPath } from "@/pages/app-pages";

const fees = {
  label: "Fees",
  href: "/fees",
  children: [
    { label: "Fee Structures", href: "/fees" },
    { label: "Fee Components", href: "/fee-components" },
  ],
};

const leaf = { label: "Students", href: "/students" };

describe("matchesPath", () => {
  it("matches the exact route", () => {
    expect(matchesPath("/fees", "/fees")).toBe(true);
  });

  it("matches nested routes beneath the target", () => {
    expect(matchesPath("/fees", "/fees/new")).toBe(true);
    expect(matchesPath("/fees", "/fees/abc")).toBe(true);
    expect(matchesPath("/fees", "/fees/abc/edit")).toBe(true);
  });

  it("does not match an unrelated sibling route", () => {
    expect(matchesPath("/fees", "/fee-components")).toBe(false);
    expect(matchesPath("/classes", "/sections")).toBe(false);
  });

  it("matches /dashboard exactly and never by prefix", () => {
    expect(matchesPath("/dashboard", "/dashboard")).toBe(true);
    expect(matchesPath("/dashboard", "/dashboard/extra")).toBe(false);
  });
});

describe("isNavItemActive", () => {
  it("is active for its own route and nested routes", () => {
    expect(isNavItemActive(fees, "/fees")).toBe(true);
    expect(isNavItemActive(fees, "/fees/new")).toBe(true);
    expect(isNavItemActive(fees, "/fees/abc/edit")).toBe(true);
  });

  it("keeps the Fees parent active on /fee-components", () => {
    // The reported bug: "/fee-components".startsWith("/fees") is false, so the
    // Fees section collapsed and hid its children.
    expect(isNavItemActive(fees, "/fee-components")).toBe(true);
  });

  it("keeps the Fees parent active on nested fee-component routes", () => {
    expect(isNavItemActive(fees, "/fee-components/new")).toBe(true);
    expect(isNavItemActive(fees, "/fee-components/abc")).toBe(true);
    expect(isNavItemActive(fees, "/fee-components/abc/edit")).toBe(true);
  });

  it("is not active on unrelated routes", () => {
    expect(isNavItemActive(fees, "/students")).toBe(false);
    expect(isNavItemActive(fees, "/attendance")).toBe(false);
  });

  it("treats a childless item as active only on its own route", () => {
    expect(isNavItemActive(leaf, "/students")).toBe(true);
    expect(isNavItemActive(leaf, "/students/abc")).toBe(true);
    expect(isNavItemActive(leaf, "/staff")).toBe(false);
  });

  it("handles an item with an empty child list", () => {
    expect(isNavItemActive({ href: "/fees", children: [] }, "/fee-components")).toBe(false);
    expect(isNavItemActive({ href: "/fees", children: [] }, "/fees")).toBe(true);
  });

  it("activates a parent from any one of several children", () => {
    const academicSetup = {
      href: "/academic-years",
      children: [
        { href: "/academic-years" },
        { href: "/academic-calendar" },
        { href: "/academic-programs" },
        { href: "/classes" },
        { href: "/sections" },
      ],
    };
    for (const href of ["/sections", "/classes", "/academic-calendar", "/academic-programs"]) {
      expect(isNavItemActive(academicSetup, href)).toBe(true);
    }
    expect(isNavItemActive(academicSetup, "/staff")).toBe(false);
  });
});
