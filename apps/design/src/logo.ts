/**
 * The amends mark: a square, a patch over its corner, and four stitches across the seam, drawn on a 64-unit
 * grid in the color of the text around it, with the patch and the stitches cut out of the surface behind
 * them. Its patch lifts when the link or button that holds it is hovered, and it has four looping motions.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

/** The four stitches across the seam, which the state art draws too. */
export const stitchPaths = ["M18.5 37 H25.5", "M18.5 30 H25.5", "M30 18.5 V25.5", "M37 18.5 V25.5"] as const

export const logoMotions = ["sew-on", "thread", "tug", "working"] as const

/**
 * The mark in motion, looping: `sew-on` drops the patch on and pops the stitches in, for a launch; `thread` draws
 * each stitch through in turn, quiet enough to idle; `tug` wobbles the patch from its corner, for something
 * stopping; and `working` lights the stitches while the patch breathes, a loader.
 */
export type LogoMotion = (typeof logoMotions)[number]

export type LogoOptions = Readonly<{
  /** A CSS length, `1.25rem` unless given. It scales with the reader's text size. */
  size?: string
  /** What the mark says, when it stands alone. A mark beside its own name, or in a control that has one, has none. */
  label?: string
  /** Loops one of the mark's motions, still when the reader prefers less motion. */
  motion?: LogoMotion
}>

const motionClasses = {
  "sew-on": "logo-sew-on",
  thread: "logo-thread",
  tug: "logo-tug",
  working: "logo-working"
} as const satisfies Record<LogoMotion, string>

const markLook = "block flex-none overflow-visible"

const baseLook = "fill-current"

const patchLook = "logo-patch fill-current stroke-status-knockout [stroke-width:2.6]"

const stitchLook = "logo-stitch fill-none stroke-status-knockout [stroke-width:2.4] [stroke-linecap:square]"

/**
 * The mark as an `svg` in the color of the text around it. It is decorative and hidden from assistive technology;
 * a `label` makes it an image with that name. Its patch and stitches are cut out of the color of `status-knockout`,
 * the surface behind it, which a row that is hovered or current sets to its own, and which the rail sets to the
 * canvas. Inside a link or a button, hovering lifts its patch.
 */
export const logo = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, options: LogoOptions = {}): Html => {
  const size = options.size ?? "1.25rem"
  const label = options.label?.trim() ?? ""

  return h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.Width(size),
      h.Height(size),
      h.ViewBox("0 0 64 64"),
      ...(label === "" ? [h.AriaHidden(true)] : [h.Role("img"), h.AriaLabel(label)]),
      h.Class(options.motion === undefined ? markLook : `${markLook} ${motionClasses[options.motion]}`)
    ],
    [
      h.rect([h.Class(baseLook), h.X("3"), h.Y("3"), h.Width("42"), h.Height("42")]),
      h.rect([h.Class(patchLook), h.X("22"), h.Y("22"), h.Width("39"), h.Height("39")]),
      ...stitchPaths.map((path) => h.path([h.Class(stitchLook), h.D(path)]))
    ]
  )
}
