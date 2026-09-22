import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { Show, createSignal } from "solid-js";
import { Dialog } from "@amends/frontend/compositions/dialog";
import { Toast } from "@amends/frontend/compositions/toast";
import { Input } from "@amends/frontend/primitives/input";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("Dialog associates content, preserves drafts, restores focus and respects prevented closes", () => {
  let ref: HTMLDialogElement | undefined;
  render(() => (
    <Dialog.Root animated={false}>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Dialog.Content
        ref={(node) => {
          ref = node;
        }}
      >
        <Dialog.Title>Details</Dialog.Title>
        <Dialog.Description>A saved draft</Dialog.Description>
        <Dialog.Body>
          <Input aria-label="Draft" />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close onClick={(event) => event.preventDefault()}>Prevent</Dialog.Close>
          <Dialog.Close>Done</Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ));
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Details" });
  expect(ref).toBe(dialog);
  expect(dialog).toHaveAccessibleDescription("A saved draft");
  expect(screen.getByRole("heading", { name: "Details" })).toHaveFocus();
  const input = screen.getByRole("textbox");
  fireEvent.input(input, { target: { value: "keep" } });
  fireEvent.click(screen.getByRole("button", { name: "Prevent" }));
  expect(dialog).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(dialog).not.toHaveAttribute("open");
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("keep");
});
it("Dialog gates Escape/backdrop while pending and avoids dismissing drags originating inside", () => {
  const [dismissible, setDismissible] = createSignal(false);
  render(() => (
    <Dialog.Root defaultOpen animated={false} dismissible={dismissible()}>
      <Dialog.Content>
        <Dialog.Title>Pending</Dialog.Title>
      </Dialog.Content>
    </Dialog.Root>
  ));
  const dialog = screen.getByRole("dialog");
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    left: 20,
    right: 200,
    top: 20,
    bottom: 200,
  } as DOMRect);
  const outside = () => {
    fireEvent.pointerDown(dialog, { clientX: 1, clientY: 1 });
    fireEvent.click(dialog, { clientX: 1, clientY: 1 });
  };
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  outside();
  expect(dialog).toHaveAttribute("open");
  setDismissible(true);
  fireEvent.pointerDown(dialog, { clientX: 50, clientY: 50 });
  fireEvent.click(dialog, { clientX: 1, clientY: 1 });
  expect(dialog).toHaveAttribute("open");
  outside();
  expect(dialog).not.toHaveAttribute("open");
});
it("Dialog controlled close requests leave state with the caller and use an explicit return target", () => {
  const [open, setOpen] = createSignal(false),
    change = vi.fn();
  let target: HTMLButtonElement | undefined;
  render(() => (
    <>
      <button
        ref={(node) => {
          target = node;
        }}
      >
        Next item
      </button>
      <Dialog.Root animated={false} open={open()} onOpenChange={change} returnFocus={() => target}>
        <Dialog.Trigger>Open</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Controlled</Dialog.Title>
          <Dialog.Close>Done</Dialog.Close>
        </Dialog.Content>
      </Dialog.Root>
    </>
  ));
  screen.getByRole("button", { name: "Open" }).focus();
  setOpen(true);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(change).toHaveBeenCalledWith(false);
  expect(screen.getByRole("dialog")).toBeVisible();
  setOpen(false);
  expect(target).toHaveFocus();
});

function Trigger(props: { action?: boolean; persistent?: boolean; prevent?: boolean }) {
  const toast = Toast.useToast();
  let count = 0;
  return (
    <>
      <button
        onClick={() => {
          const n = ++count;
          toast.show(() => (
            <Toast.Root persistent={props.persistent}>
              <Toast.Content>
                <Toast.Title>Message {n}</Toast.Title>
                <Toast.Description>Details</Toast.Description>
              </Toast.Content>
              {props.action && (
                <Toast.Action
                  onClick={(event) => {
                    if (props.prevent) event.preventDefault();
                  }}
                >
                  Undo
                </Toast.Action>
              )}
              <Toast.Close />
            </Toast.Root>
          ));
        }}
      >
        Show
      </button>
      <button onClick={toast.clear}>Clear</button>
    </>
  );
}
it("Toast queues have independent lifetimes and only visible messages start timers", () => {
  vi.useFakeTimers();
  render(() => (
    <>
      <section aria-label="first">
        <Toast.Provider duration={1000} limit={1}>
          <Trigger />
          <Toast.Viewport />
        </Toast.Provider>
      </section>
      <section aria-label="second">
        <Toast.Provider duration={5000}>
          <Trigger action />
          <Toast.Viewport />
        </Toast.Provider>
      </section>
    </>
  ));
  const first = within(screen.getByRole("region", { name: "first" })),
    second = within(screen.getByRole("region", { name: "second" }));
  fireEvent.click(first.getByText("Show"));
  fireEvent.click(first.getByText("Show"));
  fireEvent.click(second.getByText("Show"));
  expect(first.getAllByRole("status")).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  expect(first.getByRole("status")).toHaveTextContent("Message 2");
  vi.advanceTimersByTime(999);
  expect(first.getByRole("status")).toBeVisible();
  vi.advanceTimersByTime(1);
  expect(first.queryByRole("status")).toBeNull();
  fireEvent.click(first.getByText("Clear"));
  expect(second.getByRole("status")).toBeVisible();
});
it("Toast pauses the remaining lifetime during hover, keyboard focus and window inactivity", () => {
  vi.useFakeTimers();
  render(() => (
    <Toast.Provider duration={1000}>
      <Trigger />
      <Toast.Viewport />
    </Toast.Provider>
  ));
  const trigger = screen.getByText("Show");
  trigger.focus();
  fireEvent.click(trigger);
  const toast = screen.getByRole("status"),
    list = toast.parentElement!;
  expect(trigger).toHaveFocus();
  expect(toast).toHaveAttribute("aria-live", "polite");
  vi.advanceTimersByTime(200);
  fireEvent.pointerEnter(list);
  vi.advanceTimersByTime(2000);
  expect(toast).toBeVisible();
  fireEvent.pointerLeave(list);
  vi.advanceTimersByTime(200);
  toast.focus();
  vi.advanceTimersByTime(2000);
  expect(toast).toBeVisible();
  trigger.focus();
  vi.advanceTimersByTime(200);
  fireEvent(window, new Event("blur"));
  vi.advanceTimersByTime(2000);
  expect(toast).toBeVisible();
  fireEvent(window, new Event("focus"));
  vi.advanceTimersByTime(399);
  expect(toast).toBeVisible();
  vi.advanceTimersByTime(1);
  expect(screen.queryByRole("status")).toBeNull();
  expect(trigger).toHaveFocus();
});
it("Toast actions persist, support cancellation, and Escape returns focus without escaping to a parent", () => {
  vi.useFakeTimers();
  const parentKey = vi.fn();
  render(() => (
    <div onKeyDown={parentKey}>
      <Toast.Provider duration={1000}>
        <Trigger action prevent />
        <Toast.Viewport />
      </Toast.Provider>
    </div>
  ));
  const trigger = screen.getByText("Show");
  trigger.focus();
  fireEvent.click(trigger);
  vi.advanceTimersByTime(10000);
  expect(screen.getByRole("status")).toBeVisible();
  const action = screen.getByRole("button", { name: "Undo" });
  action.focus();
  fireEvent.click(action);
  expect(screen.getByRole("status")).toBeVisible();
  fireEvent.keyDown(action, { key: "Escape" });
  expect(screen.queryByRole("status")).toBeNull();
  expect(trigger).toHaveFocus();
  expect(parentKey).not.toHaveBeenCalled();
});
it("Toast provider disposal clears timers and queued closures without affecting another provider", () => {
  vi.useFakeTimers();
  const [mounted, setMounted] = createSignal(true);
  render(() => (
    <>
      <Show when={mounted()}>
        <Toast.Provider limit={1}>
          <Trigger />
          <Toast.Viewport />
        </Toast.Provider>
      </Show>
      <Toast.Provider>
        <Trigger action />
        <Toast.Viewport />
      </Toast.Provider>
    </>
  ));
  const triggers = screen.getAllByText("Show");
  fireEvent.click(triggers[0]!);
  fireEvent.click(triggers[0]!);
  fireEvent.click(triggers[1]!);
  setMounted(false);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  vi.advanceTimersByTime(6000);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  setMounted(true);
  expect(screen.getAllByRole("status")).toHaveLength(1);
});
