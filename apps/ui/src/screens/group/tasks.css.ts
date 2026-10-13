import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

// Columns: state, key, title | status | assignee | activity. Touch layouts drop the status
// words; phones keep the state, title, assignee's avatar, and time.
const columns = {
  gridTemplateColumns: "1rem 4.125rem minmax(0, 1fr) 7rem 9.25rem 5.5rem",
  columnGap: "0.75rem",
  "@media": {
    [media.touch]: { gridTemplateColumns: "1rem 4.125rem minmax(0, 1fr) 9.25rem 4.5rem" },
    [media.mobile]: { gridTemplateColumns: "1rem minmax(0, 1fr) 1.5rem 3.5rem" }
  }
} as const

export const headings = style({
  ...columns,
  ...typeScale.meta,
  display: "grid",
  flex: "none",
  alignItems: "start",
  boxSizing: "border-box",
  height: "2.5rem",
  margin: "0.75rem 1.5rem 0",
  padding: "0.1875rem 0.75rem 0",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  "@media": {
    ...columns["@media"],
    [media.mobile]: { display: "none" }
  }
})

export const headingTask = style({ gridColumn: "1 / 4" })

export const headingStatus = style({ "@media": { [media.touch]: { display: "none" } } })

export const headingActivity = style({ textAlign: "end" })

// The stitch under the headings.
export const headingsStitch = style({
  gridColumn: "1 / -1",
  marginInline: "-0.75rem",
  marginBlockStart: "0.75rem"
})

export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

export const row = style({
  ...columns,
  position: "relative",
  display: "grid",
  alignItems: "center",
  boxSizing: "border-box",
  minHeight: "3.5rem",
  paddingInline: "0.75rem",
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
    "&[aria-current]": { backgroundColor: vars.color.surface.selected },
    "&[aria-current]::before": {
      content: '""',
      position: "absolute",
      insetInlineStart: 0,
      top: "50%",
      width: "2px",
      height: "1.25rem",
      transform: "translateY(-50%)",
      backgroundColor: vars.color.action.indicator
    }
  },
  "@media": {
    ...columns["@media"],
    [media.mobile]: { ...columns["@media"][media.mobile], minHeight: "3.75rem" }
  }
})

export const key = style({
  ...typeScale.hint,
  fontVariantNumeric: "tabular-nums",
  "@media": { [media.mobile]: { display: "none" } }
})

export const title = style({
  ...typeScale.item,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  selectors: { "&[data-done]": { color: vars.color.text.secondary } },
  "@media": { [media.mobile]: { whiteSpace: "normal" } }
})

export const status = style({
  ...typeScale.hint,
  "@media": { [media.touch]: { display: "none" } }
})

export const assignee = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minWidth: 0,
  color: vars.color.text.primary,
  selectors: { "&[data-unassigned]": { color: vars.color.text.secondary } }
})

export const assigneeName = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media": { [media.mobile]: { display: "none" } }
})

export const unassigned = style({
  display: "grid",
  placeItems: "center",
  flex: "none",
  width: "1.5rem",
  height: "1.5rem"
})

export const unassignedIcon = style({ width: "0.9375rem", height: "0.9375rem" })

export const activity = style({
  ...typeScale.control,
  lineHeight: "1.125rem",
  textAlign: "end",
  whiteSpace: "nowrap"
})

export const empty = style({
  ...typeScale.control,
  margin: 0,
  padding: "2rem 0.75rem",
  color: vars.color.text.secondary
})

// The task panel: status and assignee side by side, then the description and activity.
export const details = style({ display: "flex", flexDirection: "column", gap: "1.75rem" })

export const properties = style({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.25rem 1.5rem"
})

export const propertyLabel = style({
  ...typeScale.meta,
  display: "block",
  marginBlockEnd: "0.3125rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase"
})

export const property = style({ marginInlineStart: "-0.625rem" })

export const description = style({
  ...typeScale.item,
  margin: 0,
  marginBlockStart: "0.6875rem",
  color: vars.color.text.primary,
  whiteSpace: "pre-wrap"
})

export const discussion = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  alignSelf: "flex-start",
  minHeight: "1.75rem",
  marginBlockStart: "0.5rem",
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" }
  }
})

export const discussionIcon = style({ width: "0.9375rem", height: "0.9375rem" })

export const section = style({ display: "flex", flexDirection: "column" })

export const subtitleKey = style({ fontWeight: fontWeight.medium, marginInlineEnd: "0.5rem" })
