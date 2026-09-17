import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  Tooltip,
  ConfirmationDialog,
  Dialog,
} from "../src/components/index.ts";

afterEach(cleanup);
// Happy DOM leaves the initial computed animation name empty; browsers report "none".
const defaults = document.createElement("style");
defaults.textContent = "* { animation-name: none; }";
beforeAll(() => {
  document.head.append(defaults);
});
afterAll(() => defaults.remove());

it("supports keyboard navigation, skips disabled actions, and restores focus after selection", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(() => (
    <DropdownMenu trigger={(props) => <Button {...props}>Actions</Button>}>
      <DropdownMenuItem onSelect={select}>Alpha</DropdownMenuItem>
      <DropdownMenuItem disabled onSelect={select}>
        Blocked
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={select}>Cancel</DropdownMenuItem>
    </DropdownMenu>
  ));
  const trigger = screen.getByRole("button", { name: "Actions" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Alpha" })),
  );
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Cancel" }));
  await user.keyboard("{Home}c");
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Cancel" }));
  await user.keyboard("{Enter}");
  await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("hands focus from a menu to confirmation and back to the menu trigger", async () => {
  const user = userEvent.setup();
  const [open, setOpen] = createSignal(false);
  render(() => (
    <>
      <DropdownMenu trigger={(props) => <Button {...props}>Actions</Button>}>
        <DropdownMenuItem onSelect={() => setOpen(true)}>Cancel</DropdownMenuItem>
      </DropdownMenu>
      <ConfirmationDialog
        open={open()}
        onOpenChange={setOpen}
        title="Confirm?"
        confirmLabel="Confirm"
        cancelLabel="Keep"
        onConfirm={() => setOpen(false)}
      />
    </>
  ));
  const trigger = screen.getByRole("button", { name: "Actions" });
  await user.click(trigger);
  await user.click(await screen.findByRole("menuitem", { name: "Cancel" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep" })),
  );
  await user.click(screen.getByRole("button", { name: "Keep" }));
  expect(document.activeElement).toBe(trigger);
});

it("keeps portaled menus inside their modal and follows changes to a nested theme", async () => {
  const user = userEvent.setup();
  const [theme, setTheme] = createSignal("soot");
  render(() => (
    <div data-theme={theme()}>
      <Dialog open onOpenChange={() => {}} title="Inside">
        <DropdownMenu trigger={(props) => <Button {...props}>Actions</Button>}>
          <DropdownMenuItem onSelect={() => {}}>Alpha</DropdownMenuItem>
        </DropdownMenu>
      </Dialog>
    </div>
  ));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  const menu = await screen.findByRole("menu");
  expect(menu.closest("dialog")).toBe(screen.getByRole("dialog"));
  expect(menu.closest("[data-theme]")?.getAttribute("data-theme")).toBe("soot");
  setTheme("cotton");
  await waitFor(() =>
    expect(menu.closest("[data-theme]")?.getAttribute("data-theme")).toBe("cotton"),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect((screen.getByRole("dialog") as HTMLDialogElement).open).toBe(true);
});

it("describes a named trigger on focus and dismisses with Escape", async () => {
  const user = userEvent.setup();
  render(() => (
    <Tooltip content="Extra details" trigger={(props) => <Button {...props}>Help</Button>} />
  ));
  await user.tab();
  const tooltip = await screen.findByRole("tooltip");
  const trigger = screen.getByRole("button", { name: "Help" });
  expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(tooltip.textContent).toBe("Extra details");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
