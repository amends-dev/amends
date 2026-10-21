/**
 * What an agent's turn log in the side pane is made of, as `apps/ui`'s `TurnLogPane` draws it: the column that holds
 * it, the summary of what the turn runs on, the activity as a list of entries with the responses recorded among them,
 * the cards for what waits and what to fix, why a stop or retry did not go through, and the footer that says how
 * following it stands.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { icon } from "./icon.ts"
import { activityMark } from "./mark.ts"
import { divider } from "./message.ts"
import { richText } from "./richText.ts"

const columnLook = "flex min-w-0 flex-col gap-5"

const summaryLook = "flex flex-col gap-2 bg-subtle px-3.5 py-3 text-control text-ink-secondary"

const codeLook = "font-mono"

const activityLook = "m-0 flex list-none flex-col gap-4.5 p-0"

const entryLook = "grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1"

const entryDot = "size-1.25 self-center rounded-full bg-ink-muted"

const entryTitle = "text-control font-medium text-ink"

const entryTime = "text-meta text-ink-secondary"

const entryText = "col-[2/-1] m-0 text-control wrap-anywhere text-ink-secondary"

const cardLook = "flex flex-col gap-2.5 border px-3.5 py-3"

const cardTones = {
  plain: "border-outline bg-panel",
  caution: "border-caution-border bg-caution-surface"
}

const cardHead = "flex items-center justify-between gap-3"

const cardTitle = "flex items-center gap-1.5 text-control font-medium text-ink"

const cardLabel = "text-meta text-ink-secondary"

const cardText = "text-body text-ink"

const cardNote = {
  plain: "m-0 text-hint text-ink-secondary",
  caution: "m-0 text-hint text-ink"
}

const problemLook = "m-0 text-control text-caution-text"

const footerLook = "flex min-h-9 items-center gap-3 text-control text-ink-secondary"

const footerMark = "flex size-3.5 flex-none [&>svg]:size-full"

/** The column that holds a turn log's summary, activity, and cards, 20px apart. */
export const turnLogColumn = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(columnLook)], children)

/** One line of the summary: its words, and whether they are an identifier, such as a model's, which show in mono. */
export type SummaryLine = Readonly<{ text: string; isCode?: boolean }>

/**
 * What a turn runs on, as a box on `subtle` of a line each, 8px apart, at `control` size in `ink-secondary`: where it
 * works, the model it ran on, its harness, and its sandbox, or why it has none yet.
 */
export const turnLogSummary = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  lines: ReadonlyArray<SummaryLine>
): Html =>
  h.div(
    [h.Class(summaryLook)],
    lines.map((line) => h.span(line.isCode === true ? [h.Class(codeLook)] : [], [line.text]))
  )

/**
 * The activity of a turn, an ordered list named by `label` that begins with a `divider` of the same words, as the
 * `children` follow it, oldest first, 18px apart: `turnLogEntry`s and `turnLogResponse`s. Given an `id`, a Command can
 * find it, to keep the pane that scrolls it at its end.
 */
export const turnLogActivity = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ id?: string; label: string; children: ReadonlyArray<Html> }>
): Html =>
  h.ol(
    [...(config.id === undefined ? [] : [h.Id(config.id)]), h.AriaLabel(config.label), h.Class(activityLook)],
    [divider(h, config.label, { align: "start" }), ...config.children]
  )

/**
 * One thing that happened in a turn, an item of the activity: a dot, its `title` in medium weight, the `time` it
 * happened at, at the end of the line, and the `text` under the title, quiet, when there is any. `dateTime` is the
 * moment for assistive technology and `timeTitle` names it in full on hover.
 */
export const turnLogEntry = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    key: string
    title: string
    time: string
    dateTime: string
    timeTitle?: string | undefined
    text?: string | undefined
  }>
): Html =>
  h.keyed("li")(
    config.key,
    [h.Class(entryLook)],
    [
      h.span([h.AriaHidden(true), h.Class(entryDot)]),
      h.span([h.Class(entryTitle)], [config.title]),
      h.time(
        [
          h.Datetime(config.dateTime),
          ...(config.timeTitle === undefined ? [] : [h.Title(config.timeTitle)]),
          h.Class(entryTime)
        ],
        [config.time]
      ),
      config.text === undefined ? h.empty : h.p([h.Class(entryText)], [config.text])
    ]
  )

/** What a card holds, in the order it shows them. */
export type TurnLogCardConfig = Readonly<{
  title: string
  /** A mark before the title, such as the logo moving while the turn waits. */
  mark?: Html | undefined
  /** A quiet word after the title, at the end of its line, such as that a response is complete. */
  label?: string | undefined
  /** `caution` for what needs fixing. */
  tone?: "caution" | undefined
  /** Markdown, as the agent wrote it, under the title. */
  text?: string | undefined
  /** A line of what the card means, under the rest. */
  note: string
  /** What the person can do about it, under the note. */
  action?: Html | undefined
}>

/**
 * A bordered box on `panel` for what the log has to say apart from its activity: a `title`, with a `mark` before it
 * and a `label` at the end of its line, the `text` an agent wrote, a `note`, and an `action`, 10px apart. A `caution`
 * card, for what needs fixing, is on the caution colors, and its note is in `ink`, since `ink-secondary` falls short of
 * contrast there.
 */
export const turnLogCard = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: TurnLogCardConfig
): Html => {
  const tone = config.tone ?? "plain"

  return h.div(
    [h.Class(`${cardLook} ${cardTones[tone]}`)],
    [
      h.div(
        [h.Class(cardHead)],
        [
          h.span([h.Class(cardTitle)], [config.mark ?? h.empty, config.title]),
          config.label === undefined ? h.empty : h.span([h.Class(cardLabel)], [config.label])
        ]
      ),
      config.text === undefined ? h.empty : h.div([h.Class(cardText)], [richText(h, { text: config.text })]),
      h.p([h.Class(cardNote[tone])], [config.note]),
      config.action === undefined ? h.empty : h.div([], [config.action])
    ]
  )
}

/**
 * A response the agent recorded, an item of the activity: a `turnLogCard` of the response's `title`, its `label`, its
 * `text` as markdown, and the `note` of whether it was posted to the thread.
 */
export const turnLogResponse = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ key: string; title: string; label: string; text: string; note: string }>
): Html => h.keyed("li")(config.key, [], [turnLogCard(h, config)])

/**
 * Why a stop or retry did not go through, under the rest of the log, at `control` size in the caution color, as an
 * alert, so that it is announced.
 */
export const turnLogProblem = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Role("alert"), h.Class(problemLook)], [text])

/** The mark before a footer's words: the logo working while the log is followed live, or a clock while it waits. */
export type TurnLogFooterMark = "following" | "waiting"

/**
 * The line at the foot of a turn log, at least 36px tall, 12px between its pieces, at `control` size in
 * `ink-secondary`: a `mark` of how following stands, the `action` to take, and the `text`.
 */
export const turnLogFooter = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ mark?: TurnLogFooterMark; action?: Html; text?: string }>
): Html =>
  h.div(
    [h.Class(footerLook)],
    [
      config.mark === undefined
        ? h.empty
        : h.span(
            [h.AriaHidden(true), h.Class(footerMark)],
            [config.mark === "following" ? activityMark(h, "working") : icon(h, "clock", { size: "xs" })]
          ),
      config.action ?? h.empty,
      config.text === undefined ? h.empty : h.span([], [config.text])
    ]
  )
