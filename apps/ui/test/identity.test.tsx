import { afterAll, afterEach, beforeAll, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, For } from "solid-js";
import { AccountPopover, Identity, NavigationItem } from "../src/components/index.ts";

afterEach(cleanup);
// Match the browser's initial animation value so tooltip presence can finish closing.
const defaults = document.createElement("style");
defaults.textContent = "* { animation-name: none; }";
beforeAll(() => document.head.append(defaults));
afterAll(() => defaults.remove());

it("shows every identity's name without redundant graphics or extra tab stops", () => {
  const kinds = ["user", "agent", "contact", "system"] as const;
  render(() => <For each={kinds}>{(kind) => <Identity name={`${kind} name`} kind={kind} />}</For>);
  for (const kind of kinds) expect(screen.getByText(`${kind} name`)).toBeDefined();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
});

it("reveals compact names on hover and focus, updates renamed identities, and dismisses on Escape", async () => {
  const [name, setName] = createSignal("Priya Raman");
  render(() => <Identity name={name()} kind="contact" compact />);
  const user = userEvent.setup();
  const badge = screen.getByRole("img", { name: "Priya Raman" });
  expect(badge.textContent).toBe("PR");
  expect(screen.queryByText("Priya Raman")).toBeNull();
  await user.hover(badge);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toBe("Priya Raman");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  await user.unhover(badge);
  await user.tab();
  expect(document.activeElement).toBe(badge);
  expect((await screen.findByRole("tooltip")).id).toBe(badge.getAttribute("aria-describedby"));
  setName("Ravi Kaur");
  expect(screen.getByRole("img", { name: "Ravi Kaur" })).toBe(badge);
  expect(badge.textContent).toBe("RK");
  expect(screen.getByRole("tooltip").textContent).toBe("Ravi Kaur");
});

it("uses the navigation link for tooltip focus and preserves that link when the sidebar expands", async () => {
  const [compact, setCompact] = createSignal(true);
  const selected = vi.fn((event: MouseEvent) => event.preventDefault());
  render(() => (
    <NavigationItem
      label="Ada"
      identityKind="agent"
      href="/ada"
      count={3}
      compact={compact()}
      onClick={selected}
      renderLink={(props) => <a {...props} data-router-link />}
    />
  ));
  const user = userEvent.setup();
  await user.tab();
  const link = screen.getByRole("link", { name: "Ada (3)" });
  expect(document.activeElement).toBe(link);
  expect((await screen.findByRole("tooltip")).textContent).toBe("Ada");
  expect(link.querySelector('button, a, [tabindex="0"]')).toBeNull();
  await user.keyboard("{Enter}");
  expect(selected).toHaveBeenCalledOnce();
  setCompact(false);
  expect(screen.getByRole("link", { name: "Ada (3)" })).toBe(link);
  expect(document.activeElement).toBe(link);
  expect(within(link).getByText("Ada")).toBeDefined();
  expect(within(link).getByText("3")).toBeDefined();
});

it("shares the account button between its name tooltip and account popover", async () => {
  render(() => (
    <AccountPopover
      name="Jo Mercer"
      email="jo@example.test"
      compact
      theme={{
        preference: () => "cotton",
        resolved: () => "cotton",
        choose: () => {},
      }}
    />
  ));
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Your account — Jo Mercer" });
  await user.tab();
  expect((await screen.findByRole("tooltip")).textContent).toBe("Jo Mercer");
  await user.keyboard("{Enter}");
  const panel = await screen.findByRole("dialog", { name: "Your account" });
  expect(within(panel).getByText("Jo Mercer")).toBeDefined();
  expect(within(panel).getByText("jo@example.test")).toBeDefined();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
