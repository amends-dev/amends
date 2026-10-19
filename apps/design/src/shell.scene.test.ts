import { describe, it } from "@effect/vitest"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { pane, paneClose } from "./pane.ts"
import { rail } from "./rail.ts"
import { shell } from "./shell.ts"
import { sidebar, sidebarHeader, sidebarItem, sidebarSection } from "./sidebar.ts"

const Message = defineMessageUnion({ ClickedHome: {}, ClosedThread: {} })
type Message = typeof Message.Type

type Model = Readonly<{ isThreadOpen: boolean; homes: number }>

const initial: Model = { isThreadOpen: true, homes: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHome: () => ({ model: modifyFields(model, { homes: (homes) => homes + 1 }) }),
    ClosedThread: () => ({ model: modifyFields(model, { isThreadOpen: () => false }) })
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
})
