import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { typeScale } from "../../foundations/typography/tokens.ts"

// Stand-ins for the timeline and composer, which arrive with the group screen.
export const placeholder = style({
  display: "grid",
  gap: "1.5rem"
})

export const entry = style({ display: "grid", gap: "0.25rem" })

export const author = style({ ...typeScale.item, fontWeight: 500 })

export const text = style({ ...typeScale.body, margin: 0 })

export const composer = style({
  ...typeScale.item,
  boxSizing: "border-box",
  minHeight: "8.5rem",
  padding: "1rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.muted,
  "@media": {
    [media.touch]: { minHeight: "7rem" },
    [media.mobile]: { minHeight: "5.75rem", padding: "0.625rem 0.75rem" }
  }
})
