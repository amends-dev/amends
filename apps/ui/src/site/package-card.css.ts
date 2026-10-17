import { style } from "@vanilla-extract/css"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, monoFamily, typeScale } from "../foundations/typography/tokens.ts"

export const card = style({
  display: "grid",
  gridTemplateRows: "auto auto 1fr auto",
  height: "100%",
  boxSizing: "border-box",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel
})

export const name = style({
  ...typeScale.control,
  margin: 0,
  padding: "1.5rem 1.5rem 0",
  fontFamily: monoFamily,
  fontWeight: fontWeight.regular,
  color: vars.color.text.primary,
  overflowWrap: "anywhere"
})

export const meta = style({
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  margin: 0,
  padding: "0.5rem 1.5rem 0",
  color: vars.color.text.muted
})

export const version = style({ fontFamily: monoFamily, fontWeight: fontWeight.regular })

export const description = style({
  ...typeScale.item,
  margin: 0,
  padding: "1rem 1.5rem 1.5rem",
  color: vars.color.text.secondary
})

export const links = style({
  display: "flex",
  gap: "1.25rem",
  margin: 0,
  padding: "1rem 1.5rem",
  borderTop: `1px solid ${vars.color.border.divider}`,
  listStyle: "none"
})

export const link = style({
  ...typeScale.control,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  selectors: {
    "&:hover": { textDecoration: "underline", textUnderlineOffset: "0.2em" },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "3px" }
  }
})
