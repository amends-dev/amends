/**
 * What a pane says about one thing: its facts as labelled values, a mark of how it stands, the people
 * or agents' work it lists, and the log an agent wrote.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { mark } from "./mark.ts"

const detailGrid = "m-0 grid grid-cols-[minmax(5rem,auto)_1fr] items-baseline gap-x-4 gap-y-2"

const detailLabel = "m-0 text-hint text-ink-muted"

const detailValue = "m-0 min-w-0 text-item wrap-break-word text-ink"

const badgeBase = "inline-flex h-5 flex-none items-center border px-1.5 text-meta font-medium whitespace-nowrap"

const badgeTones = {
  neutral: "border-transparent bg-subtle text-ink-secondary",
  success: "border-success-border bg-success-surface text-success-text",
  caution: "border-caution-border bg-caution-surface text-caution-text",
  danger: "border-danger-border bg-danger-surface text-danger-text"
}

const entryColumn = "m-0 flex list-none flex-col p-0"

const entryRow = "flex items-start gap-3 py-2"

const entryButton =
  "w-full cursor-pointer bg-transparent px-3 text-start text-ink focus-ring-inset hover:bg-hover aria-[current=true]:bg-selected"

const entryBody = "flex min-w-0 flex-1 flex-col gap-2"

const entryTitleLine = "flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1"

const entryTitle = "min-w-0 text-item font-medium wrap-break-word text-ink"

const logLook =
  "m-0 max-h-60 list-none overflow-y-auto bg-subtle px-3 py-2 font-mono text-hint text-ink-secondary focus-ring"

const logLine = "whitespace-pre-wrap wrap-break-word"

export type BadgeTone = keyof typeof badgeTones

/**
 * Labelled values as a definition list in two columns, a `label` before each `value`, 8px apart. A value is
 * text or any `Html`, such as a link.
 */
export const detailList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  items: ReadonlyArray<Readonly<{ label: string; value: Html | string }>>
): Html =>
  h.dl(
    [h.Class(detailGrid)],
    items.flatMap((item) => [h.dt([h.Class(detailLabel)], [item.label]), h.dd([h.Class(detailValue)], [item.value])])
  )

/**
 * A small mark of how something stands, 20px tall: `neutral` (the default) on `subtle`, and `success`,
 * `caution`, and `danger` on their own surfaces with a border.
 */
export const badge = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; tone?: BadgeTone }>
): Html => h.span([h.Class(`${badgeBase} ${badgeTones[config.tone ?? "neutral"]}`)], [config.label])

/**
 * A list of people or agents' work, such as a thread's turns, named by `label`, a column of `entry`s with no
 * list style.
 */
export const entryList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; children: ReadonlyArray<Html> }>
): Html => h.ul([h.AriaLabel(config.label), h.Class(entryColumn)], config.children)

/** What an `entry` shows: the `mark` letters, the `title`, and the `trailing` pieces after it. */
type EntryContent = Readonly<{
  key: string
  mark?: string
  title: string
  trailing?: ReadonlyArray<Html>
}>

/**
 * An `entry` either lists what is under it, its `children`, or is one button that sends `onClick`, which holds
 * nothing a button cannot, and so has no `children`.
 */
export type EntryConfig<Message> = EntryContent &
  (
    | Readonly<{ children?: ReadonlyArray<Html>; onClick?: never; isActive?: never }>
    | Readonly<{ onClick: Message; isActive?: boolean; children?: never }>
  )

/**
 * One item of an `entryList`, keyed by `key`: the `mark` letters at the start when it has them, then the
 * `title` with the `trailing` pieces after it, such as a `badge` or a quiet word, wrapping onto a new line
 * when they do not fit, and the `children` under it, such as a failure, buttons, or a `log`, 8px apart.
 *
 * With `onClick` the whole entry is one button that sends it, with `key` as its id so that a field can name it
 * as its active descendant, filled on hover. While it `isActive` it is filled with `selected` and is
 * `aria-current="true"`, for the entry the person has reached with the arrow keys of the field above the list
 * and would open with Enter. Such an entry holds no `children`, since a button holds no buttons.
 */
export const entry = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: EntryConfig<Message>
): Html => {
  const content = [
    config.mark === undefined ? h.empty : mark(h, { text: config.mark }),
    h.div(
      [h.Class(entryBody)],
      [
        h.div([h.Class(entryTitleLine)], [h.span([h.Class(entryTitle)], [config.title]), ...(config.trailing ?? [])]),
        ...(config.children ?? [])
      ]
    )
  ]
  const { onClick } = config

  return onClick === undefined
    ? h.keyed("li")(config.key, [h.Class(entryRow)], content)
    : h.keyed("li")(
        config.key,
        [],
        [
          Button.view(
            {
              onClick,
              toView: (attributes) =>
                h.button(
                  [
                    ...attributes.button,
                    h.Id(config.key),
                    ...(config.isActive === true ? [h.AriaCurrent("true")] : []),
                    h.Class(`${entryRow} ${entryButton}`)
                  ],
                  content
                )
            },
            h
          )
        ]
      )
}

/**
 * What an agent wrote as it worked, one `items` line each, in the mono font on `subtle`, an ordered list named
 * by `label`. It is 15rem tall at most and scrolls past that, with the keyboard too.
 */
export const log = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; items: ReadonlyArray<string> }>
): Html =>
  h.ol(
    [h.AriaLabel(config.label), h.Tabindex(0), h.Class(logLook)],
    config.items.map((item) => h.li([h.Class(logLine)], [item]))
  )
