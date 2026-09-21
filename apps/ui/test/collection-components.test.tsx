import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import {
  CollapsibleSection,
  WorkItemList,
  WorkItemRow,
  StatusIndicator,
  EmptyState,
  Button,
  CollectionView,
  SelectionBar,
} from "../src/components/index.ts";
afterEach(cleanup);
it("discloses a named section with keyboard and removes collapsed rows from navigation", async () => {
  const [expanded, setExpanded] = createSignal(false);
  render(() => (
    <CollapsibleSection
      title="Settled"
      count={1}
      expanded={expanded()}
      onExpandedChange={setExpanded}
    >
      <a href="#task">Archived receipts</a>
    </CollapsibleSection>
  ));
  expect(screen.queryByRole("link")).toBeNull();
  const toggle = screen.getByRole("button", { expanded: false });
  expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.hidden).toBe(true);
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("link", { name: "Archived receipts" })).toBeTruthy();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("link"));
});
it("keeps selection, opening, and row actions independent", async () => {
  const open = vi.fn();
  const action = vi.fn();
  const [selected, setSelected] = createSignal(false);
  render(() => (
    <WorkItemList label="Tasks">
      <WorkItemRow
        title="Reconcile invoices"
        onOpen={open}
        indicator={<StatusIndicator tone="danger" label="Failed" />}
        selection={{ selected: selected(), onChange: setSelected }}
        actions={<Button onClick={action}>Retry</Button>}
      />
    </WorkItemList>
  ));
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Select Reconcile invoices" }));
  expect(selected()).toBe(true);
  expect(open).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(action).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Reconcile invoices" }));
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByRole("img", { name: "Failed" })).toBeTruthy();
});
it("keeps footer actions outside the scrolling region and exposes the empty-state action", async () => {
  const clear = vi.fn();
  render(() => (
    <CollectionView
      label="Tasks"
      footer={<SelectionBar count={2} actions={<Button>Archive</Button>} />}
    >
      <EmptyState
        title="Nothing matches"
        description="Try fewer filters."
        action={<Button onClick={clear}>Clear filters</Button>}
      />
    </CollectionView>
  ));
  expect(
    screen
      .getByRole("region", { name: "Tasks" })
      .contains(screen.getByRole("button", { name: "Archive" })),
  ).toBe(false);
  await userEvent.setup().click(screen.getByRole("button", { name: "Clear filters" }));
  expect(clear).toHaveBeenCalledOnce();
});
