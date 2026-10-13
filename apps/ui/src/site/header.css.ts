import { style } from "@vanilla-extract/css"
import { media } from "../foundations/layout/tokens.ts"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../foundations/typography/tokens.ts"
import { displayFamily, siteType } from "./tokens.ts"

export const header = style({
  borderBottom: `1px solid ${vars.color.border.divider}`,
  backgroundColor: vars.color.surface.panel,
  vars: { "--amends-logo-knockout": vars.color.surface.panel }
})

// Phones put the links on a row of their own under the brand and the action.
export const bar = style({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gridTemplateAreas: '"brand action" "links links"',
  alignItems: "center",
  rowGap: "0.5rem",
  paddingBlock: "0.75rem",
  "@media": {
    [media.tablet]: {
      gridTemplateColumns: "1fr auto auto",
      gridTemplateAreas: '"brand links action"',
      columnGap: "2rem",
      minHeight: "4.5rem",
      paddingBlock: 0
    }
  }
})

export const brand = style({
  gridArea: "brand",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.625rem",
  justifySelf: "start",
  color: vars.color.text.primary,
  textDecoration: "none",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "4px" }
  }
})

export const wordmark = style({
  fontFamily: displayFamily,
  ...siteType.wordmark,
  letterSpacing: "-0.01em"
})

export const links = style({
  gridArea: "links",
  display: "flex",
  gap: "1.5rem",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

export const link = style({
  ...typeScale.item,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  selectors: {
    "&:hover, &[aria-current]": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "4px" }
  }
})

export const action = style({ gridArea: "action" })
