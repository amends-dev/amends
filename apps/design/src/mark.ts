/**
 * The square that stands for a person, a workspace, or an agent: one or two letters on a neutral ground.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const markBase = "grid flex-none place-items-center bg-avatar-neutral-bg font-medium text-avatar-neutral-fg uppercase"

const markSizes = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-meta",
  md: "size-8 text-hint"
}

export type MarkSize = keyof typeof markSizes

/**
 * The `text` letters, upper-cased, in a square: `xs` 20px, `sm` (the default) 24px, or `md` 32px. A mark
 * is hidden from assistive technology, since the name it abbreviates is always beside it.
 */
export const mark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ text: string; size?: MarkSize }>
): Html => h.span([h.AriaHidden(true), h.Class(`${markBase} ${markSizes[config.size ?? "sm"]}`)], [config.text])
