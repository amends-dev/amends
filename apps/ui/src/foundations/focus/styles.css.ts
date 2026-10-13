import { style } from "@vanilla-extract/css"
import { vars } from "../theme/vars.css.ts"

/** A 2px outline in the primary text color, outside the control. */
export const focusRing = style({
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" }
  }
})

/** The same outline drawn inside, for full-width rows that would clip an outer one. */
export const focusInset = style({
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" }
  }
})
