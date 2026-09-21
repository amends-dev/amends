import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen, within, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, onCleanup } from "solid-js";
import {
  AccountPopover,
  ContentColumn,
  PageHeading,
  PageHeader,
  Shell,
} from "../src/components/index.ts";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("composes a page with no sidebar, drawer, or navigation listeners", async () => {
  const media = vi.spyOn(window, "matchMedia");
  render(() => (
    <Shell.Root>
      <Shell.Body>
        <Shell.Header>
          <a href="/">amends</a>
          <button>account</button>
        </Shell.Header>
        <Shell.Main>
          <ContentColumn align="center">
            <PageHeading title="Sign in" description="One address" />
            <input aria-label="Email" />
          </ContentColumn>
        </Shell.Main>
        <Shell.Footer>policies</Shell.Footer>
      </Shell.Body>
    </Shell.Root>
  ));
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Sign in", level: 1 })).toBeTruthy();
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(document.querySelector("dialog")).toBeNull();
  expect(media).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("link", { name: "Skip to content" }));
  expect(document.activeElement).toBe(screen.getByRole("main"));
});

function Destination() {
  const sidebar = Shell.useSidebar();
  return <button onClick={sidebar.close}>Tasks destination</button>;
}
it("dismisses navigation on Escape or selection and restores trigger focus", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue(
    Object.assign(new EventTarget(), { matches: false }) as MediaQueryList,
  );
  render(() => (
    <Shell.Root>
      <Shell.Sidebar>
        <Destination />
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <PageHeader title="Tasks" navigation={<Shell.NavigationToggle />} />
        </Shell.Header>
        <Shell.Main>Content</Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ));
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  await user.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Navigation" });
  expect(document.activeElement).toBe(drawer);
  drawer.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.click(within(drawer).getByRole("button", { name: "Tasks destination" }));
  expect((drawer as HTMLDialogElement).open).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("keeps sidebar children and their state mounted while moving to desktop", async () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: false, writable: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  const disposed = vi.fn();
  let mounts = 0;
  function StatefulAccount() {
    mounts++;
    onCleanup(disposed);
    const [draft, setDraft] = createSignal("");
    return (
      <input
        aria-label="Account draft"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
    );
  }
  render(() => (
    <Shell.Root>
      <Shell.Sidebar>
        <StatefulAccount />
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <Shell.NavigationToggle />
        </Shell.Header>
        <Shell.Main>Content</Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  const input = screen.getByRole("textbox", { name: "Account draft" }) as HTMLInputElement;
  await user.type(input, "keep this");
  Object.defineProperty(media, "matches", { value: true });
  media.dispatchEvent(new Event("change"));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("main")));
  expect(document.querySelector("dialog")?.open).toBe(false);
  expect(screen.getByRole("textbox", { name: "Account draft" })).toBe(input);
  expect(input.value).toBe("keep this");
  expect(mounts).toBe(1);
  expect(disposed).not.toHaveBeenCalled();
  expect(screen.getAllByRole("main")).toHaveLength(1);
});

it("keeps account overlays inside the navigation dialog after moving their trigger", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue(
    Object.assign(new EventTarget(), { matches: false }) as MediaQueryList,
  );
  const choose = vi.fn();
  const defaults = document.createElement("style");
  defaults.textContent = "* { animation-name: none; }";
  document.head.append(defaults);
  try {
    render(() => (
      <Shell.Root>
        <Shell.Sidebar>
          <Shell.SidebarHeader>Workspace</Shell.SidebarHeader>
          <Shell.NavigationToggle placement="sidebar" />
          <Shell.SidebarContent>
            <Destination />
          </Shell.SidebarContent>
          <Shell.SidebarActions>
            <AccountPopover
              name="Reader"
              theme={{ preference: () => "system", resolved: () => "cotton", choose }}
              onSettings={() => {}}
            />
          </Shell.SidebarActions>
        </Shell.Sidebar>
        <Shell.Body>
          <Shell.Header>
            <Shell.NavigationToggle />
          </Shell.Header>
          <Shell.Main>Content</Shell.Main>
        </Shell.Body>
      </Shell.Root>
    ));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const account = within(drawer).getByRole("button", { name: "Your account — Reader" });
    await user.click(account);
    const popover = await screen.findByRole("dialog", { name: "Your account" });
    expect(popover.closest("dialog")).toBe(drawer);
    await user.click(within(popover).getByRole("radio", { name: "Soot" }));
    expect(choose).toHaveBeenCalledWith("soot");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Your account" })).toBeNull());
    expect((drawer as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(account);
  } finally {
    defaults.remove();
  }
});

it("restores the same compact navigation trigger after its drawer closes", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      Object.assign(new EventTarget(), { matches: query.includes("768px") }) as MediaQueryList,
  );
  render(() => (
    <Shell.Root>
      <Shell.Sidebar>
        <Shell.SidebarHeader>Workspace</Shell.SidebarHeader>
        <Shell.NavigationToggle placement="sidebar" />
        <Shell.SidebarContent>
          <Destination />
        </Shell.SidebarContent>
        <Shell.SidebarActions>
          <button>Account</button>
        </Shell.SidebarActions>
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <Shell.NavigationToggle />
        </Shell.Header>
        <Shell.Main>Content</Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ));
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  const account = screen.getByRole("button", { name: "Account" });
  await user.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Navigation" });
  expect(within(drawer).getByRole("button", { name: "Account" })).toBe(account);
  expect(within(drawer).queryByRole("button", { name: "Open navigation" })).toBeNull();
  await user.click(within(drawer).getByRole("button", { name: "Tasks destination" }));
  expect((drawer as HTMLDialogElement).open).toBe(false);
  expect(screen.getByRole("button", { name: "Open navigation" })).toBe(trigger);
  expect(document.activeElement).toBe(trigger);
});
