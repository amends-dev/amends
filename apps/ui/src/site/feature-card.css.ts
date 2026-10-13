import { style } from "@vanilla-extract/css"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../foundations/typography/tokens.ts"

export const card = style({
  display: "grid",
  gridTemplateRows: "auto auto 1fr",
  gap: "0.5rem",
  height: "100%",
  boxSizing: "border-box",
  padding: "1rem 1rem 1.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel
})

export const art = style({
  height: "15.5rem",
  marginBlockEnd: "1rem",
  overflow: "hidden",
  backgroundColor: vars.color.surface.canvas,
  vars: { "--amends-logo-knockout": vars.color.surface.canvas }
})

export const title = style({
  ...typeScale.title,
  margin: 0,
  paddingInline: "0.5rem",
  fontWeight: fontWeight.semibold,
  color: vars.color.text.primary
})

export const text = style({
  ...typeScale.body,
  margin: 0,
  paddingInline: "0.5rem",
  color: vars.color.text.secondary
})

export const link = style({
  ...typeScale.item,
  alignSelf: "end",
  justifySelf: "start",
  marginInline: "0.5rem",
  marginBlockStart: "1rem",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  selectors: {
    "&:hover": { textDecoration: "underline", textUnderlineOffset: "0.2em" },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "3px" }
  }
})
