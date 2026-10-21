import { describe, it } from "@effect/vitest"
import * as Menu from "@foldkit/ui/menu"
import { Schema } from "effect"
import { makeApplicationDefinition } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import {
  Command,
  Mount,
  click,
  expect,
  expectAll,
  all,
  given,
  keydown,
  role,
  scene,
  selector,
  text,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { button } from "./control.ts"
import { type ChoiceMenuChoice, choiceMenu, menu, type PropertyChoice, propertyMenu } from "./menu.ts"

const Sort = Schema.Literals(["Activity", "Newest", "Oldest"])
type Sort = typeof Sort.Type

const SortMenu = Menu.create<Sort>()

const AccountEntry = Schema.Literals(["System", "Light", "Dark", "SwitchWorkspace", "SignOut"])
type AccountEntry = typeof AccountEntry.Type

const AccountMenu = Menu.create<AccountEntry>()

const Model = Schema.Struct({
  sort: Sort,
  sortMenu: SortMenu.Model,
  appearance: Schema.Literals(["System", "Light", "Dark"]),
  signedOut: Schema.Boolean,
  switched: Schema.Boolean,
  accountMenu: AccountMenu.Model,
  refreshed: Schema.Finite
})
type Model = typeof Model.Type

const Message = defineMessageUnion({ Refreshed: {} })

const Definition = makeApplicationDefinition({ Model, Message })

const SortBinding = Definition.bindChild(SortMenu, {
  field: "sortMenu",
  init: { contextToArgs: () => [{ id: "sort-menu" }] },
  outMessage: {
    fold: SortMenu.OutMessage.match({
      Selected: ({ value }) => Definition.stepFields(() => ({ sort: () => value })),
      Closed: () => Definition.stepNoop()
    })
  }
})

const AccountBinding = Definition.bindChild(AccountMenu, {
  field: "accountMenu",
  init: { contextToArgs: () => [{ id: "account-menu" }] },
  outMessage: {
    fold: AccountMenu.OutMessage.match({
      Selected: ({ value }) => {
        switch (value) {
          case "System":
          case "Light":
          case "Dark":
            return Definition.stepFields(() => ({ appearance: () => value }))
          case "SwitchWorkspace":
            return Definition.stepFields(() => ({ switched: () => true }))
          case "SignOut":
            return Definition.stepFields(() => ({ signedOut: () => true }))
        }
      },
      Closed: () => Definition.stepNoop()
    })
  }
})

const Composition = Definition.makeComposition({ bindings: [SortBinding, AccountBinding] })

const update = Composition.makeUpdate((model, message) =>
  Message.match(message, {
    Refreshed: () => ({ model: modifyFields(model, { refreshed: (refreshed) => refreshed + 1 }) })
  })
)

const initial = Composition.makeInit(() => ({
  model: { sort: "Activity" as const, appearance: "System" as const, signedOut: false, switched: false, refreshed: 0 }
}))().model

const sorts: ReadonlyArray<readonly [Sort, string]> = [
  ["Activity", "Latest activity"],
  ["Newest", "Newest"],
  ["Oldest", "Oldest"]
]

const view = Composition.makeView((model, h) =>
  h.div(
    [],
    [
      h.p([h.Role("status")], [`Sort ${model.sort}, appearance ${model.appearance}`]),
      h.p([h.Role("note")], [`Switched ${model.switched}, signed out ${model.signedOut}`]),
      button(h, "Refresh", Message.Refreshed()),
      choiceMenu(h, {
        choices: sorts,
        value: model.sort,
        name: `Sort: ${sorts.find(([value]) => value === model.sort)?.[1]}`,
        embed: (viewInputs) => h.block(SortBinding.embedView({ slotId: "sort", model: model.sortMenu, viewInputs }))
      }),
      menu(h, {
        trigger: { variant: "plain", name: "Account: Ada", content: h.span([], ["A"]) },
        placement: "right-end",
        header: { title: "Ada Lovelace", detail: "ada@mercier.example" },
        groups: [
          {
            label: "Appearance",
            choices: (["System", "Light", "Dark"] as const).map((value) => ({
              value,
              label: value,
              isChecked: model.appearance === value
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
    ]
  )
)

const sortOpened = () =>
  [
    Command.resolve(Menu.test.FocusMenuItems, SortMenu.Message.CompletedFocusMenuItems()),
    Mount.resolve(Menu.test.AnchorMenu, SortMenu.Message.CompletedAnchorMenu()),
    Mount.resolve(Menu.test.PortalMenuBackdrop, SortMenu.Message.CompletedPortalMenuBackdrop())
  ] as const

const scrolledIntoView = () =>
  Command.resolve(Menu.test.ScrollMenuItemIntoView, SortMenu.Message.CompletedScrollMenuItemIntoView())

const sortClosed = () =>
  [
    Command.resolve(Menu.test.FocusMenuButton, SortMenu.Message.CompletedFocusMenuButton()),
    Mount.expectEnded(Menu.test.AnchorMenu),
    Mount.expectEnded(Menu.test.PortalMenuBackdrop)
  ] as const

describe("a menu of one choice", () => {
  it("is a button that says the current choice, with a chevron, and no list while it is closed", () => {
    scene(
      { update, view },
      given(initial),
      expect(role("button", { name: "Sort: Latest activity" })).toHaveAttr("aria-haspopup", "menu"),
      expect(role("button", { name: "Sort: Latest activity" })).toHaveAttr("aria-expanded", "false"),
      expect(within(role("button", { name: "Sort: Latest activity" }), text("Latest activity"))).toExist(),
      expect(within(role("button", { name: "Sort: Latest activity" }), selector("svg"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(role("menu")).toBeAbsent()
    )
  })

  it("opens below its button, from its start, unless it is told where", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      Mount.expectHas(
        Menu.test.AnchorMenu({
          buttonId: "sort-menu-button",
          anchor: { placement: "bottom-start", gap: 6, padding: 8 }
        })
      ),
      ...sortOpened()
    )
  })

  it("opens a list of its choices, the current one marked, when the button is pressed", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      expect(role("button", { name: "Sort: Latest activity" })).toHaveAttr("aria-expanded", "true"),
      expect(role("menu")).toHaveAttr("aria-labelledby", "sort-menu-button"),
      expectAll(all.role("menuitem")).toHaveCount(3),
      expect(role("menuitem", { name: "Latest activity (selected)" })).toExist(),
      expect(role("menuitem", { name: "Newest" })).toExist(),
      expect(role("menuitem", { name: "Oldest" })).toExist()
    )
  })
})

describe("choosing from a menu", () => {
  it("closes the list, reports the value of the choice, and shows it on the button", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      click(role("menuitem", { name: "Newest" })),
      ...sortClosed(),
      expect(role("menu")).toBeAbsent(),
      expect(role("status")).toHaveText("Sort Newest, appearance System"),
      expect(role("button", { name: "Sort: Newest" })).toHaveAttr("aria-expanded", "false"),
      click(role("button", { name: "Sort: Newest" })),
      ...sortOpened(),
      expect(role("menuitem", { name: "Newest (selected)" })).toExist(),
      expect(role("menuitem", { name: "Latest activity" })).toExist()
    )
  })

  it("marks the current choice with a check that is hidden from assistive technology, and the others with none", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      expect(within(role("menuitem", { name: "Latest activity (selected)" }), selector("svg"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("menuitem", { name: "Newest" }), selector("svg"))).toBeAbsent()
    )
  })

  it("opens from the keyboard with the first choice active, walks the choices by arrow, and picks with Enter", () => {
    scene(
      { update, view },
      given(initial),
      keydown(role("button", { name: "Sort: Latest activity" }), "ArrowDown"),
      ...sortOpened(),
      expect(role("menuitem", { name: "Latest activity (selected)" })).toHaveAttr("data-active", ""),
      keydown(role("menu"), "ArrowDown"),
      scrolledIntoView(),
      expect(role("menuitem", { name: "Newest" })).toHaveAttr("data-active", ""),
      expect(role("menu")).toHaveAttr("aria-activedescendant", "sort-menu-item-1"),
      keydown(role("menu"), "End"),
      scrolledIntoView(),
      expect(role("menuitem", { name: "Oldest" })).toHaveAttr("data-active", ""),
      keydown(role("menu"), "Enter"),
      Command.expectHas(Menu.test.ClickMenuItem),
      Command.resolve(Menu.test.ClickMenuItem, SortMenu.Message.CompletedClickMenuItem()),
      click(role("menuitem", { name: "Oldest" })),
      ...sortClosed(),
      expect(role("status")).toHaveText("Sort Oldest, appearance System")
    )
  })

  it("jumps to the choice whose label begins with the letters typed", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      keydown(role("menu"), "o"),
      expect(role("menuitem", { name: "Oldest" })).toHaveAttr("data-active", ""),
      Command.resolve(Menu.test.DelayClearMenuSearch, SortMenu.Message.CompletedDelayClearMenuSearch({ version: 1 }))
    )
  })
})

describe("closing a menu without a choice", () => {
  it("closes on Escape and returns the focus to the button", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      keydown(role("menu"), "Escape"),
      Command.expectHas(Menu.test.FocusMenuButton),
      ...sortClosed(),
      expect(role("menu")).toBeAbsent(),
      expect(role("status")).toHaveText("Sort Activity, appearance System")
    )
  })

  it("closes on a click outside, over the backdrop that covers the window", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      click(selector("div.fixed.inset-0")),
      ...sortClosed(),
      expect(role("menu")).toBeAbsent(),
      expect(role("status")).toHaveText("Sort Activity, appearance System")
    )
  })

  it("closes when the button is pressed again", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortOpened(),
      click(role("button", { name: "Sort: Latest activity" })),
      ...sortClosed(),
      expect(role("menu")).toBeAbsent()
    )
  })
})

const accountOpened = () =>
  [
    Command.resolve(Menu.test.FocusMenuItems, AccountMenu.Message.CompletedFocusMenuItems()),
    Mount.resolve(Menu.test.AnchorMenu, AccountMenu.Message.CompletedAnchorMenu()),
    Mount.resolve(Menu.test.PortalMenuBackdrop, AccountMenu.Message.CompletedPortalMenuBackdrop())
  ] as const

const accountClosed = () =>
  [
    Command.resolve(Menu.test.FocusMenuButton, AccountMenu.Message.CompletedFocusMenuButton()),
    Mount.expectEnded(Menu.test.AnchorMenu),
    Mount.expectEnded(Menu.test.PortalMenuBackdrop)
  ] as const

describe("a menu of groups behind a plain button", () => {
  it("is a button named for what it opens that holds what it is given", () => {
    scene(
      { update, view },
      given(initial),
      expect(role("button", { name: "Account: Ada" })).toHaveAttr("aria-haspopup", "menu"),
      expect(within(role("button", { name: "Account: Ada" }), text("A"))).toExist(),
      expect(within(role("button", { name: "Account: Ada" }), selector("svg"))).toBeAbsent()
    )
  })

  it("has a header of a title over a detail with a line under it, a heading over a group of choices, and a line between the groups", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      expect(text("Ada Lovelace")).toExist(),
      expect(text("ada@mercier.example")).toExist(),
      expect(text("Appearance")).toExist(),
      expectAll(all.role("group")).toHaveCount(2),
      expect(within(role("menu"), selector("hr"))).toExist(),
      expectAll(all.role("separator")).toHaveCount(2),
      expectAll(all.role("menuitem")).toHaveCount(5)
    )
  })

  it("checks the current choice of a group and leaves the actions beside it without a check", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      expect(role("menuitem", { name: "System (selected)" })).toExist(),
      expect(role("menuitem", { name: "Light" })).toExist(),
      expect(within(role("menuitem", { name: "Sign out" }), selector("svg"))).toBeAbsent(),
      click(role("menuitem", { name: "Dark" })),
      ...accountClosed(),
      expect(role("status")).toHaveText("Sort Activity, appearance Dark"),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      expect(role("menuitem", { name: "Dark (selected)" })).toExist(),
      expect(role("menuitem", { name: "System" })).toExist()
    )
  })

  it("reports an action when it is chosen", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      click(role("menuitem", { name: "Switch workspace" })),
      ...accountClosed(),
      expect(role("note")).toHaveText("Switched true, signed out false"),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      click(role("menuitem", { name: "Sign out" })),
      ...accountClosed(),
      expect(role("note")).toHaveText("Switched true, signed out true")
    )
  })

  it("closes on Escape and returns the focus to its button", () => {
    scene(
      { update, view },
      given(initial),
      click(role("button", { name: "Account: Ada" })),
      ...accountOpened(),
      keydown(role("menu"), "Escape"),
      Command.expectHas(Menu.test.FocusMenuButton),
      ...accountClosed(),
      expect(role("menu")).toBeAbsent()
    )
  })
})

describe("a menu of one choice whose button says something else", () => {
  const statusChoices: ReadonlyArray<readonly [Sort, string]> = [
    ["Activity", "Any sort"],
    ["Newest", "Newest"]
  ]

  it("says the text it is given in place of the current choice, which the list still marks", () => {
    scene(
      {
        update,
        view: Composition.makeView((model, h) =>
          choiceMenu(h, {
            choices: statusChoices,
            value: model.sort,
            text: "Sort",
            embed: (viewInputs) => h.block(SortBinding.embedView({ slotId: "sort", model: model.sortMenu, viewInputs }))
          })
        )
      },
      given(initial),
      expect(role("button", { name: "Sort" })).toHaveAttr("aria-expanded", "false"),
      click(role("button", { name: "Sort" })),
      ...sortOpened(),
      expect(role("menuitem", { name: "Any sort (selected)" })).toExist(),
      expect(role("menuitem", { name: "Newest" })).toExist()
    )
  })
})

describe("a menu of choices with a mark", () => {
  const people: ReadonlyArray<ChoiceMenuChoice<Sort>> = [
    ["Activity", "Anyone"],
    ["Newest", "Alex Morgan", { text: "AM" }],
    ["Oldest", "Review helper", { text: "R", tone: "lilac" }]
  ]

  const peopleView = Composition.makeView((model, h) =>
    h.div(
      [],
      [
        h.p([h.Role("status")], [`Sort ${model.sort}`]),
        choiceMenu(h, {
          choices: people,
          value: model.sort,
          text: "Assignee",
          embed: (viewInputs) => h.block(SortBinding.embedView({ slotId: "sort", model: model.sortMenu, viewInputs }))
        })
      ]
    )
  )

  it("shows the mark of a person at 22px before their name, in their tone, hidden from assistive technology, and none before a choice without one", () => {
    scene(
      { update, view: peopleView },
      given(initial),
      click(role("button", { name: "Assignee" })),
      ...sortOpened(),
      expect(within(role("menuitem", { name: "Alex Morgan" }), text("AM"))).toHaveClass("size-5.5"),
      expect(within(role("menuitem", { name: "Alex Morgan" }), text("AM"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("menuitem", { name: "Alex Morgan" }), text("AM"))).toHaveClass("bg-avatar-neutral-bg"),
      expect(within(role("menuitem", { name: "Review helper" }), text("R"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("menuitem", { name: "Anyone (selected)" }), selector(".uppercase"))).toBeAbsent()
    )
  })

  it("names a choice by its label alone, and reports the value of the one chosen", () => {
    scene(
      { update, view: peopleView },
      given(initial),
      click(role("button", { name: "Assignee" })),
      ...sortOpened(),
      click(role("menuitem", { name: "Review helper" })),
      ...sortClosed(),
      expect(role("status")).toHaveText("Sort Oldest")
    )
  })
})

describe("a menu of choices with a task status", () => {
  const statusView = Composition.makeView((model, h) =>
    menu(h, {
      trigger: { text: "Status" },
      groups: [
        {
          choices: [
            { value: "Activity", label: "Triage", taskStatus: "triage", isChecked: model.sort === "Activity" },
            { value: "Newest", label: "Doing", taskStatus: "progress", isChecked: model.sort === "Newest" },
            { value: "Oldest", label: "Anything", isChecked: model.sort === "Oldest" }
          ]
        }
      ],
      embed: (viewInputs) => h.block(SortBinding.embedView({ slotId: "sort", model: model.sortMenu, viewInputs }))
    })
  )

  it("draws the status at 0.875rem before the label of a choice that has one, hidden from assistive technology, and nothing before one without", () => {
    scene(
      { update, view: statusView },
      given(initial),
      click(role("button", { name: "Status" })),
      ...sortOpened(),
      expect(within(role("menuitem", { name: "Triage (selected)" }), selector("svg"))).toHaveAttr("width", "0.875rem"),
      expect(within(role("menuitem", { name: "Triage (selected)" }), selector("svg"))).toHaveAttr(
        "aria-hidden",
        "true"
      ),
      expect(within(role("menuitem", { name: "Triage (selected)" }), selector("svg path[d='M8 4.6 V8.8']"))).toExist(),
      expect(within(role("menuitem", { name: "Doing" }), selector("svg path[d^='M8 3.6']"))).toExist(),
      expect(within(role("menuitem", { name: "Anything" }), selector("svg"))).toBeAbsent()
    )
  })
})

describe("a property that can be changed", () => {
  const assignees: ReadonlyArray<PropertyChoice<Sort>> = [
    { value: "Activity", label: "Unassigned", buttonIcon: "users" },
    { value: "Newest", label: "Alex Morgan", mark: { text: "AM" } },
    { value: "Oldest", label: "Review helper", mark: { text: "R", tone: "lilac" } }
  ]

  const statuses: ReadonlyArray<PropertyChoice<Sort>> = [
    { value: "Activity", label: "Triage", taskStatus: "triage" },
    { value: "Newest", label: "In progress", taskStatus: "progress" }
  ]

  const propertyView = (choices: ReadonlyArray<PropertyChoice<Sort>>, caption: string) =>
    Composition.makeView((model, h) =>
      h.div(
        [],
        [
          h.p([h.Role("status")], [`Sort ${model.sort}`]),
          propertyMenu(h, {
            caption,
            choices,
            value: model.sort,
            embed: (viewInputs) => h.block(SortBinding.embedView({ slotId: "sort", model: model.sortMenu, viewInputs }))
          })
        ]
      )
    )

  it("is a quiet button named by its caption and the current choice, with the caption in capitals over it, hidden from assistive technology", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given(initial),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveAttr("aria-haspopup", "menu"),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveClass("bg-transparent"),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveClass("border-transparent"),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveClass("text-hint"),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveClass("px-3"),
      expect(text("Assignee")).toHaveClass("uppercase"),
      expect(text("Assignee")).toHaveAttr("aria-hidden", "true"),
      expect(role("menu")).toBeAbsent()
    )
  })

  it("is pulled back by its padding so that its words start where the caption does", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given(initial),
      expect(role("button", { name: "Assignee: Unassigned" })).toHaveClass("-ms-2.5")
    )
  })

  it("shows its icon in the button for the choice that has one, and none in the list", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given(initial),
      expect(within(role("button", { name: "Assignee: Unassigned" }), selector("svg path[d^='M5 7a4']"))).toExist(),
      click(role("button", { name: "Assignee: Unassigned" })),
      ...sortOpened(),
      expect(
        within(role("menuitem", { name: "Unassigned (selected)" }), selector("svg path[d^='M5 7a4']"))
      ).toBeAbsent()
    )
  })

  it("shows the mark of a person at 24px in the button and at 22px in the list", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given({ ...initial, sort: "Newest" as const }),
      expect(within(role("button", { name: "Assignee: Alex Morgan" }), text("AM"))).toHaveClass("size-6"),
      click(role("button", { name: "Assignee: Alex Morgan" })),
      ...sortOpened(),
      expect(within(role("menuitem", { name: "Alex Morgan (selected)" }), text("AM"))).toHaveClass("size-5.5"),
      expect(within(role("menuitem", { name: "Review helper" }), text("R"))).toHaveClass("bg-avatar-lilac-bg")
    )
  })

  it("shows the status drawing before the words in the button and in the list, and reports the choice", () => {
    scene(
      { update, view: propertyView(statuses, "Status") },
      given(initial),
      expect(within(role("button", { name: "Status: Triage" }), selector("svg path[d='M8 4.6 V8.8']"))).toExist(),
      click(role("button", { name: "Status: Triage" })),
      ...sortOpened(),
      expect(within(role("menuitem", { name: "In progress" }), selector("svg path[d^='M8 3.6']"))).toExist(),
      click(role("menuitem", { name: "In progress" })),
      ...sortClosed(),
      expect(role("status")).toHaveText("Sort Newest"),
      expect(within(role("button", { name: "Status: In progress" }), selector("svg path[d^='M8 3.6']"))).toExist(),
      expect(
        within(role("button", { name: "Status: In progress" }), selector("svg path[d='M8 4.6 V8.8']"))
      ).toBeAbsent()
    )
  })

  it("lists its choices with the current one marked, and reports the value of the one chosen", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given(initial),
      click(role("button", { name: "Assignee: Unassigned" })),
      ...sortOpened(),
      expectAll(all.role("menuitem")).toHaveCount(3),
      expect(role("menuitem", { name: "Unassigned (selected)" })).toExist(),
      click(role("menuitem", { name: "Review helper" })),
      ...sortClosed(),
      expect(role("status")).toHaveText("Sort Oldest"),
      expect(role("button", { name: "Assignee: Review helper" })).toExist()
    )
  })

  it("opens below its button, from its start", () => {
    scene(
      { update, view: propertyView(assignees, "Assignee") },
      given(initial),
      click(role("button", { name: "Assignee: Unassigned" })),
      Mount.expectHas(
        Menu.test.AnchorMenu({
          buttonId: "sort-menu-button",
          anchor: { placement: "bottom-start", gap: 6, padding: 8 }
        })
      ),
      ...sortOpened()
    )
  })
})
