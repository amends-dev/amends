/**
 * The words over a mark whose meaning has no room beside it, such as how an agent stands: a title, and why under it,
 * on a popover next to what the pointer rests on.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const triggerLook = "group/tooltip tooltip-anchor relative inline-flex flex-none"

const contentLook =
  "pointer-events-none invisible z-50 flex w-max max-w-70 flex-col gap-0.5 border border-outline bg-popover px-3 py-2 text-start text-hint font-normal whitespace-normal normal-case shadow-popover transition-[visibility] duration-0 group-hover/tooltip:visible group-hover/tooltip:delay-300 group-has-focus-visible/tooltip:visible"

const contentPlacements = { above: "tooltip-above", below: "tooltip-below" }

const titleLook = "font-medium"

const titleTones = {
  none: "text-ink",
  success: "text-success-text",
  caution: "text-caution-text",
  danger: "text-danger-text"
}

const detailLook = "text-ink-secondary"

export type TooltipTone = Exclude<keyof typeof titleTones, "none">

export type TooltipPlacement = keyof typeof contentPlacements

/**
 * A `title`, such as "Needs setup", with `detail` under it, in a sentence, on a bordered popover 280px wide at most,
 * 6px above the `children` while the pointer has rested on them for 300ms, or while a control inside them has keyboard
 * focus, and gone at once when it leaves. A `tone` colors the title as a status: `success`, `caution`, or `danger`.
 * `placement` is `above` unless given; `below` is for children that have no room above them, such as the mark in a
 * pane's header at the top of the window. Where the browser lays out by anchor the popover is fixed to the window, so
 * a list that scrolls around the children does not cut it off.
 *
 * The trigger is a span, so it can sit inside a link. The popover is hidden from assistive technology, since hover
 * reaches no one who is not using a pointer, so the words must also be said another way, such as the row's name or the
 * label of the control inside.
 */
export const tooltip = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    title: string
    detail?: string | undefined
    tone?: TooltipTone | undefined
    placement?: TooltipPlacement | undefined
    children: ReadonlyArray<Html>
  }>
): Html =>
  h.span(
    [h.Class(triggerLook)],
    [
      ...config.children,
      h.span(
        [h.AriaHidden(true), h.Class(`${contentLook} ${contentPlacements[config.placement ?? "above"]}`)],
        [
          h.span([h.Class(`${titleLook} ${titleTones[config.tone ?? "none"]}`)], [config.title]),
          config.detail === undefined ? h.empty : h.span([h.Class(detailLook)], [config.detail])
        ]
      )
    ]
  )
