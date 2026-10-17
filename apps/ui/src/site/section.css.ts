import { style, styleVariants } from "@vanilla-extract/css"
import { media } from "../foundations/layout/tokens.ts"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, monoFamily, typeScale } from "../foundations/typography/tokens.ts"
import { displayFamily, siteType, siteTypeMobile } from "./tokens.ts"

export const section = style({
  paddingBlock: "4rem",
  "@media": { [media.tablet]: { paddingBlock: "6rem" } }
})

export const tone = styleVariants({
  panel: { backgroundColor: vars.color.surface.panel },
  canvas: { backgroundColor: vars.color.surface.canvas },
  // Inside a dark Theme, so the canvas is the dark one in either mode.
  inverse: { backgroundColor: vars.color.surface.canvas }
})

export const content = style({ display: "grid", gap: "3rem" })

export const header = styleVariants({
  stack: { display: "grid", gap: "1rem", maxWidth: "45rem", alignContent: "start" },
  split: {
    display: "grid",
    gap: "1rem 4rem",
    "@media": { [media.desktop]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 32.5rem)" } }
  }
})

export const heading = style({ display: "grid", gap: "0.75rem", alignContent: "start" })

export const eyebrow = style({
  ...typeScale.hint,
  margin: 0,
  fontFamily: monoFamily,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: vars.color.text.secondary
})

const display = {
  margin: 0,
  fontFamily: displayFamily,
  fontWeight: 400,
  letterSpacing: "-0.01em",
  color: vars.color.text.primary,
  textWrap: "balance"
} as const

export const title = styleVariants({
  section: {
    ...display,
    ...siteTypeMobile.section,
    "@media": { [media.tablet]: siteType.section }
  },
  heading: {
    ...display,
    ...siteTypeMobile.heading,
    "@media": { [media.tablet]: siteType.heading }
  }
})

export const intro = style({
  ...siteType.intro,
  margin: 0,
  color: vars.color.text.secondary,
  textWrap: "pretty",
  "@media": { [media.desktop]: { alignSelf: "end" } }
})

export const split = style({
  display: "grid",
  gap: "3rem",
  alignItems: "start",
  "@media": {
    [media.desktop]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: "5rem" }
  }
})

export const widerEnd = style({
  "@media": {
    [media.desktop]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.55fr)", gap: "4rem" }
  }
})

export const splitPart = style({
  display: "grid",
  gap: "2rem",
  alignContent: "start",
  minWidth: 0
})

export const grid = style({
  display: "grid",
  gap: "1.5rem",
  gridTemplateColumns: "minmax(0, 1fr)",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

export const columns = styleVariants({
  2: { "@media": { [media.tablet]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } } },
  3: {
    "@media": {
      [media.tablet]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
      [media.desktop]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }
    }
  },
  4: {
    "@media": {
      [media.tablet]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
      [media.desktop]: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }
    }
  }
})

export const actions = style({ display: "flex", flexWrap: "wrap", gap: "0.75rem" })

export const rows = style({
  margin: 0,
  padding: 0,
  borderTop: `1px solid ${vars.color.border.divider}`
})

export const row = style({
  display: "grid",
  gap: "0.25rem",
  paddingBlock: "1rem",
  borderBottom: `1px solid ${vars.color.border.divider}`
})

export const term = style({
  ...typeScale.item,
  margin: 0,
  fontFamily: monoFamily,
  color: vars.color.text.primary
})

export const definition = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.secondary
})

export const note = style({
  display: "grid",
  gap: "0.25rem",
  padding: "1rem 1.25rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.canvas
})

export const noteTitle = style({
  ...typeScale.item,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.75rem",
  margin: 0,
  fontWeight: fontWeight.semibold
})

export const noteText = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary
})

export const soon = style({ fontFamily: monoFamily, fontWeight: fontWeight.regular })
