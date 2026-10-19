/**
 * What a conversation is made of: the list of messages, each by its author with its time and, under the first
 * message of a thread, who replied to it, the notifications that tell of them, and the rule that sets a part of
 * the list apart, such as a day or the replies.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { mark } from "./mark.ts"

const listColumn = "m-0 flex list-none flex-col p-0"

const rowLook = "relative -mx-3 flex gap-3 px-3 py-2.5"

const currentRowLook = `${rowLook} aria-[current=true]:bg-selected aria-[current=true]:indicator-bar`

const rowColumn = "flex min-w-0 flex-1 flex-col gap-0.5"

const authorLine = "flex min-w-0 items-baseline gap-2"

const authorName = "min-w-0 truncate text-item font-medium text-ink"

const timeLine = "flex-none text-meta text-ink-muted"

const contextLine = "m-0 text-meta text-ink-muted"

const actionsRow = "-my-1.5 ms-auto flex flex-none items-center gap-1 self-center"

type Ink = "text-ink" | "text-ink-secondary"

const mentionChip = "bg-mention px-1 font-medium"

const textLook = (ink: Ink) => `m-0 text-body wrap-break-word ${ink}`

const textButton = (ink: Ink) =>
  `cursor-pointer self-start bg-transparent p-0 text-start text-body wrap-break-word ${ink} focus-ring hover:underline`

const metaRow = "mt-1 flex flex-wrap items-center gap-3 text-hint text-ink-muted"

const headline = "min-w-0 truncate text-item text-ink"

const headlineAuthor = "font-medium"

const trailingRow = "-my-1.5 ms-auto flex flex-none items-center gap-3 self-center"

const ageLook = "flex flex-none items-center gap-1.5 text-meta text-ink-muted"

const unreadDot = "size-1.5 flex-none rounded-full bg-ink"

const unreadLabel = "sr-only"

const replyLineLook = "relative flex items-center gap-3"

const treeStub = "absolute -start-7 bottom-2.5 size-3 border-s border-b border-outline"

const markStack = "flex items-center"

const stackedMark = "-ms-1 flex flex-none ring-1 ring-outline first:ms-0 first:z-30 nth-2:z-20 nth-3:z-10"

const moreMarks = "ms-1.5 text-meta text-ink-muted"

const replyLabel = "text-meta text-ink-muted"

/** How many marks a reply line shows before it counts the rest. */
const shownMarks = 3

const dividerLine = "flex items-center gap-3 py-2.5 text-meta text-ink-muted uppercase"

const dividerLabel = "flex-none whitespace-nowrap"

const dividerRule = "h-0 min-w-4 flex-1 border-t border-dashed border-stitch"

export type DividerOptions = Readonly<{
  /** `center` (the default) puts the label between two rules, `start` before one that runs on. */
  align?: "center" | "start"
}>

/** The messages of a conversation as an ordered list named by `label`, in one column. */
export const messageList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; children: ReadonlyArray<Html> }>
): Html => h.ol([h.AriaLabel(config.label), h.Class(listColumn)], config.children)

const renderRule = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  h.div([h.AriaHidden(true), h.Class(dividerRule)])

const renderTime = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ time?: string | undefined; note?: string | undefined }>
): Html =>
  config.time === undefined && config.note === undefined
    ? h.empty
    : h.span(
        [h.Class(timeLine)],
        [
          config.time === undefined ? h.empty : h.span([], [config.time]),
          config.note === undefined ? h.empty : h.span([], [` · ${config.note}`])
        ]
      )

/** One run of a message's text: words as written, or, with `isMention`, a mention, which shows as a chip. */
export type TextRun = Readonly<{ text: string; isMention?: boolean }>

/** The words of a text as one line, a mention in them as the words it is: what a reader hears. */
const wordsOf = (text: string | ReadonlyArray<TextRun>): string =>
  typeof text === "string" ? text : text.map((run) => run.text).join("")

const renderRuns = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  text: string | ReadonlyArray<TextRun>
): ReadonlyArray<Html | string> =>
  typeof text === "string"
    ? [text]
    : text.map((run) => (run.isMention === true ? h.span([h.Class(mentionChip)], [run.text]) : run.text))

/** The text, a button when `onOpen` is given, which is named `name` and described by the text when it has one. */
const renderText = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ text: string | ReadonlyArray<TextRun>; ink: Ink; onOpen?: Message; name?: string }>
): Html => {
  const { onOpen, name } = config

  return onOpen === undefined
    ? h.p([h.Class(textLook(config.ink))], renderRuns(h, config.text))
    : Button.view(
        {
          onClick: onOpen,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                ...(name === undefined ? [] : [h.AriaLabel(name), h.AriaDescription(wordsOf(config.text))]),
                h.Class(textButton(config.ink))
              ],
              renderRuns(h, config.text)
            )
        },
        h
      )
}

/**
 * One message, a row of a `messageList` keyed by `key`: the author's `mark` letters, then the `author`
 * with the `time` after it and a `note` after that, such as "edited" or "Sending…", and the `text`, a
 * string or `TextRun`s, in which a mention is a chip. Under the author line, a `context` is a quieter line
 * saying where the message comes from, such as the thread and the group of a notification. Under the
 * text, `meta` is a row of quiet facts, such as how much is new, and at the end of the author line,
 * `actions` are quiet buttons, such as Edit and Delete. `onOpen` makes the text a button named by it that
 * sends `onOpen`, for a message that is the start of a thread; `body` takes the text's place, for the
 * form that changes it. The current row is filled with the 2px bar and `aria-current="true"`, and a row
 * reaches 12px into the pane's gutter so its fill reaches past the text.
 */
export const message = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    key: string
    mark: string
    author: string
    time?: string | undefined
    note?: string | undefined
    context?: string | undefined
    text: string | ReadonlyArray<TextRun>
    onOpen?: Message
    body?: Html | undefined
    actions?: ReadonlyArray<Html>
    meta?: ReadonlyArray<Html>
    isCurrent?: boolean
  }>
): Html => {
  const actions = config.actions ?? []
  const meta = config.meta ?? []

  return h.keyed("li")(
    config.key,
    [...(config.isCurrent === true ? [h.AriaCurrent("true")] : []), h.Class(currentRowLook)],
    [
      mark(h, { text: config.mark, size: "md" }),
      h.div(
        [h.Class(rowColumn)],
        [
          h.div(
            [h.Class(authorLine)],
            [
              h.span([h.Class(authorName)], [config.author]),
              renderTime(h, config),
              actions.length === 0 ? h.empty : h.div([h.Class(actionsRow)], actions)
            ]
          ),
          config.context === undefined ? h.empty : h.p([h.Class(contextLine)], [config.context]),
          config.body ?? renderText(h, { ...config, ink: "text-ink" }),
          meta.length === 0 ? h.empty : h.div([h.Class(metaRow)], meta)
        ]
      )
    ]
  )
}

/**
 * What the first message of a thread shows under its text, for the message's `meta`: a short tree line that
 * hangs from the row's mark, then the `marks` of those who replied, the letters of each, small and overlapping by
 * 4px, up to three and then "+N" for the rest, then the `label`, such as "4 replies". The line and the marks are
 * hidden from assistive technology, since the label is what the line says.
 */
export const replyLine = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ marks: ReadonlyArray<string>; label: string }>
): Html => {
  const rest = config.marks.length - shownMarks

  return h.div(
    [h.Class(replyLineLook)],
    [
      h.span([h.AriaHidden(true), h.Class(treeStub)]),
      h.span(
        [h.Class(markStack)],
        [
          ...config.marks
            .slice(0, shownMarks)
            .map((text) => h.span([h.Class(stackedMark)], [mark(h, { text, size: "xs" })])),
          rest > 0 ? h.span([h.AriaHidden(true), h.Class(moreMarks)], [`+${rest}`]) : h.empty
        ]
      ),
      h.span([h.Class(replyLabel)], [config.label])
    ]
  )
}

const renderAge = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ age: string; isUnread: boolean }>
): Html =>
  h.span(
    [h.Class(ageLook)],
    [
      config.isUnread ? h.span([h.AriaHidden(true), h.Class(unreadDot)]) : h.empty,
      config.isUnread ? h.span([h.Class(unreadLabel)], ["Unread"]) : h.empty,
      h.span([], [config.age])
    ]
  )

/**
 * One notification, a row of a `messageList` beside `message`, keyed by `key` and set like it: the `mark` letters,
 * then a first line of the `author` in medium weight followed by the `activity` in the same size and `ink`, such
 * as "Sara" and "mentioned you", under it the `place` it comes from, at `meta` size in `ink-muted`, and the
 * `text`, a string or `TextRun`s, in which a mention is a chip. At the end of the first line are the `actions`,
 * quiet buttons such as Mark seen, and then the `age`, already formatted, such as "2m ago". While `isUnread`, a
 * 6px dot of `ink` comes before the age, hidden from assistive technology, which an `sr-only` "Unread" before the
 * age replaces; a row that is not unread has its text in `ink-secondary`, quieter than the first line. `onOpen`
 * makes the text a button that sends it, named by the author and the activity together, "Sara mentioned you",
 * with the text's words as its description, by an `aria-label` and an `aria-description`, since the first line
 * is where the row says what it is.
 */
export const notification = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    key: string
    mark: string
    author: string
    activity: string
    place?: string | undefined
    text: string | ReadonlyArray<TextRun>
    age: string
    isUnread?: boolean
    onOpen?: Message
    actions?: ReadonlyArray<Html>
  }>
): Html => {
  const isUnread = config.isUnread === true

  return h.keyed("li")(
    config.key,
    [h.Class(rowLook)],
    [
      mark(h, { text: config.mark, size: "md" }),
      h.div(
        [h.Class(rowColumn)],
        [
          h.div(
            [h.Class(authorLine)],
            [
              h.span([h.Class(headline)], [h.span([h.Class(headlineAuthor)], [config.author]), ` ${config.activity}`]),
              h.div([h.Class(trailingRow)], [...(config.actions ?? []), renderAge(h, { age: config.age, isUnread })])
            ]
          ),
          config.place === undefined ? h.empty : h.p([h.Class(contextLine)], [config.place]),
          renderText(h, {
            ...config,
            ink: isUnread ? "text-ink" : "text-ink-secondary",
            name: `${config.author} ${config.activity}`
          })
        ]
      )
    ]
  )
}

/**
 * A dashed rule with `label` in uppercase, an item of a `messageList`, to set apart what follows, such as
 * a day or the replies to a message. The label is between two rules, or, with `align: "start"`, before
 * the one rule that runs on.
 */
export const divider = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  label: string,
  options: DividerOptions = {}
): Html => {
  const text = h.span([h.Class(dividerLabel)], [label])

  return h.li(
    [h.Class(dividerLine)],
    options.align === "start" ? [text, renderRule(h)] : [renderRule(h), text, renderRule(h)]
  )
}
