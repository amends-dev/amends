/**
 * What floats over the shell's corner: a message about something that went wrong, with the one thing
 * to do about it, until the person does it.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { button } from "./control.ts"

const stackColumn = "fixed end-4 bottom-4 z-30 flex w-100 max-w-[calc(100%-2rem)] flex-col gap-2"

const toastCard = "flex items-start gap-3 border border-outline bg-raised py-3 ps-4 pe-2 shadow-toast"

const toastBody = "flex min-w-0 flex-1 flex-col gap-1 pt-1"

const toastText = "m-0 text-body break-words text-ink"

const toastDetail = "m-0 line-clamp-3 text-hint break-words text-ink-secondary"

/**
 * The column of toasts pinned to the bottom end corner of the window, 25rem wide at most, above the panes and
 * the scrim. It is fixed, so it stays in that corner wherever it renders, and the shell renders it inside an
 * open dialog, since the rest of the window is inert. It is a polite live region, so it is there before the
 * first toast and each one is announced as it arrives. `children` are `toast`s, or a `notice`.
 */
export const toastStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.AriaLive("polite"), h.Class(stackColumn)], children)

/**
 * A raised card with its `text`, the `detail` quieter under it when there is one, and at the right the
 * quiet `action` button that sends its `onClick`, such as Dismiss. The card is an alert.
 */
export const toast = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ text: string; detail?: string; action: Readonly<{ label: string; onClick: Message }> }>
): Html =>
  h.div(
    [h.Role("alert"), h.Class(toastCard)],
    [
      h.div(
        [h.Class(toastBody)],
        [
          h.p([h.Class(toastText)], [config.text]),
          config.detail === undefined ? h.empty : h.p([h.Class(toastDetail)], [config.detail])
        ]
      ),
      button(h, config.action.label, config.action.onClick, { variant: "quiet" })
    ]
  )
