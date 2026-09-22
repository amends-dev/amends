import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, onCleanup, onMount } from "solid-js";
import { Shell } from "@amends/ui/compositions/shell";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { Drawer } from "@amends/ui/compositions/drawer";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Input } from "@amends/ui/primitives/input";
import { NavigationPresentationContext } from "../src/compositions/navigation/presentation.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function viewport(initial: boolean) {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: initial, writable: true });
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) =>
    query.includes("47.999") ? media : original(query),
  );
  return (mobile: boolean) => {
    Object.defineProperty(media, "matches", { value: mobile, writable: true });
    media.dispatchEvent(new Event("change"));
  };
}
it("IconButton preserves native form/disabled/ref behavior and a stable accessible name", () => {
  let ref: HTMLButtonElement | undefined;
  const click = vi.fn(),
    submit = vi.fn();
  render(() => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <IconButton
        aria-label="Add member"
        ref={(node) => {
          ref = node;
        }}
        onClick={[click, "member"]}
      >
        <span>+</span>
      </IconButton>
      <IconButton aria-label="Unavailable" disabled onClick={click}>
        x
      </IconButton>
    </form>
  ));
  const button = screen.getByRole("button", { name: "Add member" });
  expect(ref).toBe(button);
  fireEvent.click(button);
  expect(click).toHaveBeenCalledExactlyOnceWith("member", expect.any(Event));
  expect(submit).not.toHaveBeenCalled();
  (screen.getByRole("button", { name: "Unavailable" }) as HTMLButtonElement).click();
  expect(click).toHaveBeenCalledOnce();
});
it("IconButton updates shape and size without replacing a focused text-glyph button", () => {
  const [shape, setShape] = createSignal<"square" | "circle">("square");
  const [size, setSize] = createSignal<"regular" | "compact">("regular");
  render(() => (
    <IconButton shape={shape()} size={size()} aria-label="More">
      ⋯
    </IconButton>
  ));
  const button = screen.getByRole("button", { name: "More" });
  const originalClass = button.className;
  button.focus();
  setShape("circle");
  setSize("compact");
  expect(screen.getByRole("button", { name: "More" })).toBe(button);
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("data-icon-button-shape", "circle");
  expect(button).toHaveAttribute("data-icon-button-size", "compact");
  expect(button.className).not.toBe(originalClass);
  expect(button).not.toHaveAttribute("shape");
  expect(button).not.toHaveAttribute("size");
  expect(button.firstElementChild).toHaveAttribute("aria-hidden", "true");
});
it("navigation preserves link identity and names when compact presentation changes", () => {
  const [compact, setCompact] = createSignal(false),
    [label, setLabel] = createSignal("Threads");
  render(() => (
    <Navigation.Root compact={compact()} aria-label="Workspace">
      <Navigation.Section>
        <Navigation.SectionHeader>
          <Navigation.SectionLabel>Conversations</Navigation.SectionLabel>
          <Divider.Line />
        </Navigation.SectionHeader>
        <Navigation.Link href="#threads" aria-current="page">
          <Navigation.Icon>t</Navigation.Icon>
          <Navigation.Label>{label()}</Navigation.Label>
          <Navigation.Count aria-label="3 unread">3</Navigation.Count>
        </Navigation.Link>
      </Navigation.Section>
    </Navigation.Root>
  ));
  const link = screen.getByRole("link", { name: "Threads 3 unread" });
  expect(screen.getByRole("group", { name: "Conversations" })).toContainElement(link);
  setCompact(true);
  expect(screen.getByRole("link", { name: "Threads 3 unread" })).toBe(link);
  expect(link).toHaveAttribute("aria-current", "page");
  setLabel("Conversations");
  expect(link).toHaveAccessibleName("Conversations 3 unread");
});
it("navigation closes for normal activation but respects cancellation, modifiers and new tabs", async () => {
  const close = vi.fn();
  render(() => (
    <NavigationPresentationContext.Provider value={{ compact: () => false, close }}>
      <Navigation.Root aria-label="Workspace">
        <Navigation.Link href="#normal">
          <Navigation.Label>Normal</Navigation.Label>
        </Navigation.Link>
        <Navigation.Link href="#cancel" onClick={(event) => event.preventDefault()}>
          <Navigation.Label>Cancelled</Navigation.Label>
        </Navigation.Link>
        <Navigation.Link href="about:blank" target="_blank">
          <Navigation.Label>New tab</Navigation.Label>
        </Navigation.Link>
      </Navigation.Root>
    </NavigationPresentationContext.Provider>
  ));
  fireEvent.click(screen.getByRole("link", { name: "Normal" }));
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("link", { name: "Cancelled" }));
  fireEvent.click(screen.getByRole("link", { name: "Normal" }), { ctrlKey: true });
  fireEvent.click(screen.getByRole("link", { name: "New tab" }));
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});
it("Drawer composes its name and description, handles cancel, and preserves mounted fields", async () => {
  render(() => (
    <Drawer.Root animated={false}>
      <Drawer.Trigger>Open details</Drawer.Trigger>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Details</Drawer.Title>
          <Drawer.Close />
        </Drawer.Header>
        <Drawer.Body>
          <Drawer.Description>Workspace details</Drawer.Description>
          <Input aria-label="Draft" />
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  ));
  const trigger = screen.getByRole("button", { name: "Open details" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Details" });
  expect(dialog).toHaveAccessibleDescription("Workspace details");
  const input = screen.getByRole("textbox", { name: "Draft" });
  fireEvent.input(input, { target: { value: "keep me" } });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
  expect(input).toHaveValue("keep me");
});
it("Shell preserves one sidebar tree and desktop preference through mobile drawer transitions", async () => {
  const setMobile = viewport(false),
    mounted = vi.fn(),
    disposed = vi.fn();
  function Draft() {
    onMount(mounted);
    onCleanup(disposed);
    return <Input aria-label="Sidebar draft" />;
  }
  const { container } = render(() => (
    <Shell.Root>
      <Shell.Sidebar>
        <Shell.SidebarHeader>Workspace</Shell.SidebarHeader>
        <Shell.SidebarContent>
          <Navigation.Root aria-label="Workspace">
            <Navigation.Link href="#threads" aria-current="page">
              <Navigation.Icon>t</Navigation.Icon>
              <Navigation.Label>Threads</Navigation.Label>
            </Navigation.Link>
          </Navigation.Root>
          <Shell.SidebarExpanded>
            <Draft />
          </Shell.SidebarExpanded>
        </Shell.SidebarContent>
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <Shell.NavigationToggle />
        </Shell.Header>
        <Shell.Main>Content</Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ));
  const draft = screen.getByRole("textbox", { name: "Sidebar draft" });
  fireEvent.input(draft, { target: { value: "preserved" } });
  fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
  expect(screen.queryByRole("textbox", { name: "Sidebar draft" })).toBeNull();
  setMobile(true);
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Navigation" })).toContainElement(draft);
  expect(draft).toHaveValue("preserved");
  setMobile(false);
  await waitFor(() => expect(container.querySelector("dialog")).not.toHaveAttribute("open"));
  expect(screen.getByRole("button", { name: "Expand navigation" })).toBe(trigger);
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Sidebar draft" })).toBe(draft);
  expect(mounted).toHaveBeenCalledOnce();
  expect(disposed).not.toHaveBeenCalled();
  expect(container.querySelectorAll('a[href="#threads"]')).toHaveLength(1);
});
it("Shell supports a page without navigation and does not display a toggle or drawer", () => {
  viewport(false);
  render(() => (
    <Shell.Root>
      <Shell.Body>
        <Shell.Header>
          <Shell.NavigationToggle />
        </Shell.Header>
        <Shell.Main>Page content</Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ));
  expect(screen.getByRole("main")).toHaveTextContent("Page content");
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector("dialog")).toBeNull();
});
