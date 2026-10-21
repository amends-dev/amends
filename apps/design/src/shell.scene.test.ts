import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, last, nth, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { mainPaneId, pane, paneBack, paneClose } from "./pane.ts"
import { rail } from "./rail.ts"
import { isAsideInDialog, shell } from "./shell.ts"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "./sidebar.ts"
import { toast, toastStack } from "./toast.ts"
import type { Viewport } from "./viewport.ts"

const Message = defineMessageUnion({
  ClickedHome: {},
  ClickedWorkspaces: {},
  ClosedSearch: {},
  ClosedThread: {},
  DismissedRefusal: {},
  OpenedAside: {},
  OpenedMenu: {},
  OpenedSearch: {}
})
type Message = typeof Message.Type

type Model = Readonly<{
  viewport: Viewport
  isThreadOpen: boolean
  isAsideOpen: boolean
  isRefused: boolean
  isMenuOpen: boolean
  isSearchOpen: boolean
  homes: number
  workspaces: number
}>

const initial: Model = {
  viewport: "Split",
  isThreadOpen: true,
  isAsideOpen: false,
  isRefused: false,
  isMenuOpen: false,
  isSearchOpen: false,
  homes: 0,
  workspaces: 0
}

const menuId = "workspace-menu"

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClickedWorkspaces: () => ({ model: modifyFields(model, { workspaces: (workspaces) => workspaces + 1 }) }),
    ClosedSearch: () => ({ model: modifyFields(model, { isSearchOpen: () => false }) }),
    ClosedThread: () => ({ model: modifyFields(model, { isThreadOpen: () => false, isAsideOpen: () => false }) }),
    DismissedRefusal: () => ({ model: modifyFields(model, { isRefused: () => false }) }),
    OpenedAside: () => ({ model: modifyFields(model, { isAsideOpen: () => true }) }),
    OpenedMenu: () => ({ model: modifyFields(model, { isMenuOpen: () => true }) }),
    OpenedSearch: () => ({ model: modifyFields(model, { isSearchOpen: () => true }) })
  })

const viewWith =
  (lent: Readonly<{ hasMenu: boolean; hasSearch: boolean; asideLabel: string }>) =>
  (model: Model, h: HtmlBuilder<Message>) =>
    shell(h, {
      viewport: model.viewport,
      rail: rail(h, {
        brand: { label: "Amends home" },
        items: [{ icon: "mark-home", label: "Home", isCurrent: true, onClick: Message.ClickedHome() }],
        footer: []
      }),
      sidebar: sidebar(h, {
        label: "Workspace",
        header: sidebarHeader(h, { mark: "M", name: "Mercier & Co", onClick: Message.ClickedWorkspaces() }),
        children: [
          sidebarSection(h, {
            children: [
              sidebarItem(h, { icon: "mark-mail", label: "Inbox", isCurrent: true, onClick: Message.ClickedHome() })
            ]
          })
        ]
      }),
      main: pane(h, {
        variant: "main",
        header: { title: "general", icon: "mark-channel" },
        body: [
          h.p([], [`Home ${model.homes}`]),
          button(h, "Open thread", Message.OpenedAside()),
          button(h, "Open search", Message.OpenedSearch())
        ]
      }),
      ...(model.isThreadOpen
        ? {
            aside: {
              label: lent.asideLabel,
              view: pane(h, {
                variant: "side",
                label: "Composer paste crash",
                header: {
                  title: "Composer paste crash",
                  subtitle: "Thread in #general",
                  leading: paneBack(h, Message.ClosedThread()),
                  actions: [paneClose(h, Message.ClosedThread())]
                },
                body: []
              }),
              isOpen: model.isAsideOpen,
              // What a dialog publishes, with no attribute but those that show it and name it while it is open.
              dialog: (toView) =>
                toView({
                  dialog: model.isAsideOpen ? [h.Open(true), h.AriaLabel("Thread")] : [],
                  backdrop: [],
                  panel: [],
                  title: [],
                  description: [],
                  initialFocus: [],
                  closeButton: [],
                  isVisible: model.isAsideOpen
                })
            }
          }
        : {}),
      ...(model.isRefused
        ? {
            notices: toastStack(h, [
              toast(h, {
                text: "Couldn’t post the reply: You may not.",
                action: { label: "Dismiss", onClick: Message.DismissedRefusal() }
              })
            ])
          }
        : {}),
      ...(lent.hasMenu
        ? {
            menu: {
              id: menuId,
              onOpen: Message.OpenedMenu(),
              isOpen: model.isMenuOpen,
              // What a dialog publishes, with no attribute but those that show it and name it while it is open.
              dialog: (toView) =>
                toView({
                  dialog: model.isMenuOpen ? [h.Id(menuId), h.Open(true), h.AriaLabel("Navigation")] : [h.Id(menuId)],
                  backdrop: [],
                  panel: [],
                  title: [],
                  description: [],
                  initialFocus: [],
                  closeButton: [],
                  isVisible: model.isMenuOpen
                })
            }
          }
        : {}),
      ...(lent.hasSearch
        ? {
            // A dialog of the page's own, which renders its element with nothing in it while it is closed.
            dialogs: [
              h.dialog(
                model.isSearchOpen ? [h.Open(true), h.AriaLabel("Search")] : [],
                model.isSearchOpen
                  ? [h.p([], ["Find anything"]), button(h, "Close search", Message.ClosedSearch())]
                  : []
              )
            ]
          }
        : {})
    })

const view = viewWith({ hasMenu: true, hasSearch: false, asideLabel: "Thread" })
const viewWithSearch = viewWith({ hasMenu: true, hasSearch: true, asideLabel: "Thread" })
const viewOfMember = viewWith({ hasMenu: true, hasSearch: false, asideLabel: "Member details" })

const inWindow = (viewport: Viewport, extra: Partial<Model> = {}): Model => ({ ...initial, viewport, ...extra })

describe("shell", () => {
  it("frames the rail, the sidebar, the main pane, and the side pane, each by its landmark", () => {
    scene(
      { update, view },
      given(initial),
      expect(role("navigation", { name: "Destinations" })).toExist(),
      expect(role("navigation", { name: "Workspace" })).toExist(),
      expect(role("main")).toExist(),
      expect(role("complementary", { name: "Composer paste crash" })).toExist()
    )
  })

  it("starts the frame with a link named Skip to content, before the rail and whatever else it holds, at every viewport", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("link", { name: "Skip to content" })).toExist(),
        expect(nth(all.selector(":not(template)"), 1)).toHaveText("Skip to content")
      )
    }
  })

  it("sends the skip link to the main pane, which can be given focus without being in the tab order", () => {
    scene(
      { update, view },
      given(initial),
      expect(role("link", { name: "Skip to content" })).toHaveAttr("href", `#${mainPaneId}`),
      expect(role("main")).toHaveAttr("id", mainPaneId),
      expect(role("main")).toHaveAttr("tabIndex", "-1")
    )
  })

  it("holds what each part renders and keeps their buttons working", () => {
    scene(
      { update, view },
      given(initial),
      click(within(role("navigation", { name: "Destinations" }), role("button", { name: "Home" }))),
      expect(within(role("main"), text("Home 1"))).toExist()
    )
  })

  it("has no side pane when it is given none, and loses it when the pane closes", () => {
    scene(
      { update, view },
      given(initial),
      click(within(role("complementary"), role("button", { name: "Close" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(role("main")).toExist()
    )
  })

  it("shows its notices as alerts in a live region over the panes, and they go when the app drops them", () => {
    scene(
      { update, view },
      given({ ...initial, isRefused: true }),
      expect(
        within(selector('[aria-live="polite"]'), within(role("alert"), text("Couldn’t post the reply: You may not.")))
      ).toExist(),
      expect(role("complementary", { name: "Composer paste crash" })).toExist(),
      click(role("button", { name: "Dismiss" })),
      expect(role("alert")).toBeAbsent(),
      expect(role("main")).toExist()
    )
  })

  it("has no live region for notices when it is given none", () => {
    scene({ update, view }, given(initial), expect(selector('[aria-live="polite"]')).toBeAbsent())
  })

  it("keeps its notices in the frame, once, while no dialog is open", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport, { isRefused: true })),
        expectAll(all.selector('[aria-live="polite"]')).toHaveCount(1),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
        expect(role("dialog", { name: "Thread" })).toBeAbsent(),
        expect(role("alert")).toExist()
      )
    }
  })

  it("moves its notices into the side pane's dialog while it is open, to read and dismiss", () => {
    scene(
      { update, view },
      given(inWindow("Desktop", { isRefused: true, isAsideOpen: true })),
      expectAll(all.selector('[aria-live="polite"]')).toHaveCount(1),
      expect(
        within(role("dialog", { name: "Thread" }), within(selector('[aria-live="polite"]'), role("alert")))
      ).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Dismiss" }))),
      expect(role("alert")).toBeAbsent(),
      expect(role("complementary", { name: "Composer paste crash" })).toExist()
    )
  })

  it("moves its notices into the drawer while it is open", () => {
    for (const viewport of ["Phone", "Tablet"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport, { isRefused: true, isMenuOpen: true })),
        expectAll(all.selector('[aria-live="polite"]')).toHaveCount(1),
        expect(
          within(role("dialog", { name: "Navigation" }), within(selector('[aria-live="polite"]'), role("alert")))
        ).toExist()
      )
    }
  })

  it("keeps the rail and the sidebar in place from Desktop, with no navigation button and no dialog", () => {
    for (const viewport of ["Desktop", "Split"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("navigation", { name: "Destinations" })).toExist(),
        expect(role("navigation", { name: "Workspace" })).toExist(),
        expect(role("button", { name: "Open navigation" })).toBeAbsent(),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent()
      )
    }
  })

  it("keeps the rail at Tablet and leaves the sidebar to a dialog that the Open navigation button opens", () => {
    scene(
      { update, view },
      given(inWindow("Tablet")),
      expect(role("navigation", { name: "Destinations" })).toExist(),
      expect(role("navigation", { name: "Workspace" })).toBeAbsent(),
      expect(role("button", { name: "Open navigation" })).toExist(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      click(role("button", { name: "Open navigation" })),
      expect(within(role("dialog", { name: "Navigation" }), role("navigation", { name: "Workspace" }))).toExist(),
      expect(within(role("dialog", { name: "Navigation" }), role("navigation", { name: "Destinations" }))).toBeAbsent(),
      expect(role("navigation", { name: "Destinations" })).toExist()
    )
  })

  it("leaves the rail and the sidebar both to the dialog at Phone, under a heading that names it", () => {
    scene(
      { update, view },
      given(inWindow("Phone")),
      expect(role("navigation", { name: "Destinations" })).toBeAbsent(),
      expect(role("navigation", { name: "Workspace" })).toBeAbsent(),
      expect(role("button", { name: "Open navigation" })).toExist(),
      expect(role("main")).toExist(),
      click(role("button", { name: "Open navigation" })),
      expect(
        within(role("dialog", { name: "Navigation" }), role("heading", { name: "Navigation", level: 2 }))
      ).toExist(),
      expect(within(role("dialog", { name: "Navigation" }), role("navigation", { name: "Destinations" }))).toExist(),
      expect(within(role("dialog", { name: "Navigation" }), role("navigation", { name: "Workspace" }))).toExist()
    )
  })

  it("leaves the rail and the sidebar working in the dialog", () => {
    scene(
      { update, view },
      given(inWindow("Phone", { isMenuOpen: true })),
      click(within(role("navigation", { name: "Destinations" }), role("button", { name: "Home" }))),
      expect(within(role("main"), text("Home 1"))).toExist(),
      click(within(role("navigation", { name: "Workspace" }), role("button", { name: "Inbox" }))),
      expect(within(role("main"), text("Home 2"))).toExist()
    )
  })

  it("names the navigation button Open navigation, and says whether the drawer is open and which dialog it controls", () => {
    for (const viewport of ["Phone", "Tablet"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "false"),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-controls", menuId),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
        click(role("button", { name: "Open navigation" })),
        expect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "true"),
        expect(role("dialog", { name: "Navigation" })).toHaveAttr("id", menuId)
      )
    }
  })

  it("has no navigation button or dialog when it is given no menu, and no sidebar below Desktop", () => {
    for (const viewport of ["Phone", "Tablet"] as const) {
      scene(
        { update, view: viewWith({ hasMenu: false, hasSearch: false, asideLabel: "Thread" }) },
        given(inWindow(viewport, { isMenuOpen: true })),
        expect(role("button", { name: "Open navigation" })).toBeAbsent(),
        expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
        expect(role("navigation", { name: "Workspace" })).toBeAbsent(),
        expect(role("main")).toExist()
      )
    }
  })

  it("puts Back before the side pane's title and Close among its actions, each sending its message", () => {
    scene(
      { update, view },
      given(initial),
      expect(within(role("complementary"), role("button", { name: "Back" }))).toExist(),
      expect(within(role("complementary"), role("button", { name: "Close" }))).toExist(),
      click(within(role("complementary"), role("button", { name: "Back" }))),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("keeps the side pane beside the main pane at Split, in no dialog, whatever the dialog says", () => {
    for (const isAsideOpen of [false, true]) {
      scene(
        { update, view },
        given(inWindow("Split", { isAsideOpen })),
        expect(role("complementary", { name: "Composer paste crash" })).toExist(),
        expect(role("dialog")).toBeAbsent()
      )
    }
  })

  it("holds the side pane in a dialog named Thread below Split, and shows neither until it is visible", () => {
    for (const viewport of ["Desktop", "Tablet", "Phone"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("complementary")).toBeAbsent(),
        expect(role("dialog", { name: "Thread" })).toBeAbsent(),
        click(within(role("main"), role("button", { name: "Open thread" }))),
        expect(
          within(role("dialog", { name: "Thread" }), role("complementary", { name: "Composer paste crash" }))
        ).toExist(),
        expect(within(role("dialog", { name: "Thread" }), role("heading", { name: "Thread", level: 2 }))).toExist(),
        expect(role("main")).toExist()
      )
    }
  })

  it("is in a dialog, by isAsideInDialog, where the shell holds the side pane in one, and not beside the main pane", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport, { isAsideOpen: true })),
        isAsideInDialog(viewport)
          ? expect(within(role("dialog", { name: "Thread" }), role("complementary"))).toExist()
          : expect(role("dialog")).toBeAbsent()
      )
    }
  })

  it("names the side pane's dialog by the label it is given, whatever the pane holds", () => {
    scene(
      { update, view: viewOfMember },
      given(inWindow("Desktop", { isAsideOpen: true })),
      expect(within(role("dialog"), role("heading", { name: "Member details", level: 2 }))).toExist(),
      expect(within(role("dialog"), role("heading", { name: "Thread" }))).toBeAbsent()
    )
  })

  it("closes the side pane's dialog by the pane's Close and by its Back, which send the pane's message", () => {
    for (const name of ["Close", "Back"]) {
      scene(
        { update, view },
        given(inWindow("Desktop", { isAsideOpen: true })),
        click(within(role("dialog", { name: "Thread" }), role("button", { name }))),
        expect(role("dialog", { name: "Thread" })).toBeAbsent(),
        expect(role("complementary")).toBeAbsent(),
        expect(role("main")).toExist()
      )
    }
  })

  it("renders the dialogs it is lent in the frame at every viewport, empty while they are closed", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view: viewWithSearch },
        given(inWindow(viewport)),
        expect(role("dialog", { name: "Search" })).toBeAbsent(),
        expect(last(all.selector("dialog"))).toExist(),
        click(within(role("main"), role("button", { name: "Open search" }))),
        expect(within(role("dialog", { name: "Search" }), text("Find anything"))).toExist(),
        expect(role("main")).toExist(),
        click(within(role("dialog", { name: "Search" }), role("button", { name: "Close search" }))),
        expect(role("dialog", { name: "Search" })).toBeAbsent(),
        expect(last(all.selector("dialog"))).toExist()
      )
    }
  })

  it("renders the dialogs it is lent last in the frame, after the drawer's and the side pane's", () => {
    scene(
      { update, view: viewWithSearch },
      given(inWindow("Desktop", { isAsideOpen: true, isSearchOpen: true })),
      expect(last(all.selector("dialog"))).toHaveAttr("aria-label", "Search"),
      expect(nth(all.selector("dialog"), 0)).toHaveAttr("aria-label", "Thread")
    )
    scene(
      { update, view: viewWithSearch },
      given(inWindow("Phone", { isMenuOpen: true, isSearchOpen: true })),
      expect(last(all.selector("dialog"))).toHaveAttr("aria-label", "Search"),
      expect(nth(all.selector("dialog"), 0)).toHaveAttr("aria-label", "Navigation")
    )
  })

  it("keeps its notices in the frame while a dialog it is lent is open, to be read once it closes", () => {
    scene(
      { update, view: viewWithSearch },
      given(inWindow("Desktop", { isRefused: true, isSearchOpen: true })),
      expectAll(all.selector('[aria-live="polite"]')).toHaveCount(1),
      expect(within(role("dialog", { name: "Search" }), role("alert"))).toBeAbsent(),
      expect(role("alert")).toExist()
    )
  })

  it("has no side pane dialog when it is given no side pane", () => {
    scene(
      { update, view },
      given(inWindow("Desktop", { isThreadOpen: false, isAsideOpen: true })),
      expect(role("dialog")).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(role("main")).toExist()
    )
  })
})
