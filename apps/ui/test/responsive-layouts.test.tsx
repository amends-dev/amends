import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import {
  DetailLayout,
  FollowLatest,
  InspectorLayout,
  MasterDetail,
} from "../src/components/index.ts";
import { InspectorHostContext } from "../src/components/inspector-host.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function resizeObserver() {
  const listeners = new Map<Element, (width: number) => void>();
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        listeners.set(target, (width) =>
          this.callback([{ target, contentRect: { width } } as ResizeObserverEntry], this),
        );
      }
      unobserve(target: Element) {
        listeners.delete(target);
      }
      disconnect() {}
    },
  );
  return (target: Element, width: number) => {
    const listener = listeners.get(target);
    expect(listener).toBeDefined();
    listener!(width);
  };
}

it("keeps companion drafts mounted across width changes and panel switches", async () => {
  const resize = resizeObserver();
  const { container } = render(() => (
    <DetailLayout primary={<textarea aria-label="Draft" />} detail={<p>Execution details</p>} />
  ));
  const user = userEvent.setup();
  const draft = screen.getByRole("textbox", { name: "Draft" }) as HTMLTextAreaElement;
  await user.type(draft, "Keep my answer");
  await user.click(screen.getByRole("tab", { name: "details" }));
  resize(container.firstElementChild!, 1000);
  await Promise.resolve();
  expect(screen.getAllByRole("region")).toHaveLength(2);
  expect(document.activeElement).toBe(screen.getByRole("region", { name: "details" }));
  resize(container.firstElementChild!, 390);
  expect(screen.getByRole("tab", { name: "details" }).getAttribute("aria-selected")).toBe("true");
  await user.click(screen.getByRole("tab", { name: "thread" }));
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
  expect(draft.value).toBe("Keep my answer");
  resize(container.firstElementChild!, 1000);
  await user.click(draft);
  resize(container.firstElementChild!, 390);
  expect(screen.getByRole("tab", { name: "thread" }).getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(draft);
});

it("keeps conversation drafts when the thread moves between the mobile modal and shell dock", async () => {
  const [width, setWidth] = createSignal(390);
  const [open, setOpen] = createSignal(false);
  const [reply, setReply] = createSignal("");
  let mounts = 0;
  let dock!: HTMLDivElement;
  render(() => (
    <>
      <div
        ref={(node) => {
          dock = node;
        }}
      />
      <InspectorHostContext.Provider value={{ mount: () => dock, width }}>
        <InspectorLayout
          presentation="conversation"
          title="Thread"
          open={open()}
          onOpenChange={setOpen}
          inspector={() => {
            mounts++;
            return (
              <input
                aria-label="Reply draft"
                value={reply()}
                onInput={(event) => setReply(event.currentTarget.value)}
              />
            );
          }}
        >
          <input aria-label="New thread draft" />
          <button onClick={() => setOpen(true)}>View thread</button>
        </InspectorLayout>
      </InspectorHostContext.Provider>
    </>
  ));
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "View thread" });
  const streamDraft = screen.getByRole("textbox", { name: "New thread draft" }) as HTMLInputElement;
  await user.type(streamDraft, "Start a different thread");
  await user.click(trigger);
  const modal = screen.getByRole("dialog", { name: "Thread" }) as HTMLDialogElement;
  expect(modal.open).toBe(true);
  expect(modal.getAttribute("data-placement")).toBe("end");
  const draft = screen.getByRole("textbox", { name: "Reply draft" }) as HTMLInputElement;
  expect(modal.contains(draft)).toBe(true);
  await user.type(draft, "Keep this reply");
  setWidth(1100);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(open()).toBe(true);
  expect(dock.contains(draft)).toBe(true);
  expect(screen.getByRole("textbox", { name: "Reply draft" })).toBe(draft);
  setWidth(390);
  expect(screen.getByRole("dialog", { name: "Thread" }).contains(draft)).toBe(true);
  expect(draft.value).toBe("Keep this reply");
  expect(screen.getByRole("textbox", { name: "Reply draft" })).toBe(draft);
  await user.type(draft, " after resizing");
  expect(reply()).toBe("Keep this reply after resizing");
  expect(mounts).toBe(1);
  await user.click(screen.getByRole("button", { name: "Close thread" }));
  expect(document.activeElement).toBe(trigger);
  expect(streamDraft.value).toBe("Start a different thread");
  await user.click(trigger);
  fireEvent(
    screen.getByRole("dialog", { name: "Thread" }),
    new Event("cancel", { cancelable: true }),
  );
  expect(open()).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("keeps the log reading position during updates and resumes following at the bottom", () => {
  const resize = resizeObserver();
  const [count, setCount] = createSignal(1);
  render(() => <FollowLatest count={count()}>Log entries</FollowLatest>);
  const viewport = screen.getByLabelText("Scrollable turn log");
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 1000 },
  });
  resize(viewport, 390);
  expect(viewport.scrollTop).toBe(1000);
  viewport.scrollTop = 300;
  fireEvent.scroll(viewport);
  setCount(2);
  resize(viewport, 1000);
  expect(viewport.scrollTop).toBe(300);
  viewport.scrollTop = 800;
  fireEvent.scroll(viewport);
  Object.defineProperty(viewport, "scrollHeight", { value: 1200 });
  setCount(3);
  expect(viewport.scrollTop).toBe(1200);
});

it("preserves inspector content between docked and modal layouts and restores its trigger", async () => {
  const resize = resizeObserver();
  const [open, setOpen] = createSignal(false);
  let mounts = 0;
  const { container } = render(() => (
    <InspectorLayout
      title="Decision"
      open={open()}
      onOpenChange={setOpen}
      inspector={() => {
        mounts++;
        return <input aria-label="Inspector draft" />;
      }}
    >
      <button onClick={() => setOpen(true)}>Inspect task</button>
    </InspectorLayout>
  ));
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Inspect task" });
  resize(container.firstElementChild!, 1100);
  await user.click(trigger);
  const draft = screen.getByRole("textbox", { name: "Inspector draft" }) as HTMLInputElement;
  await user.type(draft, "Keep this note");
  resize(container.firstElementChild!, 390);
  expect(screen.getByRole("dialog", { name: "Decision" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Inspector draft" })).toBe(draft);
  resize(container.firstElementChild!, 1100);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(open()).toBe(true);
  expect(screen.getByRole("textbox", { name: "Inspector draft" })).toBe(draft);
  expect(draft.value).toBe("Keep this note");
  expect(mounts).toBe(1);
  await user.click(screen.getByRole("button", { name: "Close decision" }));
  expect(document.activeElement).toBe(trigger);
});

it("returns from a selected list item without losing its draft", async () => {
  const resize = resizeObserver();
  const [selected, setSelected] = createSignal(false);
  const { container } = render(() => (
    <MasterDetail
      selected={selected()}
      backLabel="people"
      onBack={() => setSelected(false)}
      detail={<input aria-label="Person draft" />}
    >
      <button onClick={() => setSelected(true)}>Alice</button>
    </MasterDetail>
  ));
  const user = userEvent.setup();
  resize(container.firstElementChild!, 390);
  const trigger = screen.getByRole("button", { name: "Alice" });
  await user.click(trigger);
  const draft = screen.getByRole("textbox", { name: "Person draft" }) as HTMLInputElement;
  await user.type(draft, "Keep this edit");
  await user.click(screen.getByRole("button", { name: /people/ }));
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  expect(screen.getByRole("textbox", { name: "Person draft" })).toBe(draft);
  expect(draft.value).toBe("Keep this edit");
});
