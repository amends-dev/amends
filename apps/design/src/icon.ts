/**
 * The icons of `@amends-dev/icons`, drawn as SVG from their path data under the package's rendering
 * contract: a 24-unit viewBox, `currentColor` strokes of width 2 with round caps and joins, and
 * decorative unless it is given a label.
 */

import { type IconName, filledIconNames, iconPaths } from "@amends-dev/icons/paths"
import type { Html, HtmlBuilder } from "foldkit/html"

const iconSizes = { xs: "0.75rem", sm: "1rem", md: "1.25rem", lg: "1.5rem" } as const

export type { IconName }

export type IconSize = keyof typeof iconSizes

export type IconOptions = Readonly<{
  /** `md` (1.25rem) unless given. Sizes scale with the reader's text size. */
  size?: IconSize
  /** What the icon says, for one that stands alone. An icon beside its own words has none and is hidden. */
  label?: string
}>

/**
 * An icon by name, as an `svg` that takes its color from the text around it. It is decorative and hidden
 * from assistive technology; a `label` makes it an image with that name and a title.
 */
export const icon = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  name: IconName,
  options: IconOptions = {}
): Html => {
  const dimension = iconSizes[options.size ?? "md"]
  const label = options.label?.trim() ?? ""
  const isLabeled = label !== ""
  const path = h.path([h.D(iconPaths[name]), ...(filledIconNames.includes(name) ? [h.Fill("currentColor")] : [])])

  return h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.Width(dimension),
      h.Height(dimension),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      ...(isLabeled ? [h.Role("img")] : [h.AriaHidden(true)])
    ],
    isLabeled ? [h.title([], [label]), path] : [path]
  )
}
