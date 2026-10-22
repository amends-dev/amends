import { describe, it } from "@effect/vitest"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { click, expect, given, role, scene, selector, within } from "foldkit/scene"
import { row } from "./directory.ts"
import { paneTabs } from "./pane.ts"
import { rail } from "./rail.ts"
import { currentSidebarRowSelector, sidebar, sidebarItem, sidebarSection } from "./sidebar.ts"

const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type
const update = (model: number, _message: Message) => ({ model: model + 1 })
const view = (model: number, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Actions: ${model}`]),
      rail(h, {
        brand: { label: "Home", href: "/inbox" },
        items: [{ label: "Agents", icon: "mark-agents", isCurrent: true, onClick: Message.Clicked(), href: "/agents" }],
        footer: []
      }),
      sidebar(h, {
        label: "Workspace",
        header: h.empty,
        children: [
          sidebarSection(h, {
            label: "Groups",
            titleHref: "/groups",
            children: [
              sidebarItem(h, { label: "General", isCurrent: true, onClick: Message.Clicked(), href: "/groups/general" })
            ]
          })
        ]
      }),
      paneTabs(h, {
        label: "Activity",
        tabs: [
          { label: "Unread", isCurrent: true, onClick: Message.Clicked(), href: "/inbox" },
          { label: "All", isCurrent: false, onClick: Message.Clicked(), href: "/inbox?tab=all" }
        ]
      }),
      row(h, {
        mark: { text: "A" },
        title: "Agent one",
        onClick: Message.Clicked(),
        href: "/agents/one",
        button: { label: "Remove", name: "Remove agent", onClick: Message.Clicked() }
      })
    ]
  )

describe("native navigation renderers", () => {
  it("renders destinations as links with their names and current states", () =>
    scene(
      { update, view },
      given(0),
      expect(role("link", { name: "Home" })).toHaveAttr("href", "/inbox"),
      expect(role("link", { name: "Agents" })).toHaveAttr("aria-current", "true"),
      expect(role("link", { name: "Groups" })).toHaveAttr("href", "/groups"),
      expect(role("link", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(selector(currentSidebarRowSelector)).toHaveAttr("href", "/groups/general"),
      expect(within(role("navigation", { name: "Activity" }), role("link", { name: "Unread" }))).toHaveAttr(
        "aria-current",
        "page"
      ),
      expect(role("link", { name: "All" })).toHaveAttr("href", "/inbox?tab=all"),
      expect(role("tablist")).toBeAbsent()
    ))

  it("retains independent row actions beside linked rows", () =>
    scene(
      { update, view },
      given(0),
      expect(role("link", { name: "Agent one" })).toHaveAttr("href", "/agents/one"),
      expect(role("status")).toHaveText("Actions: 0"),
      click(role("button", { name: "Remove agent" })),
      expect(role("status")).toHaveText("Actions: 1")
    ))
})
