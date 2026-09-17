import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { NavigationItem } from "../src/components/index.ts";

afterEach(cleanup);

it("preserves the destination and accessible name when compact, and updates the current page", () => {
  const [compact, setCompact] = createSignal(false);
  const [active, setActive] = createSignal(false);
  render(() => (
    <NavigationItem href="/tasks" label="Tasks" icon="#" compact={compact()} active={active()} />
  ));
  const link = screen.getByRole("link", { name: "Tasks" });
  expect(link.getAttribute("href")).toBe("/tasks");
  expect(link.getAttribute("aria-current")).toBeNull();
  expect(screen.getByText("Tasks")).toBeTruthy();
  setCompact(true);
  setActive(true);
  expect(screen.getByRole("link", { name: "Tasks" })).toBe(link);
  expect(screen.queryByText("Tasks")).toBeNull();
  expect(link.getAttribute("title")).toBe("Tasks");
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe("#");
});

it("forwards link semantics and activation to an application-supplied anchor", async () => {
  const selected = vi.fn((event: MouseEvent) => event.preventDefault());
  render(() => (
    <NavigationItem
      href="/tasks"
      label="Tasks"
      icon="#"
      onClick={selected}
      renderLink={(props) => <a {...props} data-router-link />}
    />
  ));
  const link = screen.getByRole("link", { name: "Tasks" });
  expect(link.hasAttribute("data-router-link")).toBe(true);
  expect(link.getAttribute("href")).toBe("/tasks");
  await userEvent.setup().click(link);
  expect(selected).toHaveBeenCalledOnce();
});
