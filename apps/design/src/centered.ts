/**
 * The sixth layout pattern, for screens outside a workspace, such as signing in and picking a
 * workspace: the canvas frames one card with a header and a single column.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const screenFrame =
  "flex h-[var(--amends-screen-height,100dvh)] bg-canvas p-2 max-tablet:bg-panel max-tablet:p-0 max-tablet:pt-[env(safe-area-inset-top)]"

const screenCard = "flex min-w-0 flex-1 flex-col overflow-y-auto bg-panel"

const screenHeader = "flex min-h-20 flex-none items-center justify-between gap-4 p-4"

const screenBrand = "inline-flex items-center gap-1 text-title font-semibold text-ink"

const screenActions = "flex items-center gap-3"

const screenBodyBase = "mx-auto flex w-full flex-1 flex-col px-6 max-tablet:px-4"

const screenBodyWidths = {
  form: "max-w-117 justify-center pt-6 pb-20",
  directory: "max-w-212 pt-20 pb-16 max-tablet:pt-6"
}

const headingText = "text-display font-medium text-ink"

const copyText = "mt-3 text-item text-ink-secondary"

export type CenteredWidth = keyof typeof screenBodyWidths

/**
 * A standalone screen: the `brand` on the left of the header and the `actions` on its right, over the
 * `children`. A `form` is a 420px column in the middle of the card; a `directory` is 800px, from near
 * the top. The card fills the viewport's height (`100dvh`, or `--amends-screen-height` where an
 * ancestor sets it, to show the screen at another height), with a gutter around it, and edge to edge
 * on phones.
 */
export const centered = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    brand: string
    actions?: ReadonlyArray<Html>
    width: CenteredWidth
    children: ReadonlyArray<Html>
  }>
): Html =>
  h.div(
    [h.Class(screenFrame)],
    [
      h.div(
        [h.Class(screenCard)],
        [
          h.header(
            [h.Class(screenHeader)],
            [h.span([h.Class(screenBrand)], [config.brand]), h.div([h.Class(screenActions)], config.actions ?? [])]
          ),
          h.main([h.Class(`${screenBodyBase} ${screenBodyWidths[config.width]}`)], config.children)
        ]
      )
    ]
  )

/** The screen's title. */
export const heading = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.h1([h.Class(headingText)], [text])

/** A line of secondary text under the screen's title. */
export const copy = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(copyText)], [text])
