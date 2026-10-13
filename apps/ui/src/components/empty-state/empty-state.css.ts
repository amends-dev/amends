import { style } from "@vanilla-extract/css"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

export const empty = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  minHeight: "100%",
  marginInline: "auto",
  paddingBlock: "2rem",
  maxWidth: "32rem",
  textAlign: "center"
})

// The art sits a little apart from the words it illustrates.
export const art = style({ marginBlockEnd: "1rem", color: vars.color.text.primary })

export const title = style({
  ...typeScale.heading,
  margin: 0,
  marginBlockEnd: "0.25rem",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const line = style({ ...typeScale.item, margin: 0, color: vars.color.text.secondary })

export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.75rem",
  marginBlockStart: "1rem"
})
