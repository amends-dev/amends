/**
 * What a conversation is made of: the list of messages, each by its author with its time and, under the first
 * message of a thread, the task it tracks, the button that opens it with who replied to it and who is at work there,
 * the notifications that tell of them, the line that tells what happened to the thing the conversation is about, the
 * quiet line that tells who took part or stopped, an agent's turn where it took on the work and the log that follows
 * it, the text that describes it, and the rule that sets a part of the list apart, such as a day or the replies.
 */

import * as Button from "@foldkit/ui/button"
import type { Attribute, Html, HtmlBuilder } from "foldkit/html"
import { iconButtonWith } from "./control.ts"
import { type TurnState, turnActivity } from "./details.ts"
import { type IconName, icon } from "./icon.ts"
import { type MarkContent, mark, type TaskStatusShape, taskStatus } from "./mark.ts"
import { type Markdown, richText, richTextWords } from "./richText.ts"
import { tooltip } from "./tooltip.ts"

const listColumn = "m-0 flex list-none flex-col p-0"

const rowLook =
  "relative -mx-3 flex gap-3 px-3 py-2.5 aria-[current=true]:bg-selected aria-[current=true]:[--amends-status-knockout:var(--amends-selected)] aria-[current=true]:indicator-bar"

const messageLook = `group/message ${rowLook}`

const stackedLook = "-mt-1 pt-0"

const rowColumn = "relative flex min-w-0 flex-1 flex-col gap-0.5"

const authorLine = "flex min-w-0 items-baseline gap-2"

const authorName = "min-w-0 truncate text-item font-medium"

const hiddenLabel = "sr-only"

const gutterTime =
  "invisible w-8 flex-none self-start text-end text-meta leading-5.75 whitespace-nowrap text-ink-muted group-hover/message:visible group-focus-within/message:visible"

const timeLine = "flex-none text-meta text-ink-muted"

const placeLine = "m-0 text-meta text-ink-muted"

const actionsRow = "-my-1.5 ms-auto flex flex-none items-center gap-1 self-center"

const hoverActionsLook =
  "absolute -top-4.5 end-0 z-10 flex items-center gap-0.5 border border-outline bg-popover p-0.5 opacity-0 shadow-popover pointer-events-none group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-has-focus-visible/message:pointer-events-auto group-has-focus-visible/message:opacity-100"

type Ink = "text-ink" | "text-ink-secondary"

const textLook = (ink: Ink) => `m-0 text-body wrap-break-word ${ink}`

const deletedLook = "text-ink-muted italic"

const editedLook = "text-meta text-ink-muted"

const textButton = (ink: Ink) =>
  `cursor-pointer self-start bg-transparent p-0 text-start text-body wrap-break-word ${ink} focus-ring hover:underline`

const metaColumn = "mt-0.5 flex flex-col items-start gap-1"

const headline = "min-w-0 truncate text-item text-ink"

const headlineAuthor = "font-medium"

const ageLook = "ms-auto flex flex-none items-center gap-1.5 self-center text-meta text-ink-muted"

const unreadDot = "size-1.5 flex-none rounded-full bg-ink"

const unreadLabel = "sr-only"

const taskChipLook =
  "mt-3 inline-flex min-h-8 max-w-full cursor-pointer items-center gap-2 self-start border border-outline bg-panel px-2.5 text-hint text-ink-secondary focus-ring hover:border-outline-strong max-desktop:min-h-11"

const taskChipTitle = "min-w-0 truncate"

const repliesLook =
  "group/replies relative inline-flex h-9 max-w-full cursor-pointer items-center gap-3 self-start border-0 bg-transparent p-0 pt-2 focus-ring max-tablet:h-11 max-tablet:pt-0"

const repliesElbow =
  "pointer-events-none absolute start-[-1.75rem] top-0 h-[1.4375rem] w-[1.125rem] overflow-visible text-stitch"

const repliersLook = "inline-flex items-center gap-1.5"

const overlappingMarks = "inline-flex items-center [&>*+*]:-ms-1.25"

const moreMarks = "text-meta text-ink-muted"

const repliesCount =
  "inline-flex h-6.5 flex-none items-center bg-subtle px-2 text-control whitespace-nowrap font-medium text-ink-secondary group-hover/replies:text-ink max-tablet:bg-transparent max-tablet:text-item max-tablet:leading-5"

const unreadMark = "me-1.75 inline-block size-1.75 flex-none rounded-full bg-indicator"

const typingNote = "min-w-0 truncate text-meta whitespace-nowrap text-ink-muted"

const replyInThreadLook =
  "inline-flex min-h-6 max-w-full cursor-pointer items-center gap-2.5 self-start border-0 bg-transparent p-0 text-ink-muted focus-ring hover:text-ink [@media(hover:hover)]:not-data-noted:hidden"

const replyInThreadLabel = "text-control font-medium [@media(hover:hover)]:hidden"

/** How many marks the replies button shows before it counts the rest. */
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

/**
 * The messages of a conversation as an ordered list named by `label`, in one column. Given an `id`, a Command can find
 * the list to keep the pane that scrolls around it at its end.
 */
export const messageList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; id?: string; children: ReadonlyArray<Html> }>
): Html =>
  h.ol(
    [...(config.id === undefined ? [] : [h.Id(config.id)]), h.AriaLabel(config.label), h.Class(listColumn)],
    config.children
  )

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
 * What a hovered or focused message offers: an icon button named `label`, which a tooltip says, that sends `onClick`,
 * and is described by `description`, such as the words of the thread it opens. With `isExpanded` it says whether what
 * it opens is open.
 */
export type HoverAction<Message> = Readonly<{
  icon: IconName
  label: string
  onClick: Message
  description?: string | undefined
  isExpanded?: boolean | undefined
}>

const renderHoverActions = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  actions: ReadonlyArray<HoverAction<Message>>
): Html =>
  actions.length === 0
    ? h.empty
    : h.div(
        [h.Role("group"), h.AriaLabel("Message actions"), h.Class(hoverActionsLook)],
        actions.map((action) =>
          tooltip(h, {
            title: action.label,
            children: [
              Button.view(
                {
                  onClick: action.onClick,
                  toView: (attributes) =>
                    iconButtonWith(
                      h,
                      [
                        ...attributes.button,
                        ...(action.description === undefined ? [] : [h.AriaDescription(action.description)]),
                        ...(action.isExpanded === undefined ? [] : [h.AriaExpanded(action.isExpanded)])
                      ],
                      { icon: action.icon, label: action.label },
                      { size: "compact" }
                    )
                },
                h
              )
            ]
          })
        )
      )

/** What every message shows, whether it stands on its own or stacks under its author's message before it. */
type MessageContent<Message, Requirements> = Readonly<{
  key: string
  mark: string
  author: string
  isAgent?: boolean
  time?: string | undefined
  note?: string | undefined
  text: MessageText
  isEdited?: boolean
  body?: Html | undefined
  meta?: ReadonlyArray<Html>
  hoverActions?: ReadonlyArray<HoverAction<Message>>
  isCurrent?: boolean
  attributes?: ReadonlyArray<Attribute<Message, Requirements>>
}>

/**
 * A message either stands on its own, with `actions` at the end of its author line, or stacks under the message of
 * the same author before it and shows `shortTime` in the place of the mark, which it has none of.
 */
export type MessageConfig<Message, Requirements> = MessageContent<Message, Requirements> &
  (
    | Readonly<{ actions?: ReadonlyArray<Html>; isStacked?: false; shortTime?: never }>
    | Readonly<{ isStacked: true; shortTime?: string; actions?: never }>
  )

/**
 * One message, a row of a `messageList` keyed by `key`: the author's `mark` letters on the ground of a person's tone,
 * or an agent's when `isAgent`, then the `author`, in the agent's color for an agent, with the `time` after it and a
 * `note` after that, such as "Sending…", and the `text`, words as written, markdown as `richText` shows it, with its
 * mentions as chips, or the words that say it was deleted, with " (edited)" quiet after it while `isEdited`. Under the
 * text, `meta` is a column of what belongs to the message, such as the `taskChip` of the task it tracks and the
 * `repliesButton` that opens its thread. At the end of the author line, `actions` are quiet buttons, such as Edit and
 * Delete; and `hoverActions` float at the column's top end, over the row above, while the pointer is on the message
 * or the keyboard is in it, such as the button that opens its thread. `body` takes the text's place, for the form that
 * changes it. The current row is filled with the 2px bar and `aria-current="true"`, and a row reaches 12px into the
 * pane's gutter so its fill reaches past the text. `attributes` go onto the row, such as the mount that brings the
 * current message into view.
 *
 * A message that `isStacked` follows its author's message just before, as `apps/ui`'s timeline stacks them: it has
 * no mark and no author line, its text sits 6px under the text above it instead of 20px, and its `shortTime` shows in
 * the mark's place while the pointer is on it or the keyboard is in it. Assistive technology still hears the author
 * and the time.
 */
export const message = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MessageConfig<Message, Requirements>
): Html => {
  const actions = config.actions ?? []
  const meta = config.meta ?? []
  const isStacked = config.isStacked === true
  const byline = [
    h.span([h.Class(`${authorName} ${config.isAgent === true ? "text-agent" : "text-ink"}`)], [config.author]),
    renderTime(h, config)
  ]

  return h.keyed("li")(
    config.key,
    [
      ...(config.isCurrent === true ? [h.AriaCurrent("true")] : []),
      ...(config.attributes ?? []),
      h.Class(isStacked ? `${messageLook} ${stackedLook}` : messageLook)
    ],
    [
      isStacked
        ? h.span([h.AriaHidden(true), h.Class(gutterTime)], [config.shortTime ?? ""])
        : mark(h, { text: config.mark, size: "md", tone: config.isAgent === true ? "lilac" : "slate" }),
      h.div(
        [h.Class(rowColumn)],
        [
          isStacked
            ? h.div([h.Class(hiddenLabel)], byline)
            : h.div(
                [h.Class(authorLine)],
                [...byline, actions.length === 0 ? h.empty : h.div([h.Class(actionsRow)], actions)]
              ),
          config.body ?? renderText(h, { ...config, ink: "text-ink", isInline: false }),
          meta.length === 0 ? h.empty : h.div([h.Class(metaColumn)], meta),
          renderHoverActions(h, config.hoverActions ?? [])
        ]
      )
    ]
  )
}

/**
 * An agent at work in a thread: how its turn stands, which its mark moves as, and `label`, what it says in words,
 * such as "Yumi working".
 */
export type ThreadWork = Readonly<{ state: TurnState; label: string }>

/** What the buttons that open a thread say besides their own words: who types in it, and which agents are at work. */
type ThreadNotes = Readonly<{
  typing?: string | undefined
  working?: ReadonlyArray<ThreadWork>
}>

const renderThreadNotes = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  notes: ThreadNotes
): ReadonlyArray<Html> => [
  ...(notes.working ?? []).map(({ state, label }) => turnActivity(h, { state, label })),
  notes.typing === undefined ? h.empty : h.span([h.Class(typingNote)], [notes.typing])
]

const hasThreadNotes = (notes: ThreadNotes): boolean => notes.typing !== undefined || (notes.working ?? []).length > 0

const renderRepliers = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  marks: ReadonlyArray<MarkContent>
): Html => {
  const rest = marks.length - shownMarks

  return marks.length === 0
    ? h.empty
    : h.span(
        [h.AriaHidden(true), h.Class(repliersLook)],
        [
          h.span(
            [h.Class(overlappingMarks)],
            marks
              .slice(0, shownMarks)
              .map((content) => mark(h, { ...content, tone: content.tone ?? "slate", size: "choice" }))
          ),
          rest > 0 ? h.span([h.Class(moreMarks)], [`+${rest}`]) : h.empty
        ]
      )
}

const renderElbow = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox("0 0 18 23"),
      h.Fill("none"),
      h.AriaHidden(true),
      h.Class(repliesElbow)
    ],
    [
      h.path([
        h.D("M1 1 V18 Q1 22 5 22 H18"),
        h.Stroke("currentColor"),
        h.StrokeWidth("0.3"),
        h.StrokeDasharray("7 4"),
        h.StrokeLinecap("round")
      ])
    ]
  )

/**
 * What the first message of a thread shows under its text, for the message's `meta`, when the thread has replies: one
 * button that sends `onClick` to open the thread, as `apps/ui`'s replies button does. A stitched elbow hangs from the
 * row's mark to it, then the `marks` of those who replied, small and overlapping by 5px, up to three and then "+N" for
 * the rest, each on a person's tone unless it has its own, then the `label` on a tile, such as "4 replies", with a dot
 * before it while the replies are unread, then what is going on there: the agents at `working`, such as "Yumi
 * working", and who is `typing`, such as "Yumi is typing…". The button is named by the label, and by "unread" after
 * it, and described by `description`, such as the words of the thread. The elbow and the marks are hidden from
 * assistive technology. With `isExpanded` it says whether the thread is open.
 */
export const repliesButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: ThreadNotes &
    Readonly<{
      marks: ReadonlyArray<MarkContent>
      label: string
      isUnread?: boolean
      onClick: Message
      description?: string | undefined
      isExpanded?: boolean | undefined
    }>
): Html => {
  const isUnread = config.isUnread === true

  return Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(isUnread ? `${config.label}, unread` : config.label),
            ...(config.description === undefined ? [] : [h.AriaDescription(config.description)]),
            ...(config.isExpanded === undefined ? [] : [h.AriaExpanded(config.isExpanded)]),
            h.Class(repliesLook)
          ],
          [
            renderElbow(h),
            renderRepliers(h, config.marks),
            h.span(
              [h.Class(repliesCount)],
              [isUnread ? h.span([h.AriaHidden(true), h.Class(unreadMark)]) : h.empty, config.label]
            ),
            ...renderThreadNotes(h, config)
          ]
        )
    },
    h
  )
}

/**
 * What the first message of a thread without replies offers under its text, for the message's `meta`: a button named
 * "Reply in thread" that sends `onClick` to open the thread, and is described by `description`. Where there is no
 * pointer to hover, it always shows, as the words "Reply in thread"; where there is, the message's `hoverActions` offer
 * the reply, and the button shows only while there is something to say beside it: the agents at `working` and who is
 * `typing`, as `repliesButton` says them, and then without its words. With `isExpanded` it says whether the thread is
 * open.
 */
export const replyInThreadButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: ThreadNotes &
    Readonly<{ onClick: Message; description?: string | undefined; isExpanded?: boolean | undefined }>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel("Reply in thread"),
            ...(config.description === undefined ? [] : [h.AriaDescription(config.description)]),
            ...(config.isExpanded === undefined ? [] : [h.AriaExpanded(config.isExpanded)]),
            ...(hasThreadNotes(config) ? [h.DataAttribute("noted", "")] : []),
            h.Class(replyInThreadLook)
          ],
          [h.span([h.Class(replyInThreadLabel)], ["Reply in thread"]), ...renderThreadNotes(h, config)]
        )
    },
    h
  )

/**
 * The task a thread tracks, for the message's `meta`: a button that sends `onClick` to open it, bordered on the panel,
 * with where the task stands drawn as `shape`, 0.9375rem, before its `title`, which is cut short where there is no
 * room, as `apps/ui`'s task reference draws it. It is named by the title and the `status` in words, since the drawing
 * is hidden from assistive technology.
 */
export const taskChip = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ shape: TaskStatusShape; status: string; title: string; onClick: Message }>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.AriaLabel(`${config.title}, ${config.status}`), h.Class(taskChipLook)],
          [taskStatus(h, config.shape, { size: "0.9375rem" }), h.span([h.Class(taskChipTitle)], [config.title])]
        )
    },
    h
  )

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
 * the pane's gutter, as a message's row does. `attributes` go onto it, as they go onto a message's row.
 */
export const description = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    text: MessageText
    body?: Html | undefined
    actions?: ReadonlyArray<Html>
    isCurrent?: boolean
    attributes?: ReadonlyArray<Attribute<Message, Requirements>>
  }>
): Html => {
  const actions = config.actions ?? []

  return h.div(
    [
      ...(config.isCurrent === true ? [h.AriaCurrent("true")] : []),
      ...(config.attributes ?? []),
      h.Class(descriptionLook)
    ],
    [
      config.body ?? h.div([h.Class(descriptionText)], [renderWords(h, config.text, false)]),
      actions.length === 0 ? h.empty : h.div([h.Class(descriptionActions)], actions)
    ]
  )
}
