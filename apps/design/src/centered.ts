/**
 * The sixth layout pattern, for screens outside a workspace, such as signing in and picking a
 * workspace: the canvas frames one card with a header and a single column.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { logo } from "./logo.ts"
import { mark } from "./mark.ts"

const screenFrame =
  "flex h-[var(--amends-screen-height,100dvh)] bg-canvas p-2 max-tablet:bg-panel max-tablet:p-0 max-tablet:pt-[env(safe-area-inset-top)]"

const screenCard = "flex min-w-0 flex-1 flex-col overflow-y-auto bg-panel"

const screenHeader = "flex min-h-20 flex-none items-center justify-between gap-4 p-4"

const screenBrand = "inline-flex items-center gap-1 text-title font-semibold text-ink"

const screenBrandMark = "grid size-10 place-items-center"

const screenActions = "flex items-center gap-3"

const accountLine = "flex min-w-0 items-center gap-3 text-hint leading-5 text-ink-secondary"

const accountIdentity = "min-w-0 truncate max-tablet:hidden"

const screenBodyBase = "mx-auto flex w-full flex-1 flex-col px-6 max-tablet:px-4"

const screenBodyWidths = {
  form: "max-w-117 justify-center pt-6 pb-20",
  directory: "max-w-212 pt-20 pb-16 max-tablet:pt-6"
}

const headingFace = "text-display font-medium text-ink"

const headingText = `mb-3 ${headingFace}`

const headingLine = "mb-3 flex items-center gap-4"

const headingBesideAction = `min-w-0 flex-1 ${headingFace}`

const copyText = "text-item text-ink-secondary"

const contentLook = "contents"

export type CenteredWidth = keyof typeof screenBodyWidths

/**
 * A standalone screen: the brand on the left of the header, the logo and the word amends, and the `actions` on
 * its right, such as the signed-in `centeredAccount` and a Sign out button, over the `children`. A `form` is a
 * 420px column in the middle of the card; a `directory` is 800px, from near the top. The card fills the
 * viewport's height (`100dvh`, or `--amends-screen-height` where an ancestor sets it, to show the screen at
 * another height), with a gutter around it, and edge to edge on phones.
 */
export const centered = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
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
            [
              h.span([h.Class(screenBrand)], [h.span([h.Class(screenBrandMark)], [logo(h)]), "amends"]),
              h.div([h.Class(screenActions)], config.actions ?? [])
            ]
          ),
          h.main([h.Class(`${screenBodyBase} ${screenBodyWidths[config.width]}`)], config.children)
        ]
      )
    ]
  )

/**
 * Who is signed in, for the header's `actions`: the first letter of their `identity`, such as the address they
 * signed in with, in a 24px mark, then the identity in quiet text, which gives way to the mark below 48rem. The
 * mark is hidden from assistive technology, since the identity is beside it.
 */
export const centeredAccount = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, identity: string): Html =>
  h.span(
    [h.Class(accountLine)],
    [
      mark(h, { text: Array.from(identity.trim()).at(0) ?? "", size: "sm" }),
      h.span([h.Class(accountIdentity)], [identity])
    ]
  )

export type HeadingOptions = Readonly<{
  /** A control at the end of the title's line, such as a button that creates what the screen lists. */
  action?: Html
}>

/**
 * The screen's title, with the space below it that what follows needs. An `action` shares the title's line, at its
 * end, 16px from the title and in line with the middle of it; the space below is that of the line.
 */
export const heading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  text: string,
  options: HeadingOptions = {}
): Html =>
  options.action === undefined
    ? h.h1([h.Class(headingText)], [text])
    : h.div([h.Class(headingLine)], [h.h1([h.Class(headingBesideAction)], [text]), options.action])

/** A line of secondary text under the screen's title. */
export const copy = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(copyText)], [text])

/**
 * The pieces of a screen's body as one node, for a view that must return one: they lie in the card's column as
 * if the node were not there, each spacing itself as `heading` and `copy` do, so a `column`'s gap would add to
 * theirs.
 */
export const screenContent = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(contentLook)], children)
