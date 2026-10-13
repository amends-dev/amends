import { style } from "@vanilla-extract/css"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, monoFamily, typeScale } from "../foundations/typography/tokens.ts"

export const steps = style({
  display: "grid",
  gap: "2rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
  counterReset: "step"
})

export const step = style({
  display: "grid",
  gridTemplateColumns: "1.75rem minmax(0, 1fr)",
  columnGap: "1rem",
  rowGap: "0.25rem",
  counterIncrement: "step",
  "::before": {
    content: "counter(step)",
    ...typeScale.hint,
    gridRow: "span 2",
    display: "grid",
    placeItems: "center",
    width: "1.75rem",
    height: "1.75rem",
    boxSizing: "border-box",
    border: `1px solid ${vars.color.border.default}`,
    backgroundColor: vars.color.surface.panel,
    fontFamily: monoFamily,
    color: vars.color.text.primary
  }
})

export const title = style({
  ...typeScale.title,
  margin: 0,
  fontWeight: fontWeight.semibold,
  color: vars.color.text.primary
})

export const text = style({ ...typeScale.body, margin: 0, color: vars.color.text.secondary })
