import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { Breadcrumbs, PageHeader } from "../src/components/index.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps navigation beside ancestry, above title/actions and metadata", () => {
  const { container } = render(() => (
    <PageHeader
      title="Agents"
      breadcrumbs={
        <Breadcrumbs items={[{ label: "Configure", href: "/configure" }, { label: "Agents" }]} />
      }
      navigation={<button>Open navigation</button>}
      actions={[{ label: "Add agent", icon: "+", onClick: () => {} }]}
      summary="3 active"
    />
  ));
  const header = container.querySelector("header")!;
  expect(
    header.children[0]?.contains(screen.getByRole("navigation", { name: "Breadcrumbs" })),
  ).toBe(true);
  expect(header.children[1]?.contains(screen.getByRole("heading", { name: "Agents" }))).toBe(true);
  expect(
    header.children[0]?.contains(screen.getByRole("button", { name: "Open navigation" })),
  ).toBe(true);
  expect(header.children[1]?.contains(screen.getByRole("button", { name: "Add agent" }))).toBe(
    true,
  );
  expect(header.children[2]?.textContent).toBe("3 active");
  expect(screen.getByRole("link", { name: "Configure" }).getAttribute("href")).toBe("/configure");
  expect(
    within(screen.getByRole("navigation")).getByText("Agents").getAttribute("aria-current"),
  ).toBe("page");
});

it("retains the focused action while its label and selection state change", async () => {
  const [selecting, setSelecting] = createSignal(false);
  render(() => (
    <PageHeader
      title="Tasks"
      actions={[
        {
          label: selecting() ? "Done" : "Select tasks",
          icon: "☑",
          pressed: selecting(),
          variant: "secondary",
          onClick: () => setSelecting(!selecting()),
        },
        { label: "New task", icon: "+", onClick: () => {} },
      ]}
    />
  ));
  const action = screen.getByRole("button", { name: "Select tasks" });
  await userEvent.setup().click(action);
  expect(screen.getByRole("button", { name: "Done" })).toBe(action);
  expect(action.getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(action);
  expect(
    within(screen.getByRole("navigation", { name: "Breadcrumbs" })).getByText("Tasks"),
  ).toBeDefined();
});

it("keeps intermediate ancestors available on mobile and restores the trigger on Escape", async () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  const defaults = document.createElement("style");
  defaults.textContent = "* { animation-name: none; }";
  document.head.append(defaults);
  try {
    render(() => (
      <Breadcrumbs
        items={[
          { label: "Tasks", href: "/tasks" },
          { label: "A long task", href: "/tasks/1" },
          { label: "Resources", href: "/tasks/1/resources" },
          { label: "ledger.csv" },
        ]}
      />
    ));
    expect(screen.queryByRole("link", { name: "A long task" })).toBeNull();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Show parent pages" });
    await user.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Parent pages" });
    expect(within(panel).getByRole("link", { name: "A long task" }).getAttribute("href")).toBe(
      "/tasks/1",
    );
    expect(within(panel).getByRole("link", { name: "Resources" }).getAttribute("href")).toBe(
      "/tasks/1/resources",
    );
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  } finally {
    defaults.remove();
  }
});
