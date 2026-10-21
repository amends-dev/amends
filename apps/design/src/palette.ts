/**
 * The palette: a search that jumps anywhere in a workspace, as `@amends-dev/ui`'s Jump to is. It is a modal near the
 * top of the window, without a title, that holds a field you type in and a button that closes it, the places that match
 * what is typed under the title of the section each belongs to, and a row of the keys it is used by. Typing narrows
 * the places, the arrow keys walk them, and Enter opens the one reached: that is for its Block to answer, with
 * `answerKeys` among the `attributes` it gives the field.
 *
 * A Block that opens a palette binds `DialogBlock` as a child, as for a `modal` (see its module), and embeds the
 * dialog's view with `toView: (render) => palette(h, render, config)`. The dialog takes the focus to the field as it
 * opens.
 */

import * as Input from "@foldkit/ui/input"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type ControlAttributes, iconButtonWith } from "./control.ts"
import { type IconName, icon } from "./icon.ts"
import { type MarkTone, mark } from "./mark.ts"
import { type ModalRender, modalFrame } from "./modal.ts"

const fieldRow =
  "flex flex-none items-center gap-3 py-3 ps-5 pe-3 shadow-[inset_0_-1px_0_var(--amends-divider)] max-tablet:ps-4"

const fieldMagnifier = "flex flex-none text-ink-muted"

const fieldInput =
  "m-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-title text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden max-tablet:text-title-touch"

const resultsLook = "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"

const sectionTitle = "m-0 px-3 pt-3 pb-1.5 text-meta font-medium text-ink-muted uppercase"

const itemLook =
  "flex min-h-9 cursor-pointer items-center gap-2.5 px-3 text-item text-ink hover:bg-hover aria-selected:bg-selected max-desktop:min-h-11"

const itemIcon = "flex flex-none text-ink-secondary"

const itemLabel = "min-w-0 truncate"

const itemDetail = "ms-auto flex-none text-control text-ink-muted"

const emptyLook = "m-0 px-3 py-6 text-control text-ink-secondary"

const hintsRow =
  "m-0 flex flex-none gap-5 px-5 py-2.5 text-meta text-ink-muted shadow-[inset_0_1px_0_var(--amends-divider)] max-desktop:hidden"

const keyLook = "me-1 inline-block min-w-4 border border-outline px-1 text-center font-[inherit]"

const hiddenLabel = "sr-only"

/** What stands before an item's label: a drawing, for a page or a group, or a person's or an agent's mark. */
export type PaletteLeading =
  | Readonly<{ icon: IconName; text?: never }>
  | Readonly<{ text: string; tone?: MarkTone; icon?: never }>

/** A place the person can go: what it is called, a quiet note after that, and what to send when it is picked. */
export type PaletteItem<Message> = Readonly<{
  /** The element's id, which the field names as its active descendant while the item is the one reached. */
  id: string
  label: string
  /** A quiet note after the label, such as "Direct message". */
  detail?: string | undefined
  leading: PaletteLeading
  /** Whether it is the item the arrow keys have reached, which Enter opens. */
  isActive: boolean
  onClick: Message
}>

/** The items of one kind, in a group named by `title`. */
export type PaletteSection<Message> = Readonly<{ title: string; items: ReadonlyArray<PaletteItem<Message>> }>

export type PaletteConfig<Message, Requirements> = Readonly<{
  /** Names the dialog and the field, and is not shown, since the field says what it is for. */
  label: string
  /** The prefix of the ids of the field and the list, so that the field can name the list it controls. */
  id: string
  /** What the field says while it is empty, such as "Jump to a group, person, or page…". */
  placeholder: string
  query: string
  onInput: (query: string) => Message
  /** What assistive technology calls the button that closes the palette, "Close" unless given. */
  closeLabel?: string
  /** Go onto the field: the dialog's `initialFocus`, the keys the Block answers, and the item it names as active. */
  attributes: ControlAttributes<Message, Requirements>
  sections: ReadonlyArray<PaletteSection<Message>>
  /** What the list says in place of its sections when there are none, such as that nothing matches what is typed. */
  emptyText: string
}>

const renderLeading = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, leading: PaletteLeading): Html =>
  leading.icon === undefined
    ? mark(h, { text: leading.text, tone: leading.tone ?? "neutral", size: "choice" })
    : h.span([h.Class(itemIcon)], [icon(h, leading.icon, { size: "sm" })])

const renderItem = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, item: PaletteItem<Message>): Html =>
  h.div(
    [h.Id(item.id), h.Role("option"), h.AriaSelected(item.isActive), h.OnClick(item.onClick), h.Class(itemLook)],
    [
      renderLeading(h, item.leading),
      h.span([h.Class(itemLabel)], [item.label]),
      item.detail === undefined ? h.empty : h.span([h.Class(itemDetail)], [item.detail])
    ]
  )

const renderSection = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  id: string,
  section: PaletteSection<Message>
): Html =>
  h.div(
    [h.Role("group"), h.AriaLabelledBy(id)],
    [h.p([h.Id(id), h.Class(sectionTitle)], [section.title]), ...section.items.map((item) => renderItem(h, item))]
  )

const renderKey = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, key: string): Html =>
  h.kbd([h.Class(keyLook)], [key])

const renderHints = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  h.p(
    [h.AriaHidden(true), h.Class(hintsRow)],
    [
      h.span([], [renderKey(h, "↑"), renderKey(h, "↓"), " to move"]),
      h.span([], [renderKey(h, "↵"), " to open"]),
      h.span([], [renderKey(h, "esc"), " to close"])
    ]
  )

/**
 * The dialog `render` describes, as the palette of `config`: a panel 40rem wide and 30rem tall, 12vh from the top of
 * the window, so that it keeps its place as what matches narrows, and the whole window on a phone. In it, the field,
 * with a magnifier before it and the Close button after it, and under it the list of places, a group for each section
 * with its title in capitals over its items, each a line of its mark or drawing, its label, and its note at the end,
 * the one reached filled; where there are no sections it says `emptyText`. Under the list, the keys to use it by, to
 * move, to open, and to close, where there is a keyboard to press them: not below 64rem.
 */
export const palette = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  config: PaletteConfig<Message, Requirements>
): Html => {
  const listId = `${config.id}-results`

  return modalFrame(h, render, {
    size: "palette",
    children: [
      h.h2([...render.title, h.Class(hiddenLabel)], [config.label]),
      Input.view(
        {
          id: config.id,
          type: "text",
          value: config.query,
          onInput: config.onInput,
          isDisabled: false,
          isInvalid: false,
          hasDescription: false,
          isAutofocus: false,
          toView: (attributes) =>
            h.div(
              [h.Class(fieldRow)],
              [
                h.span([h.Class(fieldMagnifier)], [icon(h, "mark-search", { size: "md" })]),
                h.label([...attributes.label, h.Class(hiddenLabel)], [config.label]),
                h.input([
                  ...attributes.input,
                  h.Role("combobox"),
                  h.AriaAutocomplete("list"),
                  h.AriaExpanded(true),
                  h.AriaControls(listId),
                  h.Autocomplete("off"),
                  h.Spellcheck(false),
                  h.Placeholder(config.placeholder),
                  ...config.attributes,
                  h.Class(fieldInput)
                ]),
                iconButtonWith(
                  h,
                  render.closeButton,
                  { icon: "mark-close", label: config.closeLabel ?? "Close" },
                  { size: "compact" }
                )
              ]
            )
        },
        h
      ),
      h.div(
        [h.Class(resultsLook)],
        [
          h.div(
            [h.Id(listId), h.Role("listbox"), h.AriaLabel("Places")],
            config.sections.length === 0
              ? [h.p([h.Role("status"), h.Class(emptyLook)], [config.emptyText])]
              : config.sections.map((section, index) => renderSection(h, `${config.id}-section-${index}`, section))
          )
        ]
      ),
      renderHints(h)
    ]
  })
}
