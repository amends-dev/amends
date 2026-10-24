import { describe, it } from "@effect/vitest"
import * as Menu from "@foldkit/ui/menu"
import { Schema } from "effect"
import { Block } from "foldkit"
import type { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  given,
  keydown,
  last,
  role,
  scene,
  selector,
  text,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import type { IconName } from "./icon.ts"
import { rail, railAccount } from "./rail.ts"

const Destination = Schema.Literals(["home", "connections", "agents", "settings"])
type Destination = typeof Destination.Type

const AccountEntry = Schema.Literals(["System", "Light", "Dark", "SwitchWorkspace", "SignOut"])
type AccountEntry = typeof AccountEntry.Type

const AccountMenu = Menu.create<AccountEntry>()

const Model = Schema.Struct({
  current: Destination,
  chose: Schema.String,
  brandClicks: Schema.Finite,
  searches: Schema.Finite,
  accountMenu: AccountMenu.Model
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ChangedDestination: { destination: Destination },
  ClickedBrand: {},
  ClickedSearch: {}
})
type Message = typeof Message.Type

const Definition = Block.makeDefinition("Application", { Model, Message })

const AccountBinding = Definition.makeBinding(AccountMenu, {
  field: "accountMenu",
  init: { contextToArgs: () => [{ id: "rail-account" }] }
}).withOutMessagePolicy({
  fold: AccountMenu.OutMessage.match({
    Selected: ({ value }) => Definition.makeFieldsStep(() => ({ chose: () => value })),
    Closed: () => Definition.makeNoopStep()
  })
})

const Composition = Definition.makeComposition({ bindings: [AccountBinding] })

const update = Composition.makeUpdate((model, message) =>
  Message.match(message, {
    ChangedDestination: ({ destination }) => ({ model: modifyFields(model, { current: () => destination }) }),
    ClickedBrand: () => ({ model: modifyFields(model, { brandClicks: (brandClicks) => brandClicks + 1 }) }),
    ClickedSearch: () => ({ model: modifyFields(model, { searches: (searches) => searches + 1 }) })
  })
)

const initial = Composition.makeInit(() => ({
  model: { current: "home" as const, chose: "nothing", brandClicks: 0, searches: 0 }
}))().model

const destinations: ReadonlyArray<readonly [Destination, IconName, string]> = [
  ["home", "mark-home", "Home"],
  ["agents", "mark-agents", "Agents"],
  ["connections", "mark-connections", "Connections"]
]

const railView = (options: Readonly<{ isBrandButton: boolean; hasAccount?: boolean }>) =>
  Composition.makeView((model, h) => {
    const toItem = ([destination, icon, label]: readonly [Destination, IconName, string]) => ({
      icon,
      label,
      isCurrent: model.current === destination,
      onClick: Message.ChangedDestination({ destination })
    })

    return h.div(
      [],
      [
        h.p([h.Role("status")], [`Current ${model.current}, chose ${model.chose}, brand ${model.brandClicks}`]),
        h.p([h.Role("note")], [`Searches ${model.searches}`]),
        rail(h, {
          brand: {
            label: "Amends home",
            ...(options.isBrandButton ? { onClick: Message.ClickedBrand() } : {})
          },
          items: destinations.map(toItem),
          search: { label: "Search", onClick: Message.ClickedSearch() },
          footer: [toItem(["settings", "mark-settings", "Settings"])],
          ...(options.hasAccount === false
            ? {}
            : {
                account: railAccount(h, {
                  name: "Joan Mercier",
                  initials: "JM",
                  header: { title: "Joan Mercier", detail: "joan@mercier.example" },
                  groups: [
                    {
                      label: "Appearance",
                      choices: (["System", "Light", "Dark"] as const).map((value) => ({
                        value,
                        label: value,
                        isChecked: value === "System"
                      }))
                    },
                    {
                      choices: [
                        { value: "SwitchWorkspace", label: "Switch workspace" },
                        { value: "SignOut", label: "Sign out" }
                      ]
                    }
                  ],
                  embed: (viewInputs) =>
                    h.block(AccountBinding.embedView({ slotId: "account", model: model.accountMenu, viewInputs }))
                })
              })
        })
      ]
    )
  })

const accountOpened = () =>
  [
    Command.resolve(Menu.test.FocusMenuItems, AccountMenu.Message.CompletedFocusMenuItems()),
    Mount.expectHas(
      Menu.test.AnchorMenu({
        buttonId: "rail-account-button",
        anchor: { placement: "right-end", gap: 6, padding: 8 }
      })
    ),
    Mount.resolve(Menu.test.AnchorMenu, AccountMenu.Message.CompletedAnchorMenu()),
    Mount.resolve(Menu.test.PortalMenuBackdrop, AccountMenu.Message.CompletedPortalMenuBackdrop())
  ] as const

const accountClosed = () =>
  [
    Command.resolve(Menu.test.FocusMenuButton, AccountMenu.Message.CompletedFocusMenuButton()),
    Mount.expectEnded(Menu.test.AnchorMenu),
    Mount.expectEnded(Menu.test.PortalMenuBackdrop)
  ] as const

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
      expect(role("status")).toHaveText("Current agents, chose nothing, brand 0")
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

  it("lists the footer's destinations the same way, with Settings over the account", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("button", { name: "Settings" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Settings" })).toHaveAttr("aria-current", "true"),
      expect(last(all.role("button"))).toHaveAttr("aria-haspopup", "menu"),
      expect(role("status")).toHaveText("Current settings, chose nothing, brand 0")
    )
  })

  it("is a button when its brand has a click, and an image when it has none", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Amends home" })),
      expect(role("status")).toHaveText("Current home, chose nothing, brand 1")
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

describe("the rail's account", () => {
  it("is the person's initials in a mark, on a button named for them that opens a menu", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      expect(role("button", { name: "Account: Joan Mercier" })).toHaveAttr("aria-haspopup", "menu"),
      expect(role("button", { name: "Account: Joan Mercier" })).toHaveAttr("aria-expanded", "false"),
      expect(within(role("button", { name: "Account: Joan Mercier" }), text("JM"))).toHaveAttr("aria-hidden", "true"),
      expect(role("menu")).toBeAbsent()
    )
  })

  it("opens to the right of the rail with the person's name over their address, then Appearance and the rest", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Account: Joan Mercier" })),
      ...accountOpened(),
      expect(within(role("menu"), text("Joan Mercier"))).toExist(),
      expect(within(role("menu"), text("joan@mercier.example"))).toExist(),
      expect(within(role("menu"), text("Appearance"))).toExist(),
      expect(role("menuitem", { name: "System (selected)" })).toExist(),
      expect(role("menuitem", { name: "Light" })).toExist(),
      expect(role("menuitem", { name: "Dark" })).toExist(),
      expect(role("menuitem", { name: "Switch workspace" })).toExist(),
      expect(role("menuitem", { name: "Sign out" })).toExist()
    )
  })

  it("reports the entry chosen, and closes", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Account: Joan Mercier" })),
      ...accountOpened(),
      click(role("menuitem", { name: "Sign out" })),
      ...accountClosed(),
      expect(role("menu")).toBeAbsent(),
      expect(role("status")).toHaveText("Current home, chose SignOut, brand 0")
    )
  })

  it("closes on Escape, with the focus back on the account's button", () => {
    scene(
      { update, view: railView({ isBrandButton: true }) },
      given(initial),
      click(role("button", { name: "Account: Joan Mercier" })),
      ...accountOpened(),
      keydown(role("menu"), "Escape"),
      Command.expectHas(Menu.test.FocusMenuButton),
      ...accountClosed(),
      expect(role("menu")).toBeAbsent()
    )
  })

  it("is not drawn when the rail is given none", () => {
    scene(
      { update, view: railView({ isBrandButton: true, hasAccount: false }) },
      given(initial),
      expectAll(all.role("button")).toHaveCount(6),
      expect(role("button", { name: "Account: Joan Mercier" })).toBeAbsent()
    )
  })
})
