import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

export const heading = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  "@media": { [media.mobile]: { flexDirection: "column", alignItems: "stretch" } }
})

export const titles = style({ display: "flex", flexDirection: "column", gap: "0.75rem" })

export const title = style({
  ...typeScale.display,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const summary = style({
  ...typeScale.item,
  lineHeight: "1.375rem",
  margin: 0,
  color: vars.color.text.secondary
})

export const section = style({
  display: "flex",
  flexDirection: "column",
  marginBlockStart: "2.375rem"
})

// "Your workspaces 2 ------" above each list.
export const sectionHeading = style({
  ...typeScale.item,
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  margin: "0 0 0.5rem",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const sectionLabel = style({ flex: "none", whiteSpace: "nowrap" })

export const sectionStitch = style({ flex: 1, minWidth: 0, overflow: "hidden" })

export const list = style({ margin: 0, padding: 0, listStyle: "none" })

export const row = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "2.5rem minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "1rem",
  minHeight: "4.75rem",
  paddingInline: "0.75rem 1rem",
  selectors: {
    "&[data-link]:hover": { backgroundColor: vars.color.surface.hover },
    "&:has(a:focus-visible)": {
      outline: `2px solid ${vars.color.text.primary}`,
      outlineOffset: "-2px"
    }
  }
})

export const text = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.3125rem",
  minWidth: 0
})

// The name links the whole row.
export const name = style({
  ...typeScale.body,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  outline: "none",
  selectors: { "a&::after": { content: '""', position: "absolute", inset: 0 } }
})

export const detail = style({ ...typeScale.control, color: vars.color.text.secondary })

export const open = style({
  ...typeScale.control,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  paddingInline: "0.8125rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: { [`${row}:hover &`]: { color: vars.color.text.primary } }
})

export const openIcon = style({ width: "1rem", height: "1rem" })

export const accept = style({ position: "relative" })

export const footnote = style({
  ...typeScale.control,
  margin: 0,
  marginBlockStart: "1.5rem",
  color: vars.color.text.secondary
})

export const empty = style({ marginBlockStart: "4rem" })

// A failed refresh, under the heading.
export const notice = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.75rem",
  marginBlockStart: "1.5rem"
})

export const form = style({ display: "flex", flexDirection: "column", gap: "1.25rem" })

export const status = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.secondary,
  selectors: { "&:empty": { display: "none" } }
})
