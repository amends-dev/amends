import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { Button, Dialog, ConfirmationDialog } from "../src/components/index.ts";

afterEach(cleanup);

it("opens with a name and description, focuses content, and restores the trigger on Escape", async () => {
  const user = userEvent.setup();
  const [open, setOpen] = createSignal(false);
  render(() => (
    <div data-theme="soot">
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Details"
        description="Read these details."
      >
        <Button>Inside</Button>
      </Dialog>
    </div>
  ));
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Details" }) as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  expect(dialog.closest("[data-theme]")?.getAttribute("data-theme")).toBe("soot");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Read these details.",
  );
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Details" }));
  // Happy DOM does not implement the browser's Escape-to-cancel behavior.
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(open()).toBe(false);
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("keeps confirmation open on errors and blocks dismissal and repeated commands while pending", async () => {
  const user = userEvent.setup();
  const [open, setOpen] = createSignal(true);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const confirm = vi.fn(() => setPending(true));
  render(() => (
    <ConfirmationDialog
      open={open()}
      onOpenChange={setOpen}
      title="Cancel task?"
      confirmLabel="Cancel task"
      cancelLabel="Keep task"
      pending={pending()}
      error={error()}
      onConfirm={confirm}
    />
  ));
  const dialog = screen.getByRole("alertdialog", { name: "Cancel task?" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep task" }));
  const action = screen.getByRole("button", { name: "Cancel task" });
  await user.click(action);
  await user.click(action);
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  await user.click(screen.getByRole("button", { name: "Keep task" }));
  expect(open()).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(1);
  setPending(false);
  setError("Try again.");
  expect(screen.getByRole("alert").textContent).toBe("Try again.");
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(open()).toBe(false);
});

it("restores focus when unmounted and uses a fallback when the trigger disappears", async () => {
  const user = userEvent.setup();
  const [open, setOpen] = createSignal(false);
  let fallback!: HTMLButtonElement;
  const { unmount } = render(() => (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Button
        ref={(node) => {
          fallback = node;
        }}
      >
        Fallback
      </Button>
      <Dialog open={open()} onOpenChange={setOpen} title="Details" returnFocus={() => fallback} />
    </>
  ));
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.click(trigger);
  trigger.remove();
  setOpen(false);
  expect(document.activeElement).toBe(fallback);
  setOpen(true);
  unmount();
  expect(document.querySelector("dialog[open]")).toBeNull();
});
