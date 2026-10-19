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

const Message = defineMessageUnion({
  ClickedHome: {},
  ClosedThread: {},
  DismissedRefusal: {},
  OpenedMenu: {},
  ClosedMenu: {}
})
type Message = typeof Message.Type

type Model = Readonly<{ isThreadOpen: boolean; isRefused: boolean; isMenuOpen: boolean; homes: number }>

const initial: Model = { isThreadOpen: true, isRefused: false, isMenuOpen: false, homes: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClosedThread: () => ({ model: modifyFields(model, { isThreadOpen: () => false }) }),
    DismissedRefusal: () => ({ model: modifyFields(model, { isRefused: () => false }) }),
    OpenedMenu: () => ({ model: modifyFields(model, { isMenuOpen: () => true }) }),
    ClosedMenu: () => ({ model: modifyFields(model, { isMenuOpen: () => false }) })
  })

const viewWithMenu = (hasMenu: boolean) => (model: Model, h: HtmlBuilder<Message>) =>
  shell(h, {
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
      ? { menu: { onOpen: Message.OpenedMenu(), onClose: Message.ClosedMenu() }, isMenuOpen: model.isMenuOpen }
      : {})
  })

const view = viewWithMenu(true)

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

  it("has a menu button named Menu that opens the drawer, and a scrim to close it only while it is open", () => {
    scene(
      { update, view },
      given(initial),
      expect(role("button", { name: "Menu" })).toExist(),
      expect(role("button", { name: "Close menu" })).toBeAbsent(),
      click(role("button", { name: "Menu" })),
      expect(role("button", { name: "Close menu" })).toExist()
    )
  })

  it("sends the close of the menu when the scrim is clicked while the drawer is open", () => {
    scene(
      { update, view },
      given({ ...initial, isMenuOpen: true }),
      expect(role("button", { name: "Close menu" })).toExist(),
      click(role("button", { name: "Close menu" })),
      expect(role("button", { name: "Close menu" })).toBeAbsent(),
      expect(role("navigation", { name: "Workspace" })).toExist()
    )
  })

  it("keeps the rail and the sidebar working while the drawer is open", () => {
    scene(
      { update, view },
      given({ ...initial, isMenuOpen: true }),
      click(within(role("navigation", { name: "Destinations" }), role("button", { name: "Home" }))),
      expect(within(role("main"), text("Home 1"))).toExist(),
      click(within(role("navigation", { name: "Workspace" }), role("button", { name: "Inbox" }))),
      expect(within(role("main"), text("Home 2"))).toExist()
    )
  })

  it("has no menu button or scrim when it is given no menu, and the drawer stays shut", () => {
    scene(
      { update, view: viewWithMenu(false) },
      given({ ...initial, isMenuOpen: true }),
      expect(role("button", { name: "Menu" })).toBeAbsent(),
      expect(role("button", { name: "Close menu" })).toBeAbsent(),
      expect(role("navigation", { name: "Workspace" })).toExist()
    )
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
