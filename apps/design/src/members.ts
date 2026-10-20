/**
 * The people of a group: the field that chooses several workspace members, the line that counts the people a group
 * holds, and the list of them. The field is the look of `@foldkit/ui`'s headless multi-select combobox, so the
 * framework keeps the input, the list's arrow keys, Enter, Escape, the focus, and the labels, and this module gives
 * them the look and puts the people chosen so far in the field as chips. For a phone, where a list that opens over the
 * form has no room, `memberPickerList` is the same field with the list always shown under it, and no combobox.
 *
 * A Block that has a members picker:
 *
 * - creates the combobox's Block once, `Combobox.Multi.create()`, and binds it as a child, with an `id` for the
 *   combobox through `init`;
 * - folds the Block's `Selected` out message into the people it holds, adding the one chosen, and asks the Block to
 *   close and open again so that the text typed is emptied and the list stays open for the next;
 * - renders the field with `memberPicker`, whose `embed` embeds the bound Block with the view inputs the design built:
 *   `(viewInputs) => h.block(PickerBinding.embedView({ slotId, model: model.picker, viewInputs }))`.
 */

import { type Multi, inputId } from "@foldkit/ui/combobox"
import * as Option from "effect/Option"
import { type Html, type HtmlBuilder, childAttributes } from "foldkit/html"
import { type PublishedAttributes, answerKeys, button } from "./control.ts"
import { icon } from "./icon.ts"
import { type MarkContent, mark } from "./mark.ts"

const fieldColumn = "flex flex-col gap-2"

const fieldLabel = "block p-0 text-item font-medium text-ink"

const hiddenLabel = "sr-only"

const hintText = "m-0 text-hint text-ink-muted"

const pickerRow = "flex items-start gap-3"

const pickerAction = "mt-0.5 flex w-22 flex-none"

const pickerColumn = "flex min-w-0 flex-1 flex-col"

const controlBase =
  "relative flex min-h-10.5 min-w-0 flex-wrap items-center gap-1.5 border bg-field px-2 py-1.25 focus-within:border-outline-strong max-desktop:min-h-11"

const searchIcon = "ms-1 flex flex-none text-ink-muted"

const chipBase = "z-10 inline-flex h-7 flex-none items-center gap-1 bg-selected ps-1 text-hint font-medium text-ink"

const chipLocked = "pe-2"

const chipRemove =
  "grid size-6 flex-none cursor-pointer place-items-center border-0 bg-transparent p-0 text-ink-secondary hover:text-ink focus-ring-inset"

const comboboxLook = "relative z-10 min-w-28 flex-[1_1_7rem]"

const inputWrapperLook = "flex items-center"

const inputLook =
  "m-0 h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-control text-ink outline-none placeholder:text-ink-muted max-tablet:text-body-touch"

const toggleLook = "grid size-7 flex-none cursor-pointer place-items-center bg-transparent p-0 text-ink-secondary"

const panelLook = "z-40 flex w-(--button-width) flex-col border border-outline bg-popover shadow-popover outline-none"

const panelScroll = "max-h-72 overflow-y-auto overscroll-contain pb-1"

const backdropLook = "fixed inset-0 z-0"

const headingLook =
  "sticky top-0 z-10 flex justify-between gap-3 bg-popover px-3 pt-2.5 pb-1.5 text-hint font-medium text-ink-secondary"

const availableCount = "font-normal text-ink-muted"

const optionLook =
  "mx-2 grid min-h-12 cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 data-active:bg-subtle"

const optionText = "flex min-w-0 flex-col"

const optionName = "truncate text-control font-medium text-ink"

const optionKind = "text-hint text-ink-secondary"

const optionPlus = "flex text-ink-secondary"

const footerLook =
  "sticky bottom-0 z-10 mt-1 cursor-default border-t border-divider bg-popover px-3 pt-1.5 pb-2 text-hint text-ink-secondary"

const countRow = "mt-1 flex items-center gap-5"

const countLabel = "flex-none text-control leading-4.5 font-medium text-ink-secondary"

const countRule = "h-0 min-w-4 flex-1 border-t border-dashed border-stitch"

const memberListLook = "mx-0 mb-0 -mt-1 list-none p-0"

const memberRow =
  "grid min-h-10 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 max-tablet:min-h-14 max-tablet:grid-cols-[2rem_minmax(0,1fr)_auto]"

const memberText = "flex min-w-0 items-baseline gap-2 max-tablet:flex-col max-tablet:gap-0"

const memberName = "truncate text-control leading-5.25 font-medium text-ink max-tablet:text-item"

const memberNote = "text-hint text-ink-secondary"

/** The item that holds the words under the list, which no one can choose: no person has an empty ID. */
const footerItem = ""

/** Whether a member is a person or an agent, which the picker's list says under their name. */
export type PickerKind = "Person" | "Agent"

/**
 * One workspace member the picker offers or holds: its `id`, their `name`, their `mark` in their tone, and whether
 * they are a person or an agent.
 */
export type PickerPerson = Readonly<{
  id: string
  name: string
  mark: MarkContent
  kind: PickerKind
}>

/** The words under the list: how to use it, or why it offers no one, by how many people are offered and available. */
const footerWords = (offered: number, available: number): string => {
  if (offered > 0) {
    return "Select one or more members."
  }

  return available > 0 ? "No workspace members match." : "Everyone in the workspace is here."
}

const removeChip = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  person: PickerPerson,
  onRemove: (id: string) => Message
): Html =>
  h.button(
    [h.Type("button"), h.OnClick(onRemove(person.id)), h.Class(chipRemove)],
    [icon(h, "mark-close", { size: "xs" }), h.span([h.Class(hiddenLabel)], [`Remove ${person.name}`])]
  )

const chip = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  person: PickerPerson,
  remove: Option.Option<Html>
): Html =>
  h.keyed("span")(
    person.id,
    [h.Class(Option.isSome(remove) ? chipBase : `${chipBase} ${chipLocked}`)],
    [mark(h, { ...person.mark, size: "choice" }), person.name, Option.getOrElse(remove, () => h.empty)]
  )

const option = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, person: PickerPerson): Html =>
  h.div(
    [h.Class("contents")],
    [
      mark(h, { ...person.mark, size: "account" }),
      h.span(
        [h.Class(optionText)],
        [h.span([h.Class(optionName)], [person.name]), h.span([h.Class(optionKind)], [person.kind])]
      ),
      h.span([h.Class(optionPlus)], [icon(h, "mark-new", { size: "sm" })])
    ]
  )

/**
 * What a field of people takes: the combobox's `id`, which names the elements of the field, a visible `label`, and
 * who is in it, who is offered, and the text typed.
 */
export type MemberPickerConfig<Message> = Readonly<{
  /** The `id` the combobox Block was initialized with. The input is `inputId(id)`, and the label is for it. */
  id: string
  label: string
  /** The label names the input for assistive technology and is not shown, for a field in a section that names it. */
  isLabelHidden?: boolean
  /** Shown while the field holds no one besides who is locked. */
  placeholder?: string
  /** People who are always in the field and can't be removed, such as the person themself as "You". */
  locked?: ReadonlyArray<PickerPerson>
  /** People chosen so far, shown as chips in the order given, each removable. */
  chosen: ReadonlyArray<PickerPerson>
  /** Everyone who may be chosen. The list offers those who are not in the field and whose name holds the text typed. */
  candidates: ReadonlyArray<PickerPerson>
  /** The combobox Block's `inputValue`, the text typed, which narrows the list. */
  query: string
  /** The combobox Block's `isOpen`, which says what the button at the field's end does. */
  isOpen: boolean
  /** A line of what to know about the field, 8px under it, which describes the input. */
  hint?: string
  /** A control after the field, such as the button that adds who is chosen, level with its top. */
  action?: Html
  /** Go onto the input: the `initialFocus` of a dialog whose first field this is, which takes focus as it opens. */
  attributes?: PublishedAttributes
  /** What removing a chip sends, from its button and from Backspace in the empty field, which removes the last. */
  onRemove: (id: string) => Message
  /** Embeds the bound combobox Block with the view inputs the design built. */
  embed: (viewInputs: Multi.ViewInputs<string>) => Html
}>

/**
 * The view inputs of the headless combobox for `config`: one item for each person offered whose name holds the text
 * typed, the words under them as an item that can't be chosen, the heading of the list, and the field's and the
 * list's place and look.
 */
const viewInputsOf = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MemberPickerConfig<Message>
): Multi.ViewInputs<string> => {
  const taken = [...(config.locked ?? []), ...config.chosen].map(({ id }) => id)
  const available = config.candidates.filter(({ id }) => !taken.includes(id))
  const wanted = config.query.trim().toLowerCase()
  const offered = available.filter(({ name }) => name.toLowerCase().includes(wanted))
  const personOf = (id: string) => offered.find((person) => person.id === id)
  const last = config.chosen.at(-1)

  return {
    items: [...offered.map(({ id }) => id), footerItem],
    selectedValues: config.chosen.map(({ id }) => id),
    restingInputValue: "",
    itemToValue: (item) => item,
    itemToDisplayText: (item) => personOf(item)?.name ?? item,
    isItemDisabled: (item) => item === footerItem,
    itemToConfig: (item) => {
      const person = personOf(item)

      return person === undefined
        ? { className: footerLook, content: h.span([], [footerWords(offered.length, available.length)]) }
        : { className: optionLook, content: option(h, person) }
    },
    itemGroupKey: () => "people",
    groupToHeading: () => ({
      className: headingLook,
      content: h.div(
        [h.Class("contents")],
        [h.span([], ["Workspace members"]), h.span([h.Class(availableCount)], [`${offered.length} available`])]
      )
    }),
    inputPlaceholder: config.chosen.length > 0 ? "Add more…" : (config.placeholder ?? "Search workspace members…"),
    inputClassName: inputLook,
    inputAttributes: [
      ...childAttributes([
        ...(config.hint === undefined ? [] : [h.AriaDescribedBy(`${config.id}-hint`)]),
        answerKeys(h, (key) =>
          key === "Backspace" && config.query === "" && last !== undefined
            ? Option.some(config.onRemove(last.id))
            : Option.none()
        )
      ]),
      ...(config.attributes ?? [])
    ],
    inputWrapperClassName: inputWrapperLook,
    inputWrapperAttributes: childAttributes([h.Id(`${config.id}-field`)]),
    className: comboboxLook,
    buttonContent: icon(h, "chevron-down", { size: "xs" }),
    buttonClassName: toggleLook,
    buttonAttributes: childAttributes([h.AriaLabel(config.isOpen ? "Hide members" : "Show members")]),
    itemsClassName: panelLook,
    itemsScrollClassName: panelScroll,
    backdropClassName: backdropLook,
    openOnFocus: true,
    anchor: { placement: "bottom-start", gap: 6, padding: 8 }
  }
}

/**
 * A field that chooses several workspace members by name, under its `label`. The people chosen are chips in the
 * field, each with a Remove button named for them, and the `locked` ones before them have none. The input narrows
 * the people it offers to those whose name holds what is typed, in a list under the field headed "Workspace members"
 * and how many are available, each with their mark and name and whether they are a person or an agent. The arrow
 * keys move through the list, Enter picks, Escape closes it, and Backspace in the empty field removes the last chip.
 * Under the list a line says how to use it, or that no one matches, or that everyone is in. The field opens the list
 * as it takes focus, and a button at its end shows or hides it. The `hint` is under the field and describes the input;
 * the `action` is a control level with the field's top, such as the button that adds who is chosen; the `attributes`
 * go onto the input, such as a dialog's `initialFocus` when the picker is the first thing the dialog asks.
 *
 * The list is the framework's, which the combobox places against the whole field and not against its input, so that it
 * is as wide as the field wherever the chips leave the input. For that the field carries the `-input-wrapper` id the
 * combobox places against, and the input's own wrapper another.
 */
export const memberPicker = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MemberPickerConfig<Message>
): Html => {
  const locked = config.locked ?? []
  const hasChips = config.chosen.length > 0 || locked.length > 0
  const field = h.div(
    [
      h.Id(`${config.id}-input-wrapper`),
      h.Class(`${controlBase} ${config.isOpen ? "border-outline-strong" : "border-outline"}`)
    ],
    [
      hasChips ? h.empty : h.span([h.Class(searchIcon)], [icon(h, "mark-search", { size: "sm" })]),
      ...locked.map((person) => chip(h, person, Option.none())),
      ...config.chosen.map((person) => chip(h, person, Option.some(removeChip(h, person, config.onRemove)))),
      config.embed(viewInputsOf(h, config))
    ]
  )

  return h.div(
    [h.Class(fieldColumn)],
    [
      h.label(
        [h.For(inputId(config.id)), h.Class(config.isLabelHidden === true ? hiddenLabel : fieldLabel)],
        [config.label]
      ),
      h.div(
        [h.Class(pickerRow)],
        [
          h.div([h.Class(pickerColumn)], [field]),
          config.action === undefined ? h.empty : h.div([h.Class(pickerAction)], [config.action])
        ]
      ),
      config.hint === undefined ? h.empty : h.p([h.Id(`${config.id}-hint`), h.Class(hintText)], [config.hint])
    ]
  )
}

/**
 * What a list of people to choose among takes: the `id` of its search input, a visible `label`, the people `chosen`
 * so far, everyone who may be chosen, and the text typed.
 */
export type MemberPickerListConfig<Message> = Readonly<{
  /** The `id` of the search input, which the label is for. */
  id: string
  label: string
  /** Shown while no one is chosen. */
  placeholder?: string
  /** People chosen so far, shown as chips in the order given, each removable. */
  chosen: ReadonlyArray<PickerPerson>
  /** Everyone who may be chosen. The list shows those who are not chosen and whose name holds the text typed. */
  candidates: ReadonlyArray<PickerPerson>
  /** The text typed, which narrows the list. */
  query: string
  onQuery: (query: string) => Message
  /** What choosing a person from the list sends. */
  onPick: (id: string) => Message
  /** What a chip's Remove button, and Backspace in the empty input, which removes the last, sends. */
  onRemove: (id: string) => Message
}>

const listPanel = "mt-2 flex flex-col border border-outline bg-popover"

const listScroll = "max-h-72 overflow-y-auto overscroll-contain pb-1"

const listHeading = "flex justify-between gap-3 px-3 pt-2.5 pb-1.5 text-hint font-medium text-ink-secondary"

const listOption =
  "mx-2 grid min-h-12 w-[calc(100%-1rem)] cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-0 bg-transparent px-3 text-start hover:bg-subtle focus-ring-inset"

const listFooter = "m-0 border-t border-divider px-3 pt-1.5 pb-2 text-hint text-ink-secondary"

const listInput =
  "m-0 h-7 min-w-28 flex-[1_1_7rem] border-0 bg-transparent px-1 text-body-touch text-ink outline-none placeholder:text-ink-muted"

/**
 * A field of chips and the people to choose among as a list that is always shown under it, for a phone, where a list
 * that opens over the form has no room. It is the look of `memberPicker` without the combobox: the people chosen are
 * chips in the field with a Remove button named for them, the input narrows the list to the names that hold what is
 * typed, whatever its case, Backspace in the empty input removes the last chip, and the list, headed "Workspace
 * members" and how many are available, has a button for each person, named by their name and whether they are a person
 * or an agent, that chooses them. Under the people the line says how to use it, or that no one matches, or that
 * everyone is in.
 */
export const memberPickerList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MemberPickerListConfig<Message>
): Html => {
  const taken = config.chosen.map(({ id }) => id)
  const available = config.candidates.filter(({ id }) => !taken.includes(id))
  const wanted = config.query.trim().toLowerCase()
  const offered = available.filter(({ name }) => name.toLowerCase().includes(wanted))
  const last = config.chosen.at(-1)

  return h.div(
    [h.Class(fieldColumn)],
    [
      h.label([h.For(config.id), h.Class(fieldLabel)], [config.label]),
      h.div(
        [h.Class(`${controlBase} border-outline`)],
        [
          config.chosen.length > 0 ? h.empty : h.span([h.Class(searchIcon)], [icon(h, "mark-search", { size: "sm" })]),
          ...config.chosen.map((person) => chip(h, person, Option.some(removeChip(h, person, config.onRemove)))),
          h.input([
            h.Id(config.id),
            h.Type("text"),
            h.Value(config.query),
            h.Placeholder(config.chosen.length > 0 ? "Add more…" : (config.placeholder ?? "Search workspace members…")),
            h.Autocomplete("off"),
            h.OnInput(config.onQuery),
            answerKeys(h, (key) =>
              key === "Backspace" && config.query === "" && last !== undefined
                ? Option.some(config.onRemove(last.id))
                : Option.none()
            ),
            h.Class(listInput)
          ])
        ]
      ),
      h.div(
        [h.Class(listPanel)],
        [
          h.div(
            [h.Class(listHeading)],
            [h.span([], ["Workspace members"]), h.span([h.Class(availableCount)], [`${offered.length} available`])]
          ),
          offered.length === 0
            ? h.empty
            : h.ul(
                [h.AriaLabel("Workspace members"), h.Class(`${listScroll} m-0 list-none p-0`)],
                offered.map((person) =>
                  h.keyed("li")(
                    person.id,
                    [],
                    [
                      h.button(
                        [h.Type("button"), h.OnClick(config.onPick(person.id)), h.Class(listOption)],
                        [
                          mark(h, { ...person.mark, size: "account" }),
                          h.span(
                            [h.Class(optionText)],
                            [h.span([h.Class(optionName)], [person.name]), h.span([h.Class(optionKind)], [person.kind])]
                          ),
                          h.span([h.Class(optionPlus)], [icon(h, "mark-new", { size: "sm" })])
                        ]
                      )
                    ]
                  )
                )
              ),
          h.p([h.Class(listFooter)], [footerWords(offered.length, available.length)])
        ]
      )
    ]
  )
}

/**
 * How many people a group holds, "1 member" or "4 members", before a dashed rule that runs to the end of the line,
 * which sets the list that follows it apart.
 */
export const memberCount = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, count: number): Html =>
  h.div(
    [h.Class(countRow)],
    [
      h.span([h.Class(countLabel)], [count === 1 ? "1 member" : `${count} members`]),
      h.span([h.AriaHidden(true), h.Class(countRule)])
    ]
  )

/**
 * One person a group holds: its `key`, their `name`, their `mark` in their tone, a quiet `note` beside the name such as
 * "You" or "Agent", and, where the reader may remove them, the `action` of a quiet button, `{ label, name, isDisabled?,
 * onClick }`, named by `name`, which begins with the label, such as "Remove Sara".
 */
export type GroupMember<Message> = Readonly<{
  key: string
  name: string
  mark: MarkContent
  note?: string
  action?: Readonly<{ label: string; name: string; isDisabled?: boolean; onClick: Message }>
}>

/**
 * The people a group holds as a list named `label`: a row each of their mark at 28px in their tone, their name in
 * medium weight with the `note` after it in quiet text, and the `action` at the end. Below 48rem a row is 56px tall
 * with the note under the name.
 */
export const memberList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; members: ReadonlyArray<GroupMember<Message>> }>
): Html =>
  h.ul(
    [h.AriaLabel(config.label), h.Class(memberListLook)],
    config.members.map((member) =>
      h.keyed("li")(
        member.key,
        [h.Class(memberRow)],
        [
          mark(h, { ...member.mark, size: "account" }),
          h.span(
            [h.Class(memberText)],
            [
              h.span([h.Class(memberName)], [member.name]),
              member.note === undefined ? h.empty : h.span([h.Class(memberNote)], [member.note])
            ]
          ),
          member.action === undefined
            ? h.empty
            : button(h, member.action.label, member.action.onClick, {
                variant: "quiet",
                name: member.action.name,
                ...(member.action.isDisabled === undefined ? {} : { isDisabled: member.action.isDisabled })
              })
        ]
      )
    )
  )
