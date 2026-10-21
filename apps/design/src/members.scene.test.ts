import { describe, it } from "@effect/vitest"
import { Combobox } from "@foldkit/ui"
import { Multi } from "@foldkit/ui/combobox"
import { Schema } from "effect"
import { makeApplicationDefinition } from "foldkit"
import { type HtmlBuilder, childAttributes } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  expectIgnored,
  focus,
  given,
  keydown,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import {
  type GroupMember,
  type PickerPerson,
  memberCount,
  memberList,
  memberPicker,
  memberPickerList
} from "./members.ts"

const PickerBlock = Multi.create()

const Model = Schema.Struct({
  picker: PickerBlock.Model,
  chosen: Schema.Array(Schema.String),
  added: Schema.Finite
})
type Model = typeof Model.Type

const Message = defineMessageUnion({ ClickedRemove: { id: Schema.String }, ClickedAdd: {} })

const Definition = makeApplicationDefinition({ Model, Message })

const addPerson = (id: string) => Definition.stepFields(() => ({ chosen: (chosen) => [...chosen, id] }))

const PickerBinding = Definition.bindChild(PickerBlock, {
  field: "picker",
  init: { contextToArgs: () => [{ id: "members" }] },
  outMessage: {
    fold: PickerBlock.OutMessage.match({
      Selected: ({ value }) =>
        Update.combine([addPerson(value), PickerBinding.requestClose(), PickerBinding.requestOpen()]),
      ClearedSelection: () => Definition.stepNoop()
    })
  }
})

const Composition = Definition.makeComposition({ bindings: [PickerBinding] })

const update = Composition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedRemove: ({ id }) => ({ model: modifyFields(model, { chosen: (chosen) => chosen.filter((c) => c !== id) }) }),
    ClickedAdd: () => ({ model: modifyFields(model, { added: (added) => added + 1 }) })
  })
)

const init = Composition.makeInit((chosen: ReadonlyArray<string>) => ({ model: { chosen, added: 0 } }))

const initial = init([]).model
const withTwoChosen = init(["alex", "caleb"]).model

const you: PickerPerson = { id: "you", name: "You", mark: { text: "JM" }, kind: "Person" }
const people: ReadonlyArray<PickerPerson> = [
  { id: "alex", name: "Alex Morgan", mark: { text: "AM" }, kind: "Person" },
  { id: "caleb", name: "Caleb", mark: { text: "C" }, kind: "Person" },
  { id: "yumi", name: "Yumi", mark: { text: "Y", tone: "lilac" }, kind: "Agent" }
]

const view = Composition.makeView((model, h) =>
  memberPicker(h, {
    id: "members",
    label: "Members",
    locked: [you],
    chosen: model.chosen.flatMap((id) => people.filter((person) => person.id === id)),
    candidates: people,
    query: model.picker.inputValue,
    isOpen: model.picker.isOpen,
    hint: "You’re included automatically. Add others now or later.",
    onRemove: (id) => Message.ClickedRemove({ id }),
    embed: (viewInputs) => h.block(PickerBinding.embedView({ slotId: "members", model: model.picker, viewInputs }))
  })
)

/**
 * The picker as a dialog's first field: a label of its own, no one locked, a placeholder, and attributes on its input.
 */
const viewWithAttributes = Composition.makeView((model, h) =>
  memberPicker(h, {
    id: "members",
    label: "To",
    placeholder: "Add someone…",
    chosen: model.chosen.flatMap((id) => people.filter((person) => person.id === id)),
    candidates: people,
    query: model.picker.inputValue,
    isOpen: model.picker.isOpen,
    attributes: childAttributes([h.DataAttribute("probe", "")]),
    onRemove: (id) => Message.ClickedRemove({ id }),
    embed: (viewInputs) => h.block(PickerBinding.embedView({ slotId: "members", model: model.picker, viewInputs }))
  })
)

const toggleReady = Mount.resolve(Combobox.test.AttachPreventBlur, PickerBlock.Message.CompletedAttachPreventBlur())
const listPlaced = Mount.resolve(Combobox.test.Anchor, PickerBlock.Message.CompletedAnchor())
const backdropPlaced = Mount.resolve(Combobox.test.PortalBackdrop, PickerBlock.Message.CompletedPortalBackdrop())
const scrolled = Command.resolve(Combobox.test.ScrollItemIntoView, PickerBlock.Message.CompletedScrollItemIntoView())
const refocused = Command.resolve(Combobox.test.FocusInput, PickerBlock.Message.CompletedFocusInput())
const clickedActive = Command.resolve(Combobox.test.ClickItem, PickerBlock.Message.CompletedClickItem())

const combobox = role("combobox", { name: "Members" })

const options = all.role("option")

const open = [focus(combobox), listPlaced, backdropPlaced] as const

describe("memberPicker", () => {
  it("is a combobox found by its label, described by the hint", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      expect(combobox).toExist(),
      expect(combobox).toHaveAccessibleDescription("You’re included automatically. Add others now or later.")
    )
  })

  it("holds the locked person as a chip with no button that removes them", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      expect(text("You")).toExist(),
      expectAll(all.role("button", { name: /^Remove/ })).toBeEmpty()
    )
  })

  it("asks to search while the field holds no one else, and to add more once it does", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      expect(combobox).toHaveAttr("placeholder", "Search workspace members…")
    )
    scene({ update, view }, given(withTwoChosen), toggleReady, expect(combobox).toHaveAttr("placeholder", "Add more…"))
  })

  it("puts each person chosen in the field with a button named for them", () => {
    scene(
      { update, view },
      given(withTwoChosen),
      toggleReady,
      expect(text("Alex Morgan")).toExist(),
      expect(text("Caleb")).toExist(),
      expect(role("button", { name: "Remove Alex Morgan" })).toExist(),
      expect(role("button", { name: "Remove Caleb" })).toExist(),
      click(role("button", { name: "Remove Alex Morgan" })),
      expect(role("button", { name: "Remove Alex Morgan" })).toBeAbsent(),
      expect(role("button", { name: "Remove Caleb" })).toExist()
    )
  })

  it("opens a list of the people not in the field, headed by how many are available", () => {
    scene(
      { update, view },
      given(withTwoChosen),
      toggleReady,
      ...open,
      expect(role("listbox")).toExist(),
      expect(text("Workspace members")).toExist(),
      expect(text("1 available")).toExist(),
      expect(role("option", { name: /Yumi/ })).toExist(),
      expect(text("Agent")).toExist(),
      expect(text("Select one or more members.")).toExist(),
      expect(role("option", { name: /Alex Morgan/ })).toBeAbsent()
    )
  })

  it("offers everyone who is not locked or chosen when it opens", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      expect(text("3 available")).toExist(),
      expect(role("option", { name: /Alex Morgan/ })).toExist(),
      expect(role("option", { name: /Caleb/ })).toExist(),
      expect(role("option", { name: /Yumi/ })).toExist()
    )
  })

  it("narrows the list to the names that hold what is typed, whatever the case", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      type(combobox, "CA"),
      expect(text("1 available")).toExist(),
      expect(role("option", { name: /Caleb/ })).toExist(),
      expect(role("option", { name: /Alex Morgan/ })).toBeAbsent(),
      expect(role("option", { name: /Yumi/ })).toBeAbsent()
    )
  })

  it("says no one matches when nothing holds what is typed", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      type(combobox, "zzz"),
      expect(text("0 available")).toExist(),
      expect(text("No workspace members match.")).toExist(),
      expectAll(options).toHaveCount(1),
      expect(role("option", { name: /No workspace members match/ })).toHaveAttr("aria-disabled", "true")
    )
  })

  it("says everyone is in when no one is left to offer", () => {
    scene(
      { update, view },
      given(init(["alex", "caleb", "yumi"]).model),
      toggleReady,
      ...open,
      expect(text("0 available")).toExist(),
      expect(text("Everyone in the workspace is here.")).toExist()
    )
  })

  it("picks the person a click lands on, and keeps the list open for the next", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      click(role("option", { name: /Caleb/ })),
      refocused,
      expect(role("button", { name: "Remove Caleb" })).toExist(),
      expect(combobox).toHaveAttr("placeholder", "Add more…"),
      expect(role("listbox")).toExist(),
      expect(role("option", { name: /Caleb/ })).toBeAbsent(),
      expect(text("2 available")).toExist()
    )
  })

  it("moves through the list with the arrow keys and picks with Enter", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      keydown(combobox, "ArrowDown"),
      scrolled,
      expect(role("option", { name: /Alex Morgan/ })).toHaveAttr("data-active", ""),
      keydown(combobox, "ArrowDown"),
      scrolled,
      expect(role("option", { name: /Caleb/ })).toHaveAttr("data-active", ""),
      expect(role("option", { name: /Alex Morgan/ })).not.toHaveAttr("data-active"),
      keydown(combobox, "Enter"),
      clickedActive,
      click(role("option", { name: /Caleb/ })),
      refocused,
      expect(role("button", { name: "Remove Caleb" })).toExist(),
      expect(role("button", { name: "Remove Alex Morgan" })).toBeAbsent()
    )
  })

  it("empties the text typed once a person is picked", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      type(combobox, "yu"),
      keydown(combobox, "ArrowDown"),
      scrolled,
      keydown(combobox, "Enter"),
      clickedActive,
      click(role("option", { name: /Yumi/ })),
      refocused,
      expect(role("button", { name: "Remove Yumi" })).toExist(),
      expect(combobox).toHaveValue(""),
      expect(text("2 available")).toExist()
    )
  })

  it("closes the list with Escape", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      ...open,
      expect(role("listbox")).toExist(),
      keydown(combobox, "Escape"),
      refocused,
      Mount.expectEnded(Combobox.test.Anchor, Combobox.test.PortalBackdrop),
      expect(role("listbox")).toBeAbsent()
    )
  })

  it("removes the last person chosen with Backspace in the empty field", () => {
    scene(
      { update, view },
      given(withTwoChosen),
      toggleReady,
      ...open,
      keydown(combobox, "Backspace"),
      expect(role("button", { name: "Remove Caleb" })).toBeAbsent(),
      expect(role("button", { name: "Remove Alex Morgan" })).toExist(),
      keydown(combobox, "Backspace"),
      expect(role("button", { name: "Remove Alex Morgan" })).toBeAbsent(),
      keydown(combobox, "Backspace"),
      expectIgnored(),
      expect(text("You")).toExist()
    )
  })

  it("leaves the chips alone when Backspace erases text that was typed", () => {
    scene(
      { update, view },
      given(withTwoChosen),
      toggleReady,
      ...open,
      type(combobox, "y"),
      keydown(combobox, "Backspace"),
      expectIgnored(),
      expect(role("button", { name: "Remove Caleb" })).toExist(),
      expect(role("button", { name: "Remove Alex Morgan" })).toExist()
    )
  })

  it("puts the attributes it is given on its input, such as a dialog's initial focus, and no others", () => {
    scene(
      { update, view: viewWithAttributes },
      given(initial),
      toggleReady,
      expect(role("combobox", { name: "To" })).toHaveAttr("data-probe", ""),
      expect(role("combobox", { name: "To" })).toHaveAttr("placeholder", "Add someone…")
    )
    scene({ update, view }, given(initial), toggleReady, expect(combobox).not.toHaveAttr("data-probe"))
  })

  it("shows or hides the list from the button at the end of the field", () => {
    scene(
      { update, view },
      given(initial),
      toggleReady,
      expect(role("button", { name: "Show members" })).toExist(),
      ...open,
      expect(role("button", { name: "Hide members" })).toExist()
    )
  })
})

type Count = Readonly<{ count: number }>

const countUpdate = (model: Count) => ({ model })

describe("memberCount", () => {
  it("counts one person in the singular", () => {
    scene(
      { update: countUpdate, view: (model: Count, h) => memberCount(h, model.count) },
      given<Count>({ count: 1 }),
      expect(text("1 member")).toExist()
    )
  })

  it("counts any other number in the plural, before a rule hidden from assistive technology", () => {
    scene(
      { update: countUpdate, view: (model: Count, h) => memberCount(h, model.count) },
      given<Count>({ count: 4 }),
      expect(text("4 members")).toExist(),
      expectAll(all.selector('[aria-hidden="true"]')).toHaveCount(1)
    )
  })
})

const RowMessage = defineMessageUnion({ ClickedRemove: { key: Schema.String } })

const rowMembers: ReadonlyArray<GroupMember<typeof RowMessage.Type>> = [
  { key: "you", name: "Jamie Morgan", mark: { text: "JM" }, note: "You" },
  {
    key: "sara",
    name: "Sara",
    mark: { text: "S" },
    action: { label: "Remove", name: "Remove Sara", onClick: RowMessage.ClickedRemove({ key: "sara" }) }
  },
  {
    key: "yumi",
    name: "Yumi",
    mark: { text: "Y", tone: "lilac" },
    note: "Agent",
    action: {
      label: "Remove",
      name: "Remove Yumi",
      isDisabled: true,
      onClick: RowMessage.ClickedRemove({ key: "yumi" })
    }
  }
]

type Removed = ReadonlyArray<string>

const rowUpdate = (model: Removed, message: typeof RowMessage.Type) =>
  RowMessage.match<Update.Return<Removed, typeof RowMessage.Type>>(message, {
    ClickedRemove: ({ key }) => ({ model: [...model, key] })
  })

describe("memberList", () => {
  const rowScene = {
    update: rowUpdate,
    view: (_model: Removed, h: HtmlBuilder<typeof RowMessage.Type, never>) =>
      memberList(h, { label: "Members", members: rowMembers })
  }

  it("lists each person under the name the list is given, with the note beside them", () => {
    scene(
      rowScene,
      given<Removed>([]),
      expect(role("list", { name: "Members" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(3),
      expect(text("Jamie Morgan")).toExist(),
      expect(text("You")).toExist(),
      expect(text("Agent")).toExist()
    )
  })

  it("gives a button only to the people it can remove, named for them", () => {
    scene(
      rowScene,
      given<Removed>([]),
      expectAll(all.role("button")).toHaveCount(2),
      expect(role("button", { name: "Remove Sara" })).toHaveText("Remove"),
      click(role("button", { name: "Remove Sara" }))
    )
  })

  it("disables a removal that is on its way", () => {
    scene(
      rowScene,
      given<Removed>([]),
      expect(role("button", { name: "Remove Yumi" })).toHaveAttr("aria-disabled", "true"),
      expect(role("button", { name: "Remove Sara" })).not.toHaveAttr("aria-disabled")
    )
  })
})

const ListMessage = defineMessageUnion({
  TypedQuery: { query: Schema.String },
  Picked: { id: Schema.String },
  Removed: { id: Schema.String }
})
type ListMessage = typeof ListMessage.Type

type ListModel = Readonly<{ query: string; chosen: ReadonlyArray<string> }>

const listInitial: ListModel = { query: "", chosen: [] }

const listUpdate = (model: ListModel, message: ListMessage) =>
  ListMessage.match<Update.Return<ListModel, ListMessage>>(message, {
    TypedQuery: ({ query }) => ({ model: modifyFields(model, { query: () => query }) }),
    Picked: ({ id }) => ({ model: modifyFields(model, { chosen: (chosen) => [...chosen, id], query: () => "" }) }),
    Removed: ({ id }) => ({ model: modifyFields(model, { chosen: (chosen) => chosen.filter((c) => c !== id) }) })
  })

const listView = (model: ListModel, h: HtmlBuilder<ListMessage>) =>
  memberPickerList(h, {
    id: "add-members-search",
    label: "Search workspace members",
    chosen: model.chosen.flatMap((id) => people.filter((person) => person.id === id)),
    candidates: people,
    query: model.query,
    onQuery: (query) => ListMessage.TypedQuery({ query }),
    onPick: (id) => ListMessage.Picked({ id }),
    onRemove: (id) => ListMessage.Removed({ id })
  })

describe("memberPickerList", () => {
  const listScene = { update: listUpdate, view: listView }

  it("shows the people it offers under the label of its search, with how many are available and how to use it", () => {
    scene(
      listScene,
      given(listInitial),
      expect(label("Search workspace members")).toHaveAttr("placeholder", "Search workspace members…"),
      expect(text("Workspace members")).toExist(),
      expect(text("3 available")).toExist(),
      expectAll(all.role("button")).toHaveCount(3),
      expect(role("button", { name: /Alex Morgan/ })).toExist(),
      expect(role("button", { name: /Yumi/ })).toExist(),
      expect(text("Agent")).toExist(),
      expect(text("Select one or more members.")).toExist(),
      expectAll(all.role("combobox")).toHaveCount(0)
    )
  })

  it("narrows the list to the names that hold what is typed, whatever the case", () => {
    scene(
      listScene,
      given(listInitial),
      type(label("Search workspace members"), "CA"),
      expect(text("1 available")).toExist(),
      expect(role("button", { name: /Caleb/ })).toExist(),
      expect(role("button", { name: /Alex Morgan/ })).toBeAbsent()
    )
  })

  it("says no one matches when nothing holds what is typed, and that everyone is in when no one is left", () => {
    scene(
      listScene,
      given(listInitial),
      type(label("Search workspace members"), "zzz"),
      expect(text("0 available")).toExist(),
      expect(text("No workspace members match.")).toExist(),
      expectAll(all.role("button")).toHaveCount(0)
    )
    scene(
      listScene,
      given({ query: "", chosen: ["alex", "caleb", "yumi"] }),
      expect(text("Everyone in the workspace is here.")).toExist(),
      expect(label("Search workspace members")).toHaveAttr("placeholder", "Add more…")
    )
  })

  it("chooses the person pressed, as a chip with a Remove button that leaves the list", () => {
    scene(
      listScene,
      given(listInitial),
      click(role("button", { name: /Caleb/ })),
      expect(role("button", { name: "Remove Caleb" })).toExist(),
      expect(text("2 available")).toExist(),
      click(role("button", { name: "Remove Caleb" })),
      expect(role("button", { name: "Remove Caleb" })).toBeAbsent(),
      expect(text("3 available")).toExist()
    )
  })

  it("removes the last chip with Backspace in the empty input, and none while there is text", () => {
    scene(
      listScene,
      given({ query: "", chosen: ["alex", "caleb"] }),
      keydown(label("Search workspace members"), "Backspace"),
      expect(role("button", { name: "Remove Caleb" })).toBeAbsent(),
      expect(role("button", { name: "Remove Alex Morgan" })).toExist(),
      type(label("Search workspace members"), "y"),
      keydown(label("Search workspace members"), "Backspace"),
      expectIgnored(),
      expect(role("button", { name: "Remove Alex Morgan" })).toExist()
    )
  })
})
