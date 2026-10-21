/**
 * What floats over a window: a refusal, a message about something that went wrong with the one thing to do about
 * it, pinned to the bottom end corner until the person dismisses it; and a confirmation of what the person did,
 * centered at the bottom with a check, which takes at most one action and goes by itself.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { button } from "./control.ts"
import { icon } from "./icon.ts"

const stackColumn = "fixed end-4 bottom-4 z-30 flex w-100 max-w-[calc(100%-2rem)] flex-col gap-2"

const toastCard = "flex items-start gap-3 border border-outline bg-raised py-3 ps-4 pe-2 shadow-toast"

const toastBody = "flex min-w-0 flex-1 flex-col gap-1 pt-1"

const toastText = "m-0 text-body break-words text-ink"

const toastDetail = "m-0 line-clamp-3 text-hint break-words text-ink-secondary"

const confirmationRegion =
  "pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-center gap-2 px-4"

const confirmationCard =
  "pointer-events-auto flex min-h-11 max-w-[min(28rem,100%)] items-center gap-2.5 border border-outline bg-popover px-3.5 py-2 text-control font-medium text-ink shadow-toast"

const confirmationCheck = "flex flex-none"

const confirmationText = "min-w-0 break-words"

const confirmationAction =
  "-my-1 ms-4 cursor-pointer bg-transparent px-1.5 py-1 text-control font-medium whitespace-nowrap text-ink focus-ring hover:bg-subtle"

/**
 * The column of refusals pinned to the bottom end corner of the window, 25rem wide at most, above the panes and
 * the scrim. It is fixed, so it stays in that corner wherever it renders, and the shell renders it inside an
 * open dialog, since the rest of the window is inert. It is a polite live region, so it is there before the
 * first toast and each one is announced as it arrives. `children` are `toast`s, or a `notice`.
 */
export const toastStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.AriaLive("polite"), h.Class(stackColumn)], children)

/**
 * A raised card, an alert, for what went wrong, with its `text`, the `detail` quieter under it when there is one,
 * and at the right the quiet `action` button that sends its `onClick`, such as Dismiss, since the person has to
 * read it and a refusal does not go by itself.
 */
export const toast = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    text: string
    detail?: string
    action: Readonly<{ label: string; onClick: Message }>
  }>
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

/**
 * The list of confirmations centered at the bottom of the window, 24px above its edge and above any home indicator
 * (`env(safe-area-inset-bottom)`), over the panes and the scrim, as `apps/ui`'s toast region is: an `ol` named
 * "Notifications" that is a polite live region, so it is there before the first confirmation and each one is
 * announced as it arrives, newest at the bottom, 8px apart. It is fixed, so it stays there wherever it renders, and
 * the shell renders it inside an open dialog, since the rest of the window is inert. The list lets a click through
 * to the window except where a confirmation is. `children` are `confirmation`s.
 */
export const confirmationStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.ol([h.AriaLive("polite"), h.AriaLabel("Notifications"), h.Class(confirmationRegion)], children)

/**
 * A short confirmation of what the person did, a status and not an alert, an item of the `confirmationStack` that
 * the `key` keeps from one render to the next: a check before its `text`, in a card at most 28rem wide, and, when
 * the person has something to do next, one `action` after it, such as Open, which sends its `onClick`. The app takes
 * the confirmation away when the action is taken and by itself after a few seconds, so it has no Dismiss. A
 * refusal is a `toast`.
 */
export const confirmation = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ key: string; text: string; action?: Readonly<{ label: string; onClick: Message }> }>
): Html => {
  const { action } = config

  return h.keyed("li")(
    config.key,
    [h.Role("status"), h.Class(confirmationCard)],
    [
      h.span([h.Class(confirmationCheck)], [icon(h, "check", { size: "sm" })]),
      h.span([h.Class(confirmationText)], [config.text]),
      action === undefined
        ? h.empty
        : Button.view(
            {
              onClick: action.onClick,
              toView: (attributes) => h.button([...attributes.button, h.Class(confirmationAction)], [action.label])
            },
            h
          )
    ]
  )
}
