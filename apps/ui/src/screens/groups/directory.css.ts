import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

// Columns: icon, name | visibility | members | action. Phones keep the name and action.
const columns = {
  gridTemplateColumns: "1.125rem minmax(0, 1fr) 8.75rem 8rem 5.5rem",
  columnGap: "0.875rem",
  "@media": {
    [media.touch]: { gridTemplateColumns: "1.125rem minmax(0, 1fr) 6rem 7rem 5.5rem" },
    [media.mobile]: { gridTemplateColumns: "1.125rem minmax(0, 1fr) auto" }
  }
} as const

export const summary = style({
  ...typeScale.control,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "1rem",
  flex: "none",
  margin: "1.125rem 1.5rem 0",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { margin: "0.75rem 1rem 0" } }
})

export const total = style({ ...typeScale.hint, flex: "none", color: vars.color.text.muted })

export const headings = style({
  ...columns,
  ...typeScale.meta,
  display: "grid",
  flex: "none",
  boxSizing: "border-box",
  margin: "1.25rem 1.5rem 0",
  paddingInline: "0.75rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  "@media": { ...columns["@media"], [media.mobile]: { display: "none" } }
})

export const headingGroup = style({ gridColumn: "1 / 3" })

export const stitch = style({
  gridColumn: "1 / -1",
  marginInline: "-0.75rem",
  marginBlock: "0.5625rem 0.625rem"
})

export const list = style({ margin: 0, padding: 0, listStyle: "none" })

export const row = style({
  ...columns,
  position: "relative",
  display: "grid",
  alignItems: "center",
  minHeight: "3.75rem",
  paddingInline: "0.75rem",
  color: vars.color.text.secondary,
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&:has(a:focus-visible)": {
      outline: `2px solid ${vars.color.text.primary}`,
      outlineOffset: "-2px"
    }
  },
  "@media": columns["@media"]
})

export const icon = style({
  width: "1.125rem",
  height: "1.125rem",
  color: vars.color.text.secondary
})

// The name links the whole row; the Join button sits above that link.
export const name = style({
  ...typeScale.item,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  outline: "none",
  selectors: { "&::after": { content: '""', position: "absolute", inset: 0 } }
})

export const visibility = style({ "@media": { [media.mobile]: { display: "none" } } })

export const members = style({
  ...typeScale.control,
  "@media": { [media.mobile]: { display: "none" } }
})

export const action = style({ position: "relative", justifySelf: "end" })

export const open = style({
  ...typeScale.control,
  display: "inline-flex",
  alignItems: "center",
  gap: "1rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: { [`${row}:hover &`]: { color: vars.color.text.primary } }
})

export const openIcon = style({ width: "1rem", height: "1rem" })

export const empty = style({
  ...typeScale.control,
  margin: 0,
  padding: "2rem 0.75rem",
  color: vars.color.text.secondary
})

export const alert = style({ paddingInline: "1.5rem", paddingBlockEnd: "0.75rem" })
