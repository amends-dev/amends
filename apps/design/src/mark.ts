/**
 * The square that stands for a person, a workspace, an agent, or a connection: one or two letters, or a drawing,
 * on a ground of its tone, the patch over its corner that says how it stands, the logo's mark that says it is at
 * work, the circle that says where a task stands, and the button that overlaps a few marks to open the people they
 * stand for.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, type IconSize, icon } from "./icon.ts"
import { type LogoMotion, logo } from "./logo.ts"
import { type TooltipPlacement, type TooltipTone, tooltip } from "./tooltip.ts"

const markBase = "relative grid flex-none place-items-center font-medium uppercase"

const markTones = {
  neutral: "bg-avatar-neutral-bg text-avatar-neutral-fg",
  slate: "bg-avatar-slate-bg text-avatar-slate-fg",
  lilac: "bg-avatar-lilac-bg text-avatar-lilac-fg"
}

const markSizes = {
  xs: "size-5 text-[0.5625rem]",
  choice: "size-5.5 text-[0.625rem]",
  sm: "size-6 text-meta",
  account: "size-7 text-[0.8125rem]",
  md: "size-8 text-hint",
  lg: "size-10 text-item"
}

const iconSizes = {
  xs: "xs",
  choice: "xs",
  sm: "sm",
  account: "sm",
  md: "sm",
  lg: "md"
} as const satisfies Record<keyof typeof markSizes, IconSize>

const patchCut = "absolute -end-1 -bottom-1 grid place-items-center bg-status-knockout"

const patchCutSizes = {
  xs: "size-2.75",
  choice: "size-2.75",
  sm: "size-3",
  account: "size-3.25",
  md: "size-3.25",
  lg: "size-3.5"
}

const patchSizes = {
  xs: "size-1.75",
  choice: "size-1.75",
  sm: "size-2",
  account: "size-2.25",
  md: "size-2.25",
  lg: "size-2.5"
}

const statusShapes = {
  available: "bg-success-mark",
  offline: "border-[1.5px] border-ink-muted bg-status-knockout",
  attention: "bg-caution-mark scale-x-112 [clip-path:polygon(50%_4%,100%_96%,0_96%)]",
  blocked: "relative bg-danger-mark"
}

const statusBar = "absolute inset-x-[20%] top-1/2 h-[1.5px] -translate-y-1/2 bg-status-knockout"

const statusTones: Readonly<Record<keyof typeof statusShapes, TooltipTone | undefined>> = {
  available: undefined,
  offline: undefined,
  attention: "caution",
  blocked: "danger"
}

const stackLook =
  "inline-grid h-8 flex-none cursor-pointer place-items-center border-0 bg-transparent px-1 focus-ring hover:bg-subtle max-desktop:me-2 max-desktop:h-11 max-tablet:hidden"

const stackMarks = "inline-flex items-center [&>*+*]:-ms-1.25"

const hiddenLabel = "sr-only"

export type MarkSize = keyof typeof markSizes

export type MarkTone = keyof typeof markTones

/**
 * How something stands, by the shape of its mark, which says it without color: `available`, online or at work,
 * a filled square; `offline`, a hollow square; `attention`, that something is missing, a triangle; and
 * `blocked`, that it cannot run or is unavailable, a square with a bar. The `label` is the word for it, such as
 * "Needs setup", which a row adds to its name and the mark shows in a tooltip on hover, and the `detail` says why,
 * in a sentence, which follows it there.
 */
export type MarkStatus = Readonly<{ kind: keyof typeof statusShapes; label: string; detail?: string }>

/**
 * What a row says of its mark, on a ground of its tone, leaving the size to the row: the `text` letters, for a
 * person, a workspace, or an agent, or an `icon`, for a thing that has no name to abbreviate, such as a connection.
 */
export type MarkContent = Readonly<{ tone?: MarkTone }> &
  (Readonly<{ text: string; icon?: never }> | Readonly<{ icon: IconName; text?: never }>)

const renderStatusShape = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  kind: MarkStatus["kind"],
  sizeClass: string
): Html =>
  h.span([h.Class(`${statusShapes[kind]} ${sizeClass}`)], kind === "blocked" ? [h.span([h.Class(statusBar)])] : [])

/**
 * `children` with the tooltip a `status` says: its label as the title, tinted `caution` for a triangle and `danger` for
 * a barred square, as `@amends-dev/ui` tints it, and why, if it says, under it. `placement` is above unless given.
 */
export const statusTooltip = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  status: MarkStatus,
  children: ReadonlyArray<Html>,
  placement?: TooltipPlacement
): Html =>
  tooltip(h, {
    title: status.label,
    detail: status.detail,
    tone: statusTones[status.kind],
    placement,
    children
  })

/**
 * The `text` letters, upper-cased, or the `icon`, in a square on the ground of its `tone`: `neutral` unless given,
 * `slate` for the person who wrote a message, and `lilac` for an agent. The square is `xs` 20px, `choice` 22px, `sm`
 * (the default) 24px, `account` 28px, `md` 32px, or `lg` 40px. An icon is drawn at the
 * size that fits its square (`xs`, `xs`, `sm`, `sm`, `sm`, and `md`) and takes the color of the ground's text. A mark
 * with a `status` has its patch over the bottom end corner, overhanging it by 2px, in a notch 2px wider all round that
 * is cut from the surface behind it, in the color of `status-knockout`, which a row that is hovered or current sets to
 * its own. The patch is 8px on `sm`, 9px on `account` and `md`, 10px on `lg`, and 7px on `xs` and `choice`, the least
 * the design draws. The status is a tooltip over the mark on hover (`statusTooltip`), above it unless
 * `statusPlacement` says below, for a mark with no room above. A mark is hidden from assistive technology, since the
 * name it abbreviates is always beside it, and the row that holds it adds the status to its own name, "Atlas, Needs
 * setup".
 */
export const mark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MarkContent &
    Readonly<{ size?: MarkSize; status?: MarkStatus | undefined; statusPlacement?: TooltipPlacement | undefined }>
): Html => {
  const size = config.size ?? "sm"
  const { status } = config

  const square = h.span(
    [h.AriaHidden(true), h.Class(`${markBase} ${markSizes[size]} ${markTones[config.tone ?? "neutral"]}`)],
    [
      config.icon === undefined ? config.text : icon(h, config.icon, { size: iconSizes[size] }),
      status === undefined
        ? h.empty
        : h.span([h.Class(`${patchCut} ${patchCutSizes[size]}`)], [renderStatusShape(h, status.kind, patchSizes[size])])
    ]
  )

  return status === undefined ? square : statusTooltip(h, status, [square], config.statusPlacement)
}

/**
 * A status's shape alone, 9px, for the end of a row whose item has no mark of its own, such as a connection. It is
 * hidden from assistive technology, and says nothing on hover: a row that wants the word there wraps it in
 * `statusTooltip`, and adds the word to its own name, as it does for a mark.
 */
export const statusMark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  kind: MarkStatus["kind"]
): Html => h.span([h.AriaHidden(true), h.Class("flex flex-none")], [renderStatusShape(h, kind, "size-2.25")])

/**
 * The logo, 0.875rem, in the `motion` of what is under way, `working` unless given: `thread` while it waits, `working`
 * while it runs, `tug` while it stops. A row shows it at its end while the thing it stands for is at work. It takes
 * the color of the text around it, is cut out of the row's own surface, and is hidden from assistive technology,
 * since the row says in words what it is doing.
 */
export const activityMark = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  motion: LogoMotion = "working"
): Html => logo(h, { size: "0.875rem", motion })

const taskStatusBase = "flex-none"

const taskStatusInks = { rest: "text-ink-secondary", done: "text-ink" }

/**
 * The drawings of a task's status, named by how each looks: `triage`, an exclamation mark, for what awaits a
 * decision; `open`, a bare circle; `progress`, a circle half filled; `paused`, a circle with two bars; `done`, a
 * circle filled and checked; and `dismissed`, a circle crossed out.
 */
export const taskStatusShapes = ["triage", "open", "progress", "paused", "done", "dismissed"] as const

export type TaskStatusShape = (typeof taskStatusShapes)[number]

const renderStroke = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  path: string,
  width: string
): Html => h.path([h.D(path), h.Stroke("currentColor"), h.StrokeWidth(width), h.StrokeLinecap("round")])

const renderTaskStatusInside = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  shape: TaskStatusShape
): ReadonlyArray<Html> => {
  switch (shape) {
    case "triage":
      return [
        renderStroke(h, "M8 4.6 V8.8", "1.3"),
        h.circle([h.Cx("8"), h.Cy("11.1"), h.R("0.8"), h.Fill("currentColor")])
      ]
    case "progress":
      return [h.path([h.D("M8 3.6 A4.4 4.4 0 0 0 8 12.4 Z"), h.Fill("currentColor")])]
    case "paused":
      return [renderStroke(h, "M6.5 5.8 V10.2", "1.3"), renderStroke(h, "M9.5 5.8 V10.2", "1.3")]
    case "done":
      return [
        h.path([
          h.D("M5.3 8.2 L7.2 10 L10.8 6.3"),
          h.Class("stroke-on-action"),
          h.Fill("none"),
          h.StrokeWidth("1.4"),
          h.StrokeLinecap("round"),
          h.StrokeLinejoin("round")
        ])
      ]
    case "dismissed":
      return [renderStroke(h, "M6.2 6.2 L9.8 9.8", "1.3"), renderStroke(h, "M9.8 6.2 L6.2 9.8", "1.3")]
    case "open":
      return []
  }
}

/**
 * Where a task stands, drawn as `apps/ui` draws it: a circle on a 16-unit grid, 0.875rem wide unless the `size` says,
 * with the `shape` in it. It is gray, and `ink` once the task is `done`, and takes the color of the text around it for
 * nothing else. It is hidden from assistive technology, since the word for the status is always beside it.
 */
export const taskStatus = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  shape: TaskStatusShape,
  options: Readonly<{ size?: string }> = {}
): Html => {
  const size = options.size ?? "0.875rem"

  return h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.Width(size),
      h.Height(size),
      h.ViewBox("0 0 16 16"),
      h.Fill("none"),
      h.AriaHidden(true),
      h.Class(`${taskStatusBase} ${shape === "done" ? taskStatusInks.done : taskStatusInks.rest}`)
    ],
    [
      h.circle([
        h.Cx("8"),
        h.Cy("8"),
        h.R("6.4"),
        h.Stroke("currentColor"),
        h.StrokeWidth("1.2"),
        h.Fill(shape === "done" ? "currentColor" : "none")
      ]),
      ...renderTaskStatusInside(h, shape)
    ]
  )
}

/**
 * A button of a few `marks` at 22px in their tones, each overlapping the one before it by 5px, as `@amends-dev/ui`'s
 * `AvatarStack` lies in a group's header, that sends `onClick`. It is 32px tall and 44px on touch, `subtle` on hover,
 * and gone below 48rem, where the header is narrow. It is named by `label`, which says how many people the marks stand
 * for, since the marks are hidden from assistive technology; the caller gives it as many marks as it wants shown.
 */
export const markStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ marks: ReadonlyArray<MarkContent>; label: string; onClick: Message }>
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.Class(stackLook)],
          [
            h.span(
              [h.Class(stackMarks)],
              config.marks.map((content) => mark(h, { ...content, size: "choice" }))
            ),
            h.span([h.Class(hiddenLabel)], [config.label])
          ]
        )
    },
    h
  )
