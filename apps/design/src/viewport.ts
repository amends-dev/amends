/**
 * The window's width as the theme's breakpoints cut it, which the shell lays out by and an app keeps in its
 * model, since a view that depends on the width cannot leave it to CSS: what the drawer holds is rendered, not
 * hidden.
 */

import * as Schema from "effect/Schema"

/** Below 48rem, from 48rem, from 64rem, and from 80rem. */
export const Viewport = Schema.Literals(["Phone", "Tablet", "Desktop", "Split"])
export type Viewport = typeof Viewport.Type

/**
 * The media queries that cut the width into viewports, at the rems of the theme's `--breakpoint-tablet`,
 * `--breakpoint-desktop`, and `--breakpoint-split`: `styles.css` and these must agree.
 */
export const viewportQueries = {
  tablet: "(min-width: 48rem)",
  desktop: "(min-width: 64rem)",
  split: "(min-width: 80rem)"
} as const

/** The viewport for which of the `viewportQueries` match. */
export const viewportOf = ({
  isTablet,
  isDesktop,
  isSplit
}: Readonly<{ isTablet: boolean; isDesktop: boolean; isSplit: boolean }>): Viewport => {
  if (isSplit) {
    return "Split"
  }

  if (isDesktop) {
    return "Desktop"
  }

  if (isTablet) {
    return "Tablet"
  }

  return "Phone"
}
