import { style } from "@vanilla-extract/css"
import { vars } from "../foundations/theme/vars.css.ts"
import { monoFamily, typeScale } from "../foundations/typography/tokens.ts"

export const command = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  minHeight: "2.75rem",
  boxSizing: "border-box",
  margin: 0,
  paddingInline: "1rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.canvas,
  fontFamily: monoFamily,
  color: vars.color.text.primary,
  overflowX: "auto",
  whiteSpace: "nowrap"
})

export const prompt = style({ color: vars.color.text.muted, userSelect: "none" })

// One click selects the whole command, ready to copy.
export const text = style({ userSelect: "all" })
