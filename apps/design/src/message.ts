/**
 * What a conversation is made of: the list of messages, each by its author with its time and, under the first
 * message of a thread, who replied to it, the notifications that tell of them, the line that tells what happened
 * to the thing the conversation is about, the quiet line that tells who took part or stopped, an agent's turn where
 * it took on the work and the log that follows it, the text that describes it, and the rule that sets a part of the
 * list apart, such as a day or the replies.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { icon } from "./icon.ts"
import { type MarkContent, mark } from "./mark.ts"
import { type Markdown, richText, richTextWords } from "./richText.ts"

const listColumn = "m-0 flex list-none flex-col p-0"

const rowLook =
  "relative -mx-3 flex gap-3 px-3 py-2.5 aria-[current=true]:bg-selected aria-[current=true]:indicator-bar"

const rowColumn = "flex min-w-0 flex-1 flex-col gap-0.5"

const authorLine = "flex min-w-0 items-baseline gap-2"

const authorName = "min-w-0 truncate text-item font-medium text-ink"

const timeLine = "flex-none text-meta text-ink-muted"

const placeLine = "m-0 text-meta text-ink-muted"

const actionsRow = "-my-1.5 ms-auto flex flex-none items-center gap-1 self-center"

type Ink = "text-ink" | "text-ink-secondary"

const textLook = (ink: Ink) => `m-0 text-body wrap-break-word ${ink}`

const deletedLook = "text-ink-muted italic"

const editedLook = "text-meta text-ink-muted"

const textButton = (ink: Ink) =>
  `cursor-pointer self-start bg-transparent p-0 text-start text-body wrap-break-word ${ink} focus-ring hover:underline`

const metaRow = "mt-1 flex flex-wrap items-center gap-3 text-hint text-ink-muted"

const headline = "min-w-0 truncate text-item text-ink"

const headlineAuthor = "font-medium"

const ageLook = "ms-auto flex flex-none items-center gap-1.5 self-center text-meta text-ink-muted"

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

const descriptionLook =
  "relative -mx-3 flex flex-col px-3 aria-[current=true]:bg-selected aria-[current=true]:indicator-bar"

const descriptionText = "m-0 mt-2.75 text-item wrap-break-word text-ink"

const descriptionActions = "mt-2 -ms-2.5 flex flex-wrap items-center gap-1"

const eventLook = "m-0 flex items-center gap-2.5 text-control text-ink-secondary"

const eventIcon = "flex size-3.5 flex-none [&>svg]:size-full"

const noteLook = `${eventLook} py-2.5`

const noteTime = "text-meta text-ink-muted"

const turnFrame = "@container py-2.5"

const turnGrid =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 @max-[22.5rem]:grid-cols-[1.5rem_minmax(0,1fr)]"

const turnWho = "flex min-w-0 items-center gap-2"

const turnName = "min-w-0 truncate text-item font-medium text-agent"

const turnActions = "flex items-center justify-end gap-1 @max-[22.5rem]:col-start-2 @max-[22.5rem]:justify-start"

const turnDetail = "col-[2/-1] m-0 text-control text-ink-secondary"

const turnProblem = "col-[2/-1] m-0 text-control text-caution-text"

const turnUnder = "col-[2/-1] flex min-w-0 flex-col gap-2"

const turnLogItem = "ps-11 pb-2.5"

const turnLogLook = "flex min-w-0 flex-col gap-2"

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

/**
 * What a row says: words as written, the markdown of a message's text, which `richText` shows, or `{ deleted }`, the
 * words that say the message was deleted, which show quiet and slanted.
 */
export type MessageText = string | Markdown | Readonly<{ deleted: string }>

/** The words of `text` as a reader hears them, a mention as "@" and the member's name, which describe a button. */
export const messageTextWords = (text: MessageText): string => {
  if (typeof text === "string") {
    return text
  }

  return "deleted" in text ? text.deleted : richTextWords(text)
}

/**
 * The elements that show `text`: words as written, or its markdown, as the blocks of `richText`, or, when `isInline`,
 * as its preview, which a button may hold, or the words that say it was deleted.
 */
const renderWords = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  text: MessageText,
  isInline: boolean
): Html | string => {
  if (typeof text === "string") {
    return text
  }

  return "deleted" in text ? h.span([h.Class(deletedLook)], [text.deleted]) : richText(h, { ...text, isInline })
}

/** What follows the text of a message that was changed after it was sent, in its own words. */
const renderEdited = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, isEdited: boolean): Html =>
  isEdited ? h.span([h.Class(editedLook)], [" (edited)"]) : h.empty

/**
 * The text, with " (edited)" after it when `isEdited`, a button when `onOpen` is given, which is named `name` and
 * described by the text when it has one. A button holds the preview of markdown, since it may hold no block, link, or
 * other button.
 */
const renderText = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    text: MessageText
    ink: Ink
    isInline: boolean
    isEdited?: boolean
    onOpen?: Message
    name?: string
  }>
): Html => {
  const { onOpen, name } = config
  const isEdited = config.isEdited === true

  return onOpen === undefined
    ? h.div([h.Class(textLook(config.ink))], [renderWords(h, config.text, config.isInline), renderEdited(h, isEdited)])
    : Button.view(
        {
          onClick: onOpen,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                ...(name === undefined ? [] : [h.AriaLabel(name), h.AriaDescription(messageTextWords(config.text))]),
                h.Class(textButton(config.ink))
              ],
              [renderWords(h, config.text, true), renderEdited(h, isEdited)]
            )
        },
        h
      )
}

/**
 * One message, a row of a `messageList` keyed by `key`: the author's `mark` letters, then the `author`
 * with the `time` after it and a `note` after that, such as "Sending…", and the `text`, words as written, markdown
 * as `richText` shows it, with its mentions as chips, or the words that say it was deleted, with " (edited)" quiet
 * after it while `isEdited`. Under the text, `meta` is a row of quiet facts, such as how
 * much is new, and at the end of the author line, `actions` are quiet buttons, such as Edit and Delete.
 * `onOpen` makes the text a button named by it that sends `onOpen`, for a message that is the start of a
 * thread, and a button holds markdown as its preview, one run of words and mentions; `body` takes the text's place,
 * for the form that changes it. The current row is filled with the 2px bar and `aria-current="true"`, and a row
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
    text: MessageText
    isEdited?: boolean
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
    [...(config.isCurrent === true ? [h.AriaCurrent("true")] : []), h.Class(rowLook)],
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
          config.body ?? renderText(h, { ...config, ink: "text-ink", isInline: false }),
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
 * One notification, a row of a `messageList` beside `message`, keyed by `key` and set like it: the `mark`, the
 * author's letters on the ground of their tone, or an icon for a notification that has no author to show, then a
 * first line of the `author` in medium weight followed by the `activity` in the same size and `ink`, such
 * as "Sara" and "mentioned you", under it the `place` it comes from, at `meta` size in `ink-muted`, and the
 * `text`, words as written or markdown as the preview `richText` gives, one run of words and mentions in which a
 * mention is a chip. At the end of the first line is the `age`, already
 * formatted, such as "2m ago". While `isUnread`, a 6px dot of `ink` comes before the age, hidden from assistive
 * technology, which an `sr-only` "Unread" before the age replaces; a row that is not unread has its text in
 * `ink-secondary`, quieter than the first line. `onOpen` makes the text a button that sends it, named by the author
 * and the activity together, "Sara mentioned you", with the text's words as its description, by an `aria-label` and
 * an `aria-description`, since the first line is where the row says what it is. The current row, the notification
 * whose thread is open, is filled with the 2px bar and `aria-current="true"`, as a message's is.
 */
export const notification = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    key: string
    mark: MarkContent
    author: string
    activity: string
    place?: string | undefined
    text: MessageText
    age: string
    isUnread?: boolean
    onOpen?: Message
    isCurrent?: boolean
  }>
): Html => {
  const isUnread = config.isUnread === true

  return h.keyed("li")(
    config.key,
    [...(config.isCurrent === true ? [h.AriaCurrent("true")] : []), h.Class(rowLook)],
    [
      mark(h, { ...config.mark, size: "md" }),
      h.div(
        [h.Class(rowColumn)],
        [
          h.div(
            [h.Class(authorLine)],
            [
              h.span([h.Class(headline)], [h.span([h.Class(headlineAuthor)], [config.author]), ` ${config.activity}`]),
              renderAge(h, { age: config.age, isUnread })
            ]
          ),
          config.place === undefined ? h.empty : h.p([h.Class(placeLine)], [config.place]),
          renderText(h, {
            ...config,
            ink: isUnread ? "text-ink" : "text-ink-secondary",
            isInline: true,
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

/**
 * A line of what happened to the thing the conversation is about, such as "Alex created this task · 10:06 AM", an
 * item of a `messageList` between its messages, quiet, after the drawing of something new, 0.875rem and hidden from
 * assistive technology.
 */
export const event = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ key: string; text: string }>
): Html =>
  h.keyed("li")(
    config.key,
    [h.Class(eventLook)],
    [h.span([h.AriaHidden(true), h.Class(eventIcon)], [icon(h, "mark-new", { size: "xs" })]), config.text]
  )

/**
 * A quiet line of who took part in the conversation or stopped, such as "Sara followed this thread", an item of a
 * `messageList` between its messages, as `apps/ui`'s timeline draws its notes: `control` size in `ink-secondary` with
 * the `time`, already formatted, such as "10:02 AM", after it, 10px from it, at `meta` size in `ink-muted`. The time is
 * a `time` element, given the moment it was as `dateTime` and a longer `title` for a tooltip, when it has them. A note
 * has no drawing, which separates it from an `event`.
 */
export const note = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ key: string; text: string; time: string; dateTime?: string; title?: string }>
): Html =>
  h.keyed("li")(
    config.key,
    [h.Class(noteLook)],
    [
      config.text,
      h.time(
        [
          ...(config.dateTime === undefined ? [] : [h.Datetime(config.dateTime)]),
          ...(config.title === undefined ? [] : [h.Title(config.title)]),
          h.Class(noteTime)
        ],
        [config.time]
      )
    ]
  )

/**
 * An agent's turn where it took on the work, an item of a `messageList` among its messages and notes, as `apps/ui`'s
 * `TurnRow` draws it, named `label` for assistive technology, such as "Atlas's turn": the agent's `mark` at 24px in the
 * agent's tone, its `name` at item size in medium weight in the agent's color, the `status` after the name, a
 * `turnStatus`, and the `actions` at the end, buttons 4px apart, such as View log, Stop, and Retry. Where the row is
 * narrower than 22.5rem the actions drop to a line of their own under the name. Under the first line, 4px down and in
 * line with the name, the `detail` says how the turn ended, such as "No reply posted.", at `control` size in
 * `ink-secondary`; the `problem` says why a stop or retry did not go through, in the caution color, as an alert; and
 * the `children` follow, 8px apart, such as the turn's log.
 */
export const turnRow = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    key: string
    label: string
    mark: string
    name: string
    status: Html
    actions: ReadonlyArray<Html>
    detail?: string | undefined
    problem?: string | undefined
    children?: ReadonlyArray<Html>
  }>
): Html => {
  const children = config.children ?? []

  return h.keyed("li")(
    config.key,
    [h.Class(turnFrame)],
    [
      h.div(
        [h.Role("group"), h.AriaLabel(config.label), h.Class(turnGrid)],
        [
          mark(h, { text: config.mark, tone: "lilac" }),
          h.span([h.Class(turnWho)], [h.span([h.Class(turnName)], [config.name]), config.status]),
          config.actions.length === 0 ? h.empty : h.div([h.Class(turnActions)], config.actions),
          config.detail === undefined ? h.empty : h.p([h.Class(turnDetail)], [config.detail]),
          config.problem === undefined ? h.empty : h.p([h.Role("alert"), h.Class(turnProblem)], [config.problem]),
          children.length === 0 ? h.empty : h.div([h.Class(turnUnder)], children)
        ]
      )
    ]
  )
}

/**
 * The log of the turn that posted the message above it, an item of a `messageList` right under that message, a group
 * named `label` in line with the message's text, 44px from the list's edge, its `children` 8px apart, such as the `log`
 * and where following it stands.
 */
export const turnLog = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ key: string; label: string; children: ReadonlyArray<Html> }>
): Html =>
  h.keyed("li")(
    config.key,
    [h.Class(turnLogItem)],
    [h.div([h.Role("group"), h.AriaLabel(config.label), h.Class(turnLogLook)], config.children)]
  )

/**
 * The text that describes the thing a pane is about, such as a task, in the size of an item and in `ink`, words as
 * written or markdown as `richText` shows it, with its mentions as chips, 11px under the caption above it. `body` takes
 * the text's place, for the form that changes it, and `actions` are quiet buttons under it, such as Edit and Delete,
 * level with its words. While `isCurrent` it is filled with the 2px bar and `aria-current="true"`, reaching 12px into
 * the pane's gutter, as a message's row does.
 */
export const description = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    text: MessageText
    body?: Html | undefined
    actions?: ReadonlyArray<Html>
    isCurrent?: boolean
  }>
): Html => {
  const actions = config.actions ?? []

  return h.div(
    [...(config.isCurrent === true ? [h.AriaCurrent("true")] : []), h.Class(descriptionLook)],
    [
      config.body ?? h.div([h.Class(descriptionText)], [renderWords(h, config.text, false)]),
      actions.length === 0 ? h.empty : h.div([h.Class(descriptionActions)], actions)
    ]
  )
}
