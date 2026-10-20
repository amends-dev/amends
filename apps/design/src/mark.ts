/**
 * The square that stands for a person, a workspace, or an agent: one or two letters on a ground of its tone,
 * the patch over its corner that says how it stands, the logo's mark that says it is at work, and the button
 * that gathers a few marks to open the people they stand for.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { icon } from "./icon.ts"

const markBase = "relative grid flex-none place-items-center font-medium uppercase"

const markTones = {
  neutral: "bg-avatar-neutral-bg text-avatar-neutral-fg",
  lilac: "bg-avatar-lilac-bg text-avatar-lilac-fg"
}

const markSizes = {
  xs: "size-5 text-[0.5625rem]",
  sm: "size-6 text-meta",
  md: "size-8 text-hint",
  lg: "size-10 text-item"
}

const patchCut = "absolute -end-1 -bottom-1 grid place-items-center bg-status-knockout"

const patchCutSizes = { xs: "size-2.75", sm: "size-3", md: "size-3.25", lg: "size-3.5" }

const patchSizes = { xs: "size-1.75", sm: "size-2", md: "size-2.25", lg: "size-2.5" }

const statusShapes = {
  available: "bg-success-mark",
  offline: "border-[1.5px] border-ink-muted bg-status-knockout",
  attention: "bg-caution-mark scale-x-112 [clip-path:polygon(50%_4%,100%_96%,0_96%)]",
  blocked: "relative bg-danger-mark"
}

const statusBar = "absolute inset-x-[20%] top-1/2 h-[1.5px] -translate-y-1/2 bg-status-knockout"

const clusterLook =
  "inline-flex flex-none cursor-pointer items-center gap-0.5 border border-outline bg-transparent p-0.5 focus-ring hover:bg-hover max-desktop:min-h-11"

const clusterRest = "px-1 text-meta text-ink-secondary tabular-nums"

const hiddenLabel = "sr-only"

/** How many marks a cluster shows before it counts the rest. */
const clusterShown = 3

export type MarkSize = keyof typeof markSizes

export type MarkTone = keyof typeof markTones

/**
 * How something stands, by the shape of its mark, which says it without color: `available`, online or at work,
 * a filled square; `offline`, a hollow square; `attention`, that something is missing, a triangle; and
 * `blocked`, that it cannot run or is unavailable, a square with a bar. The `label` is the word for it, such as
 * "Needs setup", which a row adds to its name and the mark shows on hover, and the `detail` says why, in a
 * sentence, which follows it on hover.
 */
export type MarkStatus = Readonly<{ kind: keyof typeof statusShapes; label: string; detail?: string }>

/** What a row says of its mark, the letters on a ground of its tone, leaving the size to the row. */
export type MarkContent = Readonly<{ text: string; tone?: MarkTone }>

/** What the mark shows on hover: its word, and why when it says. */
const hoverText = (status: MarkStatus): string =>
  status.detail === undefined ? status.label : `${status.label}: ${status.detail}`

const renderStatusShape = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  kind: MarkStatus["kind"],
  sizeClass: string
): Html =>
  h.span([h.Class(`${statusShapes[kind]} ${sizeClass}`)], kind === "blocked" ? [h.span([h.Class(statusBar)])] : [])

/**
 * The `text` letters, upper-cased, in a square on the ground of its `tone`, `neutral` unless given: `xs` 20px,
 * `sm` (the default) 24px, `md` 32px, or `lg` 40px. A mark with a `status` has its patch over the bottom end
 * corner, overhanging it by 2px, in a notch 2px wider all round that is cut from the surface behind it, in the
 * color of `status-knockout`, which a row that is hovered or current sets to its own. The patch is 8px on `sm`,
 * 9px on `md`, 10px on `lg`, and 7px on `xs`, the least the design draws. The status is the word on hover, in
 * the `title`. A mark is hidden from assistive technology, since the name it abbreviates is always beside it, and
 * the row that holds it adds the status to its own name, "Atlas, Needs setup".
 */
export const mark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MarkContent & Readonly<{ size?: MarkSize; status?: MarkStatus | undefined }>
): Html => {
  const size = config.size ?? "sm"
  const { status } = config

  return h.span(
    [
      h.AriaHidden(true),
      ...(status === undefined ? [] : [h.Title(hoverText(status))]),
      h.Class(`${markBase} ${markSizes[size]} ${markTones[config.tone ?? "neutral"]}`)
    ],
    [
      config.text,
      status === undefined
        ? h.empty
        : h.span([h.Class(`${patchCut} ${patchCutSizes[size]}`)], [renderStatusShape(h, status.kind, patchSizes[size])])
    ]
  )
}

/**
 * A `status` as its shape alone, 9px, for the end of a row whose item has no mark of its own, such as a
 * connection. The word is on hover in the `title`, and the row adds it to its own name, as it does for a mark.
 */
export const statusMark = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, status: MarkStatus): Html =>
  h.span(
    [h.AriaHidden(true), h.Title(hoverText(status)), h.Class("flex flex-none")],
    [renderStatusShape(h, status.kind, "size-2.25")]
  )

/**
 * The logo's mark, which a row shows at its end while the thing it stands for is at work. It takes the color of
 * the text around it and is hidden from assistive technology, since the row says in words what it is doing.
 */
export const activityMark = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  icon(h, "mark-agents", { size: "sm" })

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
