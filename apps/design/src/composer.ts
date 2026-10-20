/**
 * Where the person writes a message: a box that grows with what they type, with the button that sends it, and
 * the list of people that opens over it while they mention one.
 */

import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { ChildAttribute, HtmlBuilder, TextareaAttribute } from "foldkit/html"
import { answerKeys, iconSubmit } from "./control.ts"
import { type MarkContent, mark } from "./mark.ts"

const composerBox = "relative flex flex-col border border-outline bg-field focus-within:border-outline-strong"

const composerLabel = "sr-only"

const composerText =
  "block max-h-60 min-h-10 w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-body text-ink outline-none field-sizing-content placeholder:text-ink-muted max-tablet:text-body-touch"

const composerActions = "flex flex-none items-center justify-end px-1.5 pb-1.5"

const suggestionList =
  "absolute start-0 bottom-full z-10 mb-1 flex w-64 max-w-full flex-col border border-outline bg-raised py-1 shadow-popover"

const suggestionRow =
  "flex min-w-0 cursor-pointer items-center gap-2 px-3 py-1 text-control text-ink hover:bg-hover aria-selected:bg-selected"

const suggestionName = "min-w-0 truncate"

/** One person the list offers: its `id`, their `mark` in their tone, their `name`, and what picking them sends. */
export type MentionSuggestion<Message> = Readonly<{
  id: string
  mark: MarkContent
  name: string
  isActive: boolean
  onPick: Message
}>

/**
 * The list of people to mention, found by `id`, in the order given; `onKeyDown` says what a key pressed in the
 * box sends, or nothing to leave the key to the box.
 */
export type MentionSuggestions<Message> = Readonly<{
  id: string
  items: ReadonlyArray<MentionSuggestion<Message>>
  onKeyDown: (key: string) => Option.Option<Message>
}>

const optionId = (suggestions: MentionSuggestions<unknown>, item: MentionSuggestion<unknown>) =>
  `${suggestions.id}-${item.id}`

/** What the textarea says of the list open over it. */
const suggestionAttributes = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  suggestions: MentionSuggestions<Message>
) => {
  const active = suggestions.items.find(({ isActive }) => isActive)

  return [
    h.AriaAutocomplete("list"),
    h.AriaControls(suggestions.id),
    h.AriaExpanded(true),
    ...(active === undefined ? [] : [h.AriaActiveDescendant(optionId(suggestions, active))])
  ]
}

/** The list of people, each row sending its pick on a click and returning the focus to the textarea `textareaId`. */
const suggestionListView = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  textareaId: string,
  suggestions: MentionSuggestions<Message>
) => {
  const focusSelector = `#${CSS.escape(textareaId)}`

  return h.div(
    [h.Id(suggestions.id), h.Role("listbox"), h.AriaLabel("People to mention"), h.Class(suggestionList)],
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
        [mark(h, { ...item.mark, size: "choice" }), h.span([h.Class(suggestionName)], [item.name])]
      )
    )
  )
}

/**
 * A form named by `label`: a bordered box holding the textarea for `id`, whose label is read by assistive
 * technology and not shown, and whose `placeholder` shows while it is empty, then the button named
 * `submitLabel` that sends `onSubmit`, unavailable while the box holds nothing but spaces. The box is between
 * 2.5rem and 15rem tall, and the border darkens while the person writes in it. Enter sends `onSubmit` too, and
 * Shift+Enter adds a line, as every key pressed with Shift, Control, Alt, or Meta is left to the browser. The
 * `attributes` go onto the textarea, such as a mount its Block registers.
 *
 * Given `suggestions`, a list named "People to mention" opens over the box, 4px above it and 16rem wide at
 * most, a row for each: the person's mark at 22px in their tone, and their name, the active one selected. The
 * textarea says that it completes from the list (`aria-autocomplete`, `aria-controls`, `aria-expanded`) and
 * which row is active (`aria-activedescendant`). A key `onKeyDown` answers sends that answer in place of what the
 * key does otherwise, Enter included, and keeps the browser's own action for it, a line added or the focus moved
 * on, from happening. A click on a row sends its `onPick` and returns the focus to the textarea. Without
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
    suggestions?: MentionSuggestions<Message> | undefined
    attributes?: ReadonlyArray<TextareaAttribute<Message, Requirements> | ChildAttribute> | undefined
  }>
) => {
  const labelId = `${config.id}-label`
  const { suggestions } = config
  const sendOnEnter = (key: string) => (key === "Enter" ? Option.some(config.onSubmit) : Option.none())
  const answerKey =
    suggestions === undefined
      ? sendOnEnter
      : (key: string) => Option.orElse(suggestions.onKeyDown(key), () => sendOnEnter(key))

  return h.form(
    [h.AriaLabelledBy(labelId), h.OnSubmit(config.onSubmit), h.Class(composerBox)],
    [
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
                  answerKeys(h, answerKey),
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
        [iconSubmit(h, { icon: "mark-send", label: config.submitLabel }, { isDisabled: config.value.trim() === "" })]
      )
    ]
  )
}
