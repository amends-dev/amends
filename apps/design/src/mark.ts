/**
 * The square that stands for a person, a workspace, or an agent: one or two letters on a neutral ground,
 * and the button that gathers a few of them to open the people they stand for.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"

const markBase = "grid flex-none place-items-center bg-avatar-neutral-bg font-medium text-avatar-neutral-fg uppercase"

const markSizes = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-meta",
  md: "size-8 text-hint"
}

const clusterLook =
  "inline-flex flex-none cursor-pointer items-center gap-0.5 border border-outline bg-transparent p-0.5 focus-ring hover:bg-hover max-desktop:min-h-11"

const clusterRest = "px-1 text-meta text-ink-secondary tabular-nums"

const hiddenLabel = "sr-only"

/** How many marks a cluster shows before it counts the rest. */
const clusterShown = 3

export type MarkSize = keyof typeof markSizes

/**
 * The `text` letters, upper-cased, in a square: `xs` 20px, `sm` (the default) 24px, or `md` 32px. A mark
 * is hidden from assistive technology, since the name it abbreviates is always beside it.
 */
export const mark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ text: string; size?: MarkSize }>
): Html => h.span([h.AriaHidden(true), h.Class(`${markBase} ${markSizes[config.size ?? "sm"]}`)], [config.text])

/**
 * A button of the first three `marks`, as `xs` marks side by side in a bordered box, and "+4" after them for
 * four more, that sends `onClick`. It is named by `label`, which says how many people it stands for, since the
 * marks and the count are hidden from assistive technology.
 */
export const markCluster = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ marks: ReadonlyArray<string>; label: string; onClick: Message }>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.Class(clusterLook)],
          [
            ...config.marks.slice(0, clusterShown).map((text) => mark(h, { text, size: "xs" })),
            config.marks.length > clusterShown
              ? h.span([h.AriaHidden(true), h.Class(clusterRest)], [`+${config.marks.length - clusterShown}`])
              : h.empty,
            h.span([h.Class(hiddenLabel)], [config.label])
          ]
        )
    },
    h
  )
