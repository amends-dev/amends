import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { pane, paneBack, paneClose } from "./pane.ts"
import { rail } from "./rail.ts"
import { shell } from "./shell.ts"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "./sidebar.ts"
import { toast, toastStack } from "./toast.ts"
import type { Viewport } from "./viewport.ts"

const Message = defineMessageUnion({
  ClickedHome: {},
  ClosedThread: {},
  DismissedRefusal: {},
  OpenedMenu: {}
})
type Message = typeof Message.Type

type Model = Readonly<{
  viewport: Viewport
  isThreadOpen: boolean
  isRefused: boolean
  isMenuOpen: boolean
  homes: number
}>

const initial: Model = { viewport: "Split", isThreadOpen: true, isRefused: false, isMenuOpen: false, homes: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClosedThread: () => ({ model: modifyFields(model, { isThreadOpen: () => false }) }),
    DismissedRefusal: () => ({ model: modifyFields(model, { isRefused: () => false }) }),
    OpenedMenu: () => ({ model: modifyFields(model, { isMenuOpen: () => true }) })
  })

const viewWithMenu = (hasMenu: boolean) => (model: Model, h: HtmlBuilder<Message>) =>
  shell(h, {
    viewport: model.viewport,
    rail: rail(h, {
      brand: { letter: "A", label: "amends" },
      items: [{ icon: "mark-home", label: "Home", isCurrent: true, onClick: Message.ClickedHome() }],
      footer: []
    }),
    sidebar: sidebar(h, {
      label: "Workspace",
      header: sidebarHeader(h, { mark: "M", name: "Mercier & Co" }),
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
      body: [h.p([], [`Home ${model.homes}`])]
    }),
    ...(model.isThreadOpen
      ? {
          aside: pane(h, {
            variant: "side",
            label: "Composer paste crash",
            header: {
              title: "Composer paste crash",
              subtitle: "Thread in #general",
              leading: paneBack(h, Message.ClosedThread()),
              actions: [paneClose(h, Message.ClosedThread())]
            },
            body: []
          })
        }
      : {}),
    ...(model.isRefused
      ? {
          notices: toastStack(h, [
            toast(h, {
              text: "Couldn't post the reply: You may not.",
              action: { label: "Dismiss", onClick: Message.DismissedRefusal() }
            })
          ])
        }
      : {}),
    ...(hasMenu
      ? {
          menu: {
            onOpen: Message.OpenedMenu(),
            // What a dialog publishes, with no attribute but those that show it and name it while it is open.
            dialog: (toView) =>
              toView({
                dialog: model.isMenuOpen ? [h.Open(true), h.AriaLabel("Navigation")] : [],
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
      : {})
  })

const view = viewWithMenu(true)

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
        within(selector('[aria-live="polite"]'), within(role("alert"), text("Couldn't post the reply: You may not.")))
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

  it("keeps the rail and the sidebar in place from Desktop, with no Menu button and no dialog", () => {
    for (const viewport of ["Desktop", "Split"] as const) {
      scene(
        { update, view },
        given(inWindow(viewport)),
        expect(role("navigation", { name: "Destinations" })).toExist(),
        expect(role("navigation", { name: "Workspace" })).toExist(),
        expect(role("button", { name: "Menu" })).toBeAbsent(),
        expect(role("dialog")).toBeAbsent()
      )
    }
  })

  it("keeps the rail at Tablet and leaves the sidebar to a dialog that the Menu button opens", () => {
    scene(
      { update, view },
      given(inWindow("Tablet")),
      expect(role("navigation", { name: "Destinations" })).toExist(),
      expect(role("navigation", { name: "Workspace" })).toBeAbsent(),
      expect(role("button", { name: "Menu" })).toExist(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      click(role("button", { name: "Menu" })),
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
      expect(role("button", { name: "Menu" })).toExist(),
      expect(role("main")).toExist(),
      click(role("button", { name: "Menu" })),
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

  it("has no Menu button or dialog when it is given no menu, and no sidebar below Desktop", () => {
    for (const viewport of ["Phone", "Tablet"] as const) {
      scene(
        { update, view: viewWithMenu(false) },
        given(inWindow(viewport, { isMenuOpen: true })),
        expect(role("button", { name: "Menu" })).toBeAbsent(),
        expect(role("dialog")).toBeAbsent(),
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
})
