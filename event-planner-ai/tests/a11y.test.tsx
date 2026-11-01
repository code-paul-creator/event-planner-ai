// @vitest-environment jsdom
import axe from "axe-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanView } from "@/components/PlanView";
import { PlannerApp } from "@/components/PlannerApp";
import { composePlan } from "@/lib/plan";
import { aiFixture, validRequest } from "./fixtures";

afterEach(cleanup);

async function violations(container: HTMLElement) {
  // jsdom has no layout engine, so colour contrast can't be computed here.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("accessibility", () => {
  it("the empty form has no axe violations and labelled controls", async () => {
    const { container } = render(<PlannerApp />);
    expect(screen.getByLabelText("Event name")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Event type" })).toBeTruthy();
    expect(await violations(container)).toEqual([]);
  });

  it("announces validation errors and links them to fields", async () => {
    const { container } = render(<PlannerApp />);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Give your event a name.");
    expect(screen.getByLabelText("Event name").getAttribute("aria-invalid")).toBe("true");
    expect(await violations(container)).toEqual([]);
  });

  it("the generated plan has no axe violations", async () => {
    const plan = composePlan(aiFixture, validRequest());
    const { container } = render(<PlanView plan={plan} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(plan.timeline.length);
    expect(await violations(container)).toEqual([]);
  });

  it("tracks task completion in a live region", () => {
    const plan = composePlan(aiFixture, validRequest());
    render(<PlanView plan={plan} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    expect(screen.getByText(`1 of ${plan.timeline.length} tasks done`)).toBeTruthy();
  });
});
