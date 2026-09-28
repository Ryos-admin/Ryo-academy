import { useForm } from "react-hook-form";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MultiSelectField } from "@/pages/academic-pages";

const OPTIONS: string[][] = [
  ["MON", "Monday"],
  ["TUE", "Tuesday"],
  ["WED", "Wednesday"],
  ["THU", "Thursday"],
  ["FRI", "Friday"],
  ["SAT", "Saturday"],
  ["SUN", "Sunday"],
];

function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { daysOfWeek: initial },
  });
  return (
    <form>
      <MultiSelectField
        form={form}
        name="daysOfWeek"
        label="Days of week"
        options={OPTIONS}
        placeholder="Select days"
      />
    </form>
  );
}

/**
 * Radix marks outside content `aria-hidden` while the menu is open (modal by
 * default), which removes the trigger from the accessibility tree. Look it up
 * by id so assertions still work once the menu is open.
 */
const trigger = () => document.getElementById("daysOfWeek") as HTMLButtonElement;

const options = () => screen.getAllByRole("menuitemcheckbox");

describe("MultiSelectField", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<Harness />);
    expect(trigger()).toHaveTextContent("Select days");
  });

  it("associates the label with the trigger button", () => {
    render(<Harness />);
    const label = screen.getByText("Days of week");
    expect(label).toHaveAttribute("for", "daysOfWeek");
    expect(document.getElementById("daysOfWeek")).toBe(trigger());
  });

  it("opens a menu with all seven unchecked days", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());

    const items = options();
    expect(items).toHaveLength(7);
    expect(items.map((item) => item.textContent)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    for (const item of items) {
      expect(item).toHaveAttribute("aria-checked", "false");
    }
  });

  it("shows a single selected day on the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Monday" }));

    expect(trigger()).toHaveTextContent("Monday");
  });

  it("keeps the menu open after checking a day", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Monday" }));

    expect(options()).toHaveLength(7);
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Monday" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("joins several selected days on the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Monday" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Wednesday" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Friday" }));

    expect(trigger()).toHaveTextContent("Monday, Wednesday, Friday");
  });

  it("removes a day when it is unchecked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Monday" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Wednesday" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Wednesday" }));

    expect(trigger()).toHaveTextContent("Monday");
    expect(trigger()).not.toHaveTextContent("Wednesday");
  });

  it("always lists selected days in Monday-to-Sunday order", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Saturday" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Monday" }));

    expect(trigger().textContent).toContain("Monday, Saturday");
  });

  it("pre-checks days supplied as initial values", () => {
    render(<Harness initial={["MON", "FRI"]} />);

    expect(trigger()).toHaveTextContent("Monday, Friday");
  });

  it("returns to the placeholder after selecting then clearing everything", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    for (const name of ["Monday", "Tuesday", "Sunday"]) {
      await user.click(screen.getByRole("menuitemcheckbox", { name }));
    }
    expect(trigger()).toHaveTextContent("Monday, Tuesday, Sunday");

    for (const name of ["Monday", "Tuesday", "Sunday"]) {
      await user.click(screen.getByRole("menuitemcheckbox", { name }));
    }
    expect(trigger()).toHaveTextContent("Select days");
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    expect(options()).toHaveLength(7);

    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0);
  });

  it("exposes each day as a checkbox item inside one menu", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemcheckbox")).toHaveLength(7);
  });
});
