import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import type { Update } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { all, click, expect, expectAll, given, role, scene, selector, text, within } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import type { IconName } from "./icon.ts"
import { rail } from "./rail.ts"

const Destination = Schema.Literals(["home", "connections", "agents", "settings"])
type Destination = typeof Destination.Type

const Message = defineMessageUnion({
  ChangedDestination: { destination: Destination },
  ClickedAccount: {},
  ClickedBrand: {},
  ClickedSearch: {}
})
type Message = typeof Message.Type

type Model = Readonly<{ current: Destination; accountClicks: number; brandClicks: number; searches: number }>

const initial: Model = { current: "home", accountClicks: 0, brandClicks: 0, searches: 0 }

const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedDestination: ({ destination }) => ({ model: modifyFields(model, { current: () => destination }) }),
    ClickedAccount: () => ({ model: modifyFields(model, { accountClicks: (accountClicks) => accountClicks + 1 }) }),
    ClickedBrand: () => ({ model: modifyFields(model, { brandClicks: (brandClicks) => brandClicks + 1 }) }),
    ClickedSearch: () => ({ model: modifyFields(model, { searches: (searches) => searches + 1 }) })
  })

const destinations: ReadonlyArray<readonly [Destination, IconName, string]> = [
  ["home", "mark-home", "Home"],
  ["agents", "mark-agents", "Agents"],
  ["connections", "mark-connections", "Connections"]
]

const railView = (options: Readonly<{ isBrandButton: boolean }>) => (model: Model, h: HtmlBuilder<Message>) => {
  const toItem = ([destination, icon, label]: readonly [Destination, IconName, string]) => ({
    icon,
    label,
    isCurrent: model.current === destination,
    onClick: Message.ChangedDestination({ destination })
  })

  return h.div(
    [],
    [
      h.p([h.Role("status")], [`Current ${model.current}, account ${model.accountClicks}, brand ${model.brandClicks}`]),
      h.p([h.Role("note")], [`Searches ${model.searches}`]),
      rail(h, {
        brand: {
          label: "Amends home",
          ...(options.isBrandButton ? { onClick: Message.ClickedBrand() } : {})
        },
        items: destinations.map(toItem),
        search: { label: "Search", onClick: Message.ClickedSearch() },
        footer: [toItem(["settings", "mark-settings", "Settings"])],
        account: { letter: "JM", label: "Account", onClick: Message.ClickedAccount() }
      })
    ]
  )
}

describe("rail", () => {
  it("is a navigation landmark named Destinations", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("navigation", { name: "Destinations" })).toExist()
    )
  })

  it("names each destination by its label and marks the current one, which changes on click", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Agents" })),
      expect(role("button", { name: "Agents" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Home" })).not.toHaveAttr("aria-current"),
      expect(role("status")).toHaveText("Current agents, account 0, brand 0")
    )
  })

  it("keeps its destinations to icons, with no text but the name", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(within(role("button", { name: "Connections" }), text("Connections"))).toBeAbsent()
    )
  })

  it("lists its destinations in order, then the search, which is not a destination", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expectAll(all.role("button")).toHaveCount(7),
      expect(within(role("navigation", { name: "Destinations" }), role("button", { name: "Search" }))).toExist(),
      expect(role("button", { name: "Search" })).not.toHaveAttr("aria-current"),
      expect(within(role("button", { name: "Search" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Search" }), text("Search"))).toBeAbsent()
    )
  })

  it("sends what the search is given, and never marks it current", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Search" })),
      click(role("button", { name: "Search" })),
      expect(role("note")).toHaveText("Searches 2"),
      expect(role("button", { name: "Search" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true")
    )
  })

  it("takes no search, and then has none", () => {
    scene(
      {
        update,
        view: (_: Model, h: HtmlBuilder<Message>) => rail(h, { brand: { label: "Amends home" }, items: [], footer: [] })
      },
      given(initial),
      expect(role("button", { name: "Search" })).toBeAbsent()
    )
  })

  it("lists the footer's destinations the same way, and the account last", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("button", { name: "Settings" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Settings" })).toHaveAttr("aria-current", "true"),
      click(role("button", { name: "Account" })),
      expect(role("status")).toHaveText("Current settings, account 1, brand 0")
    )
  })

  it("is a button when its brand has a click, and an image when it has none", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Amends home" })),
      expect(role("status")).toHaveText("Current home, account 0, brand 1")
    )
    scene(
      { update, view: railView({ isBrandButton: false }) },
      given(initial),
      expect(role("button", { name: "Amends home" })).toBeAbsent(),
      expect(role("img", { name: "Amends home" })).toExist()
    )
  })

  it("draws the logo as its brand: decorative in the button that names it, and named when alone", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(within(role("button", { name: "Amends home" }), selector("svg"))).toHaveAttr("viewBox", "0 0 64 64"),
      expect(within(role("button", { name: "Amends home" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("button", { name: "Amends home" }), selector("svg rect"))).toExist(),
      expect(role("img")).toBeAbsent()
    )
    scene(
      { update, view: railView({ isBrandButton: false }) },
      given(initial),
      expect(role("img", { name: "Amends home" })).toHaveAttr("viewBox", "0 0 64 64"),
      expect(role("img", { name: "Amends home" })).not.toHaveAttr("aria-hidden")
    )
  })

  it("cuts the logo out of the canvas it lies on", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("navigation", { name: "Destinations" })).toHaveClass(
        "[--amends-status-knockout:var(--amends-canvas)]"
      )
    )
  })
})
