/**
 * The shell that frames a workspace: the rail on the canvas, then one card holding the sidebar, the
 * main pane, and, while a thread or details are open, the side pane.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const shellFrame = "relative flex h-[var(--amends-screen-height,100dvh)] gap-2 overflow-x-auto bg-canvas py-2 pe-2"

const shellCard = "relative flex min-h-0 min-w-160 flex-1 bg-panel"

const shellDivider = "w-px flex-none self-stretch bg-divider"

const asideColumn =
  "flex w-110 flex-none flex-col border-s border-divider bg-panel max-split:absolute max-split:inset-y-0 max-split:end-0 max-split:z-20 max-split:w-[min(27.5rem,100%)] max-split:border-s-0 max-split:shadow-popover"

const asideScrim = "absolute inset-0 z-10 hidden bg-scrim max-split:block"

/**
 * The rail, then a card of the `sidebar`, the `main` pane, and, when given, the `aside`. Each is what its
 * module renders. From 80rem the aside sits beside the main pane at 440px; from 64rem to there it floats
 * over the right of the card with a shadow, above a scrim over the rest. The frame is as tall as the
 * viewport (`100dvh`, or `--amends-screen-height` where an ancestor sets it, as the workshop does).
 * Below 64rem the shell keeps the rail and sidebar in place and the row overflows, scrolling sideways.
 */
export const shell = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ rail: Html; sidebar: Html; main: Html; aside?: Html }>
): Html =>
  h.div(
    [h.Class(shellFrame)],
    [
      config.rail,
      h.div(
        [h.Class(shellCard)],
        [
          config.sidebar,
          h.div([h.AriaHidden(true), h.Class(shellDivider)]),
          config.main,
          config.aside === undefined ? h.empty : h.div([h.Class(asideColumn)], [config.aside])
        ]
      ),
      config.aside === undefined ? h.empty : h.div([h.AriaHidden(true), h.Class(asideScrim)])
    ]
  )
