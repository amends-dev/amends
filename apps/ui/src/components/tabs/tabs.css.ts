import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

// One row that scrolls sideways when the labels do not fit.
export const list = style({
  display: "flex",
  gap: "1.5rem",
  margin: 0,
  padding: 0,
  overflowX: "auto",
  scrollbarWidth: "none",
  selectors: { "&::-webkit-scrollbar": { display: "none" } }
})

// Label text sits 4px from the top and the 2px underline at the bottom of a 36px tab; touch
// layouts center the label in 44px.
export const tab = style({
  ...typeScale.item,
  position: "relative",
  display: "inline-flex",
  alignItems: "flex-start",
  gap: "0.375rem",
  flex: "none",
  boxSizing: "border-box",
  height: "2.25rem",
  paddingBlock: "0.25rem 0.6875rem",
  paddingInline: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  fontWeight: fontWeight.regular,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
    "&[aria-current], &[aria-selected=true]": {
      color: vars.color.text.primary,
      fontWeight: fontWeight.medium
    },
    "&[aria-current]::after, &[aria-selected=true]::after": {
      content: '""',
      position: "absolute",
      insetInline: 0,
      bottom: 0,
      height: "2px",
      backgroundColor: vars.color.action.indicator
    }
  },
  "@media": {
    [media.touch]: { height: "2.75rem", alignItems: "center", paddingBlock: 0 }
  }
})

export const count = style({ alignSelf: "center", marginBlockStart: "0.125rem" })
