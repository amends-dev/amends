import { style } from "@vanilla-extract/css"
import { media, shell } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

// The canvas frames one white card, as in the app shell; phones run it edge to edge.
export const root = style({
  display: "flex",
  boxSizing: "border-box",
  height: "100dvh",
  padding: shell.gap,
  backgroundColor: vars.color.surface.canvas,
  "@media": {
    [media.mobile]: {
      padding: 0,
      paddingTop: "env(safe-area-inset-top)",
      backgroundColor: vars.color.surface.panel
    }
  }
})

export const card = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  overflowY: "auto",
  backgroundColor: vars.color.surface.panel
})

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "5rem",
  padding: "1rem"
})

export const brand = style({
  ...typeScale.title,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  color: vars.color.text.primary,
  fontWeight: fontWeight.semibold,
  textDecoration: "none",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" }
  }
})

export const brandMark = style({
  display: "grid",
  placeItems: "center",
  width: "2.5rem",
  height: "2.5rem"
})

export const actions = style({ display: "flex", alignItems: "center", gap: "0.75rem" })

// A form sits in the middle of the card; a directory starts near the top.
export const body = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  boxSizing: "border-box",
  width: "100%",
  marginInline: "auto",
  paddingInline: "1.5rem",
  selectors: {
    "&[data-width=form]": {
      maxWidth: "calc(26.25rem + 3rem)",
      justifyContent: "center",
      paddingBlock: "1.5rem 5rem"
    },
    "&[data-width=directory]": { maxWidth: "calc(50rem + 3rem)", paddingBlock: "5rem 4rem" }
  },
  "@media": {
    [media.mobile]: {
      paddingInline: "1rem",
      selectors: { "&[data-width=directory]": { paddingBlockStart: "1.5rem" } }
    }
  }
})
