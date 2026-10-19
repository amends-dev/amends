/**
 * What a conversation is made of: the list of messages, each by its author with its time, and the
 * rule that sets a part of the list apart, such as a day or the replies.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { mark } from "./mark.ts"

const listColumn = "m-0 flex list-none flex-col p-0"

const rowLook =
  "relative -mx-3 flex gap-3 px-3 py-2.5 aria-[current=true]:bg-selected aria-[current=true]:indicator-bar"

const rowColumn = "flex min-w-0 flex-1 flex-col gap-0.5"

const authorLine = "flex min-w-0 items-baseline gap-2"

const authorName = "min-w-0 truncate text-item font-medium text-ink"

const timeLine = "flex-none text-meta text-ink-muted"

const contextLine = "m-0 text-meta text-ink-muted"

const actionsRow = "-my-1.5 ms-auto flex flex-none items-center gap-1 self-center"

const textLook = "m-0 text-body wrap-break-word text-ink"

const textButton =
  "cursor-pointer self-start bg-transparent p-0 text-start text-body wrap-break-word text-ink focus-ring hover:underline"

const metaRow = "mt-1 flex flex-wrap items-center gap-3 text-hint text-ink-muted"

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

const renderText = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ text: string; onOpen?: Message }>
): Html => {
  const { onOpen } = config

  return onOpen === undefined
    ? h.p([h.Class(textLook)], [config.text])
    : Button.view(
        {
          onClick: onOpen,
          toView: (attributes) => h.button([...attributes.button, h.Class(textButton)], [config.text])
        },
        h
      )
}

/**
 * One message, a row of a `messageList` keyed by `key`: the author's `mark` letters, then the `author`
 * with the `time` after it and a `note` after that, such as "edited" or "Sending…", and the `text`. Under
 * the author line, a `context` is a quieter line saying where the message comes from, such as the thread
 * and the group of a notification. Under the text, `meta` is a row of quiet facts, such as how much is
 * new, and at the end of the author line, `actions` are quiet buttons, such as Edit and Delete. `onOpen`
 * makes the text a button named by it that sends `onOpen`, for a message that is the start of a thread;
 * `body` takes the text's place, for the form that changes it. The current row is filled with the 2px bar
 * and `aria-current="true"`, and a row reaches 12px into the pane's gutter so its fill reaches past the
 * text.
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
    text: string
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
          config.context === undefined ? h.empty : h.p([h.Class(contextLine)], [config.context]),
          config.body ?? renderText(h, config),
          meta.length === 0 ? h.empty : h.div([h.Class(metaRow)], meta)
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
