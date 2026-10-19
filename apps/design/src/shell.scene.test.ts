import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { pane, paneClose } from "./pane.ts"
import { rail } from "./rail.ts"
import { shell } from "./shell.ts"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "./sidebar.ts"
import { toast, toastStack } from "./toast.ts"

const Message = defineMessageUnion({ ClickedHome: {}, ClosedThread: {}, DismissedRefusal: {} })
type Message = typeof Message.Type

type Model = Readonly<{ isThreadOpen: boolean; isRefused: boolean; homes: number }>

const initial: Model = { isThreadOpen: true, isRefused: false, homes: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClosedThread: () => ({ model: modifyFields(model, { isThreadOpen: () => false }) }),
    DismissedRefusal: () => ({ model: modifyFields(model, { isRefused: () => false }) })
  })

const view = (model: Model, h: HtmlBuilder<Message>) =>
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
      : {})
  })

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
      click(role("button", { name: "Close" })),
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
})
