/**
 * What a pane says about one thing: its facts as labelled values, a few properties under a caption each, a mark of
 * how it stands, a person it is about, the places an agent is at work, the people or agents' work it lists, and the
 * log an agent wrote.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"
import { type LogoMotion, logo } from "./logo.ts"
import { type MarkContent, type MarkSize, activityMark, mark } from "./mark.ts"

const detailGrid = "m-0 grid grid-cols-[minmax(5rem,auto)_1fr] items-baseline gap-x-4 gap-y-2"

const detailLabel = "m-0 text-hint text-ink-muted"

const detailValue = "m-0 min-w-0 text-item wrap-break-word text-ink"

const propertyGrid = "grid grid-cols-2 gap-x-6 gap-y-1"

const propertyColumn = "flex min-w-0 flex-col"

const propertyCaption = "mb-1.25 block text-meta font-medium uppercase text-ink-secondary"

const propertyValueLook =
  "inline-flex min-h-8 items-center gap-2 ps-0.75 text-hint text-ink-secondary max-desktop:min-h-11"

const propertyIconBox = "flex size-3.75 flex-none [&>svg]:size-full"

const activityColumn = "m-0 flex list-none flex-col items-start gap-1 p-0"

const activityLine = "flex items-center gap-2.5 text-item text-ink"

const activityState = "inline-flex items-center gap-1.25 text-hint whitespace-nowrap text-ink-secondary"

const activityPlace = "font-medium"

const badgeBase = "inline-flex h-5 flex-none items-center border px-1.5 text-meta font-medium whitespace-nowrap"

const badgeTones = {
  neutral: "border-transparent bg-subtle text-ink-secondary [--amends-status-knockout:var(--amends-subtle)]",
  success:
    "border-success-border bg-success-surface text-success-text [--amends-status-knockout:var(--amends-success-surface)]",
  caution:
    "border-caution-border bg-caution-surface text-caution-text [--amends-status-knockout:var(--amends-caution-surface)]",
  danger:
    "border-danger-border bg-danger-surface text-danger-text [--amends-status-knockout:var(--amends-danger-surface)]"
}

const badgeWithLogo = "gap-1"

const personRow = "flex min-w-0 items-center gap-3"

const personText = "flex min-w-0 flex-col"

const personName = "block truncate text-item font-medium text-ink"

const personDetail = "block truncate text-hint text-ink-secondary"

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
 * The properties of one thing side by side, such as a task's status and its assignee, in two columns 24px apart and
 * 4px between rows, a group named by `label`. Each of the `children` is a `property`.
 */
export const properties = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; children: ReadonlyArray<Html> }>
): Html => h.div([h.Role("group"), h.AriaLabel(config.label), h.Class(propertyGrid)], config.children)

/**
 * One property: its `caption`, small and in capitals, over its `children`, 5px below, such as a `propertyValue` or a
 * `propertyMenu`. A control that names itself by its caption, as a menu does, says the caption to assistive
 * technology already, so the caption is hidden from it with `isCaptionHidden`.
 */
export const property = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ caption: string; isCaptionHidden?: boolean; children: ReadonlyArray<Html> }>
): Html =>
  h.div(
    [h.Class(propertyColumn)],
    [
      h.span(
        [...(config.isCaptionHidden === true ? [h.AriaHidden(true)] : []), h.Class(propertyCaption)],
        [config.caption]
      ),
      ...config.children
    ]
  )

/**
 * A drawing before a property's words, 15px, as `apps/ui` draws the people icon for an assignee that is no one, hidden
 * from assistive technology, since the words say what it does. A `propertyMenu` draws its `buttonIcon` with it.
 */
export const propertyIcon = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, name: IconName): Html =>
  h.span([h.AriaHidden(true), h.Class(propertyIconBox)], [icon(h, name, { size: "sm" })])

/**
 * The value of a property that is read and not changed, in the look of the quiet button a `propertyMenu` is, its
 * `text` after what comes `before` it, such as a status's drawing or a person's mark, 8px from it, and level with the
 * text such a button would hold.
 */
export const propertyValue = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ before?: Html; text: string }>
): Html => h.span([h.Class(propertyValueLook)], [config.before ?? h.empty, config.text])

/**
 * A small mark of how something stands, 20px tall: `neutral` (the default) on `subtle`, and `success`,
 * `caution`, and `danger` on their own surfaces with a border. With a `motion` the logo moves before the
 * label, 0.875rem, cut out of the badge's own surface, for what is under way: `thread` while it waits, `working`
 * while it runs, `tug` while it stops. The logo is hidden from assistive technology, since the label says it.
 */
export const badge = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; tone?: BadgeTone; motion?: LogoMotion }>
): Html =>
  h.span(
    [
      h.Class(
        `${badgeBase} ${badgeTones[config.tone ?? "neutral"]}${config.motion === undefined ? "" : ` ${badgeWithLogo}`}`
      )
    ],
    config.motion === undefined ? [config.label] : [logo(h, { size: "0.875rem", motion: config.motion }), config.label]
  )

/**
 * One place an agent is at work: the `key` of its turn, the `state` of the turn in words, how its logo `motion` goes,
 * and the `place`, which a turn has none of until its group is read.
 */
export type ActivityLine = Readonly<{ key: string; state: string; motion: LogoMotion; place?: string | undefined }>

/**
 * Where an agent is at work, named by `label`, a line for each of the `lines`: the logo moving as its `motion` says
 * and the `state` in quiet text, then the `place` in medium weight, 10px on, unless the line has none. The logo is
 * hidden from assistive technology, since the state says what it does.
 */
export const activityList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; lines: ReadonlyArray<ActivityLine> }>
): Html =>
  h.ul(
    [h.AriaLabel(config.label), h.Class(activityColumn)],
    config.lines.map((line) =>
      h.keyed("li")(
        line.key,
        [h.Class(activityLine)],
        [
          h.span(
            [h.Class(activityState)],
            [h.span([h.AriaHidden(true), h.Class("flex")], [activityMark(h, line.motion)]), line.state]
          ),
          line.place === undefined ? h.empty : h.span([h.Class(activityPlace)], [line.place])
        ]
      )
    )
  )

/**
 * One person or agent, alone and not in a list: their `mark`, 40px unless `markSize` says otherwise, beside their
 * `name` in medium weight, over a quieter line of what they are, the `detail`, such as who owns a workspace. The
 * mark is hidden from assistive technology; the name and the detail are read as text.
 */
export const person = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ mark: MarkContent; markSize?: MarkSize; name: string; detail?: string }>
): Html =>
  h.div(
    [h.Class(personRow)],
    [
      mark(h, { ...config.mark, size: config.markSize ?? "lg" }),
      h.div(
        [h.Class(personText)],
        [
          h.span([h.Class(personName)], [config.name]),
          config.detail === undefined ? h.empty : h.span([h.Class(personDetail)], [config.detail])
        ]
      )
    ]
  )

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
