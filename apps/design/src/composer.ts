/**
 * Where the person writes a message: a box that grows with what they type, with the button that sends it, the
 * toolbar of formatting over it and the buttons beside Send that show it and start a mention, and the list of people
 * or commands that opens over it while they type one.
 */

import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { ChildAttribute, HtmlBuilder, KeyboardModifiers, TextareaAttribute } from "foldkit/html"
import { answerKeys, iconButton, iconSubmit } from "./control.ts"
import type { IconName } from "./icon.ts"
import { type MarkContent, mark } from "./mark.ts"

const composerBox = "relative flex flex-col border border-outline bg-field focus-within:border-outline-strong"

const composerLabel = "sr-only"

const composerText =
  "block max-h-60 min-h-10 w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-body text-ink outline-none field-sizing-content placeholder:text-ink-muted max-tablet:text-body-touch"

const composerFormatting =
  "flex flex-none items-center gap-0.5 overflow-x-auto px-1.5 pt-1.5 [scrollbar-width:none] max-desktop:gap-0"

const composerFormattingHidden = "hidden"

const formattingDivider = "mx-1 h-4 w-px flex-none bg-divider"

const composerActions = "flex flex-none items-center gap-0.5 px-1.5 pb-1.5"

const composerSend = "ms-auto flex"

const suggestionList =
  "absolute bottom-full z-10 mb-1 flex max-w-full flex-col border border-outline bg-raised py-1 shadow-popover"

const suggestionListNarrow = "start-0 w-64"

const suggestionListWide = "inset-x-0"

const suggestionRow =
  "flex min-w-0 cursor-pointer items-center gap-2 px-3 py-1 text-control text-ink hover:bg-hover aria-selected:bg-selected"

const suggestionName = "min-w-0 truncate"

const suggestionCommandName = "flex-none font-medium"

const suggestionDescription = "min-w-0 truncate text-ink-secondary"

/**
 * One row the list offers: its `id`, what it is called, what picking it sends, and, before the name, a `mark` in the
 * person's tone for a person, or, after it, a `description` of what a command does.
 */
export type Suggestion<Message> = Readonly<{
  id: string
  name: string
  mark?: MarkContent | undefined
  description?: string | undefined
  isActive: boolean
  onPick: Message
}>

/**
 * The list of people to mention or commands to run, found by `id` and named `label`, in the order given; `onKeyDown`
 * says what a key pressed in the box sends, or nothing to leave the key to the box.
 */
export type Suggestions<Message> = Readonly<{
  id: string
  label: string
  items: ReadonlyArray<Suggestion<Message>>
  onKeyDown: (key: string) => Option.Option<Message>
}>

/**
 * One button of the formatting toolbar: its `icon`, its `label`, the `keys` that do the same, as assistive technology
 * names them, such as "Control+B Meta+B", and what pressing it sends.
 */
export type FormatButton<Message> = Readonly<{
  icon: IconName
  label: string
  keys?: string | undefined
  onClick: Message
}>

/**
 * The toolbar of formatting over the box, found by `id` and named `label`, as is the button that shows and hides it:
 * the buttons in `groups`, a rule between one group and the next, whether it is shown, and what the button that shows
 * or hides it sends.
 */
export type Formatting<Message> = Readonly<{
  id: string
  label: string
  isShown: boolean
  groups: ReadonlyArray<ReadonlyArray<FormatButton<Message>>>
  onToggle: Message
}>

/** The button that starts a mention, named `label`, and what pressing it sends. */
export type MentionButton<Message> = Readonly<{ label: string; onClick: Message }>

const optionId = (suggestions: Suggestions<unknown>, item: Suggestion<unknown>) => `${suggestions.id}-${item.id}`

/** What the textarea says of the list open over it. */
const suggestionAttributes = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  suggestions: Suggestions<Message>
) => {
  const active = suggestions.items.find(({ isActive }) => isActive)

  return [
    h.AriaAutocomplete("list"),
    h.AriaControls(suggestions.id),
    h.AriaExpanded(true),
    ...(active === undefined ? [] : [h.AriaActiveDescendant(optionId(suggestions, active))])
  ]
}

/** What a row holds: the person's mark, the name, and the description of a command. */
const suggestionContent = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, item: Suggestion<Message>) => [
  ...(item.mark === undefined ? [] : [mark(h, { ...item.mark, size: "choice" })]),
  h.span([h.Class(item.description === undefined ? suggestionName : suggestionCommandName)], [item.name]),
  ...(item.description === undefined ? [] : [h.span([h.Class(suggestionDescription)], [item.description])])
]

/**
 * The list, each row sending its pick on a click and returning the focus to the textarea `textareaId`. It is as wide
 * as the box when its rows have descriptions, which need the room, and 16rem otherwise.
 */
const suggestionListView = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  textareaId: string,
  suggestions: Suggestions<Message>
) => {
  const focusSelector = `#${CSS.escape(textareaId)}`
  const hasDescriptions = suggestions.items.some(({ description }) => description !== undefined)

  return h.div(
    [
      h.Id(suggestions.id),
      h.Role("listbox"),
      h.AriaLabel(suggestions.label),
      h.Class(`${suggestionList} ${hasDescriptions ? suggestionListWide : suggestionListNarrow}`)
    ],
    suggestions.items.map((item) =>
      h.div(
        [
          h.Key(item.id),
          h.Id(optionId(suggestions, item)),
          h.Role("option"),
          h.AriaSelected(item.isActive),
          h.OnClick(item.onPick, { defaultAction: "Prevent", focusSelector }),
          h.Class(suggestionRow)
        ],
        suggestionContent(h, item)
      )
    )
  )
}

/** The toolbar of formatting: a compact button for each of the groups' buttons, a rule between groups. */
const formattingView = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  formatting: Formatting<Message>
) =>
  h.div(
    [
      h.Id(formatting.id),
      h.Role("toolbar"),
      h.AriaLabel(formatting.label),
      ...(formatting.isShown ? [] : [h.Hidden(true)]),
      h.Class(formatting.isShown ? composerFormatting : composerFormattingHidden)
    ],
    formatting.groups.flatMap((group, index) => [
      ...(index === 0 ? [] : [h.div([h.AriaHidden(true), h.Class(formattingDivider)])]),
      ...group.map((button) =>
        iconButton(
          h,
          { icon: button.icon, label: button.label, onClick: button.onClick },
          { size: "compact", ...(button.keys === undefined ? {} : { shortcuts: button.keys }) }
        )
      )
    ])
  )

/**
 * A form named by `label`: a bordered box holding the textarea for `id`, whose label is read by assistive
 * technology and not shown, and whose `placeholder` shows while it is empty, then the button named
 * `submitLabel` that sends `onSubmit`, unavailable while the box holds nothing but spaces. The box is between
 * 2.5rem and 15rem tall, and the border darkens while the person writes in it. Enter sends `onSubmit` too, and
 * Shift+Enter adds a line, as every key pressed with Shift, Control, Alt, or Meta is left to the browser, unless
 * `onShortcut` answers it. The `attributes` go onto the textarea, such as a mount its Block registers.
 *
 * Given `formatting`, a toolbar named by its `label` lies over the textarea, 6px of room above its buttons and at their
 * sides: a compact button for each of its `groups`, 24px square and 44px on touch, with a 1px rule 16px tall between
 * one group and the next. Each button is named by its `label` and says its `keys` as `aria-keyshortcuts`. It is
 * `hidden` while it is not shown, and the button before Send that is named by the same `label` shows and hides it: it
 * is a switch, `aria-pressed` while the toolbar is shown, and says that it controls the toolbar (`aria-controls`).
 * Given `mention`, the button named by its `label` with the mention icon follows it. Both come before Send, which is
 * at the far end.
 *
 * Given `onShortcut`, a key pressed with Shift, Control, Alt, or Meta asks it first: a message it answers is sent in
 * place of the browser's action for that key.
 *
 * Given `suggestions`, a list named by its `label` opens over the box, 4px above it and 16rem wide at most, a row for
 * each: for a person, their mark at 22px in their tone and their name, the active one selected; for a command, its
 * name in medium weight and, in the quieter ink after it, its `description`. A list whose rows have descriptions is as
 * wide as the box. The textarea says that it completes from the list (`aria-autocomplete`, `aria-controls`,
 * `aria-expanded`) and which row is active (`aria-activedescendant`). A key `onKeyDown` answers sends that answer in
 * place of what the key does otherwise, Enter included, and keeps the browser's own action for it, a line added or the
 * focus moved on, from happening. A click on a row sends its `onPick` and returns the focus to the textarea. Without
 * `suggestions`, no list is drawn and the textarea has no more attributes.
 */
export const composer = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    placeholder: string
    value: string
    onInput: (value: string) => Message
    onSubmit: Message
    submitLabel: string
    formatting?: Formatting<Message> | undefined
    mention?: MentionButton<Message> | undefined
    onShortcut?: ((key: string, modifiers: KeyboardModifiers) => Option.Option<Message>) | undefined
    suggestions?: Suggestions<Message> | undefined
    attributes?: ReadonlyArray<TextareaAttribute<Message, Requirements> | ChildAttribute> | undefined
  }>
) => {
  const labelId = `${config.id}-label`
  const { formatting, mention, suggestions } = config
  const sendOnEnter = (key: string) => (key === "Enter" ? Option.some(config.onSubmit) : Option.none())
  const answerKey =
    suggestions === undefined
      ? sendOnEnter
      : (key: string) => Option.orElse(suggestions.onKeyDown(key), () => sendOnEnter(key))

  return h.form(
    [h.AriaLabelledBy(labelId), h.OnSubmit(config.onSubmit), h.Class(composerBox)],
    [
      formatting === undefined ? h.empty : formattingView(h, formatting),
      Textarea.view(
        {
          id: config.id,
          value: config.value,
          rows: 1,
          placeholder: config.placeholder,
          onInput: config.onInput,
          toView: (attributes) =>
            h.div(
              [],
              [
                h.label([...attributes.label, h.Id(labelId), h.Class(composerLabel)], [config.label]),
                h.textarea([
                  ...attributes.textarea,
                  ...(suggestions === undefined ? [] : suggestionAttributes(h, suggestions)),
                  answerKeys(h, answerKey, config.onShortcut),
                  ...(config.attributes ?? []),
                  h.Class(composerText)
                ])
              ]
            )
        },
        h
      ),
      suggestions === undefined ? h.empty : suggestionListView(h, config.id, suggestions),
      h.div(
        [h.Class(composerActions)],
        [
          ...(formatting === undefined
            ? []
            : [
                iconButton(
                  h,
                  { icon: "type", label: formatting.label, onClick: formatting.onToggle },
                  { isPressed: formatting.isShown, controls: formatting.id }
                )
              ]),
          ...(mention === undefined
            ? []
            : [iconButton(h, { icon: "mark-mention", label: mention.label, onClick: mention.onClick })]),
          h.div(
            [h.Class(composerSend)],
            [
              iconSubmit(
                h,
                { icon: "mark-send", label: config.submitLabel },
                { isDisabled: config.value.trim() === "" }
              )
            ]
          )
        ]
      )
    ]
  )
}
