import { IconMarkChannel, IconMarkHome } from "@amends-dev/icons"
import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library"
import { Show, createSignal } from "solid-js"
import { definePreview } from "storybook-solidjs-vite/next"
import preview from "../.storybook/preview.tsx"
import { initialsOf } from "../src/components/avatar/index.ts"
import componentsMeta, {
  Avatars,
  Counts,
  IconButtons,
  LogoMark,
  LogoMotions,
  StateArtStates,
  StatusMarks,
  TabRow
} from "../src/components/components.stories.tsx"
import { Pane } from "../src/patterns/pane/index.ts"
import { Rail } from "../src/patterns/rail/index.ts"
import { Shell } from "../src/patterns/shell/index.ts"
import shellMeta, { CloseThread, Group, GroupWithThread } from "../src/patterns/shell/shell.stories.tsx"
import { Sidebar } from "../src/patterns/sidebar/index.ts"
import { viewport } from "./viewport.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Frame(props: { thread?: boolean }) {
  const [thread, setThread] = createSignal(props.thread ?? false)
  return (
    <Shell.Root>
      <Shell.Navigation>
        <Rail.Root>
          <Rail.List>
            <Rail.Item href="#home" icon={IconMarkHome} label="Home" current />
          </Rail.List>
        </Rail.Root>
        <Sidebar.Root aria-label="Workspace">
          <Sidebar.Body>
            <Sidebar.List>
              <Sidebar.Item href="#general" icon={IconMarkChannel} current>
                general
              </Sidebar.Item>
              <Sidebar.Item href="#design" icon={IconMarkChannel}>
                design
              </Sidebar.Item>
            </Sidebar.List>
          </Sidebar.Body>
        </Sidebar.Root>
      </Shell.Navigation>
      <Shell.Main>
        <Pane.Root>
          <Pane.Header>
            <Shell.NavigationToggle />
            <Pane.Title>general</Pane.Title>
          </Pane.Header>
          <Pane.Body>
            <button type="button" onClick={() => setThread(true)}>
              Open thread
            </button>
          </Pane.Body>
        </Pane.Root>
      </Shell.Main>
      <Show when={thread()}>
        <Shell.Aside aria-label="Thread" onClose={() => setThread(false)}>
          <Pane.Root variant="side">
            <Pane.Header>
              <Pane.Title>Thread</Pane.Title>
            </Pane.Header>
          </Pane.Root>
        </Shell.Aside>
      </Show>
    </Shell.Root>
  )
}

describe("navigation drawer", () => {
  it("opens as a dialog below desktop, focuses the current item, and closes on Escape", () => {
    viewport(834)
    render(() => <Frame />)
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument()
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert")
    return Promise.resolve().then(() => {
      expect(screen.getByRole("link", { name: "general" })).toHaveFocus()
      fireEvent.keyDown(screen.getByRole("link", { name: "general" }), { key: "Escape" })
      expect(toggle).toHaveAttribute("aria-expanded", "false")
      expect(toggle).toHaveFocus()
      expect(screen.getByRole("main")).not.toHaveAttribute("inert")
    })
  })

  it("closes after following a link", () => {
    viewport(390)
    render(() => <Frame />)
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
    fireEvent.click(screen.getByRole("link", { name: "design" }))
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull()
  })

  it("closes when the viewport grows to desktop", () => {
    const resize = viewport(834)
    render(() => <Frame />)
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
    resize(1100)
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument()
  })
})

describe("side panel", () => {
  it("sits beside the content from the split width", () => {
    viewport(1440)
    render(() => <Frame thread />)
    expect(screen.getByRole("complementary", { name: "Thread" })).toBeInTheDocument()
    expect(screen.getByRole("main")).not.toHaveAttribute("inert")
  })

  it("floats as a dialog below it, takes focus, and returns it on Escape", () => {
    viewport(1100)
    render(() => <Frame />)
    const opener = screen.getByRole("button", { name: "Open thread" })
    opener.focus()
    fireEvent.click(opener)
    const panel = screen.getByRole("dialog", { name: "Thread" })
    expect(panel).toHaveFocus()
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert")
    fireEvent.keyDown(panel, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Thread" })).toBeNull()
    return Promise.resolve().then(() => expect(opener).toHaveFocus())
  })
})

describe("avatar initials", () => {
  it("takes two initials from a full name and keeps short capitals", () => {
    expect(initialsOf("Alex Morgan")).toBe("AM")
    expect(initialsOf("Yumi")).toBe("Y")
    expect(initialsOf("AJ")).toBe("AJ")
    expect(initialsOf("  mercier & co ")).toBe("M&")
  })
})

describe("stories", () => {
  const project = definePreview(preview)
  const components = project.meta(componentsMeta)
  const shell = project.meta(shellMeta)
  it("renders the basic components", async () => {
    await components.story(LogoMark).run()
    await components.story(LogoMotions).run()
    await components.story(StateArtStates).run()
    await components.story(Avatars).run()
    await components.story(StatusMarks).run()
    await components.story(Counts).run()
  })
  it("runs the icon button and tabs stories", async () => {
    await components.story(IconButtons).run()
    await components.story(TabRow).run()
  })
  it("renders the shell and closes its thread", async () => {
    viewport(1440)
    await shell.story(Group).run()
    await shell.story(GroupWithThread).run()
    await shell.story(CloseThread).run()
  })
})

export function typeExamples() {
  // @ts-expect-error A side panel needs a name and a way to close.
  ;<Shell.Aside>Content</Shell.Aside>
  // @ts-expect-error Rail items need an accessible label.
  ;<Rail.Item href="#home" icon={IconMarkHome} />
  // @ts-expect-error Sidebar items need a destination.
  ;<Sidebar.Item>general</Sidebar.Item>
}
