import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import {
  InspectorLayout,
  ConditionList,
  TraceItem,
  TraceList,
  WorkItemList,
  WorkItemRow,
} from "../src/components/index.ts";

afterEach(cleanup);

it("expands a rule with the keyboard and exposes the evidence without relying on colour", async () => {
  const [expanded, setExpanded] = createSignal(false);
  render(() => (
    <TraceList label="Trace">
      <TraceItem
        index="rule 0"
        title="Billing"
        result="skipped"
        expanded={expanded()}
        onExpandedChange={setExpanded}
      >
        <ConditionList
          items={[
            { name: "channel", passed: false, expected: "billing", observed: "arrived on support" },
          ]}
        />
      </TraceItem>
    </TraceList>
  ));
  const button = screen.getByRole("button");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByLabelText("Failed")).toBeDefined();
  expect(screen.getByText("arrived on support")).toBeDefined();
  await user.keyboard("{Enter}");
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

it("keeps the inspected row independent of bulk selection", async () => {
  const [selected, setSelected] = createSignal(false);
  render(() => (
    <WorkItemList label="Queue">
      <WorkItemRow
        title="Billing"
        onOpen={() => {}}
        active
        selection={{ selected: selected(), onChange: setSelected }}
      />
    </WorkItemList>
  ));
  expect(screen.getByRole("button", { name: "Billing" }).getAttribute("aria-current")).toBe("true");
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  await userEvent.setup().click(checkbox);
  expect(checkbox.checked).toBe(true);
  expect(screen.getByRole("button", { name: "Billing" }).getAttribute("aria-current")).toBe("true");
});

it("opens an inspector from a row and returns focus when its X closes it", async () => {
  const [open, setOpen] = createSignal(false);
  render(() => (
    <InspectorLayout
      title="Decision"
      open={open()}
      onOpenChange={setOpen}
      inspector={() => <p>Recorded decision</p>}
    >
      <button onClick={() => setOpen(true)}>Task row</button>
    </InspectorLayout>
  ));
  const user = userEvent.setup();
  const row = screen.getByRole("button", { name: "Task row" });
  await user.click(row);
  expect(screen.getByRole("dialog", { name: "Decision" })).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Close decision" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(row);
});
