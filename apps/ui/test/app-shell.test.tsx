import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { AppShell } from "../src/components/index.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("dismisses navigation with Escape and selection, returning focus to its trigger", async () => {
  const user = userEvent.setup();
  render(() => (
    <AppShell
      workspace="Acme"
      header={() => <h1>Tasks</h1>}
      navigation={(_, close) => <button onClick={close}>Tasks destination</button>}
    >
      <p>Workspace content</p>
    </AppShell>
  ));
  // Happy DOM does not apply media queries; both responsive triggers are in its accessibility tree.
  const trigger = screen.getAllByRole("button", { name: "Open navigation" })[0]!;
  await user.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Navigation" });
  expect(within(drawer).queryByRole("heading", { name: "Navigation" })).toBeNull();
  expect(within(drawer).queryByRole("button", { name: "Close navigation" })).toBeNull();
  expect(document.activeElement).toBe(drawer);
  drawer.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.click(within(drawer).getByRole("button", { name: "Tasks destination" }));
  expect((drawer as HTMLDialogElement).open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("closes the drawer when the desktop sidebar takes over and moves focus into content", async () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: false, writable: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  const user = userEvent.setup();
  render(() => (
    <AppShell
      workspace="Acme"
      header={() => <h1>Tasks</h1>}
      navigation={() => <a href="/">Tasks</a>}
    >
      <p>Workspace content</p>
    </AppShell>
  ));
  await user.click(screen.getAllByRole("button", { name: "Open navigation" })[0]!);
  const drawer = screen.getByRole("dialog", { name: "Navigation" }) as HTMLDialogElement;
  Object.defineProperty(media, "matches", { value: true });
  media.dispatchEvent(new Event("change"));
  expect(drawer.open).toBe(false);
  expect(document.activeElement).toBe(screen.getByRole("main"));
});
