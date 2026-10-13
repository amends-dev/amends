import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, monoFamily, typeScale } from "../../foundations/typography/tokens.ts"

// A turn's row sizes its actions by the width it is given.
export const frame = style({ containerType: "inline-size" })

/** Too narrow for the actions beside the name, as on the smallest phones. */
const narrow = "(max-width: 22.5rem)"

// Avatar, name, and state; the actions at the end; a reason under the name when there is one.
export const row = style({
  display: "grid",
  gridTemplateColumns: "1.5rem minmax(0, 1fr) auto",
  columnGap: "0.5rem",
  rowGap: "0.25rem",
  alignItems: "center",
  "@container": { [narrow]: { gridTemplateColumns: "1.5rem minmax(0, 1fr)" } }
})

export const who = style({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minWidth: 0
})

export const name = style({
  ...typeScale.item,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.agent,
  fontWeight: fontWeight.medium
})

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  justifyContent: "flex-end",
  "@container": { [narrow]: { gridColumn: 2, justifyContent: "flex-start" } }
})

export const detail = style({
  ...typeScale.control,
  gridColumn: "2 / -1",
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "0.75rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { flexDirection: "column", gap: "0.25rem" } }
})

export const problem = style({
  ...typeScale.control,
  gridColumn: "2 / -1",
  color: vars.color.status.caution.text
})

// Text links that read as part of a line.
export const link = style({
  ...typeScale.control,
  display: "inline",
  padding: 0,
  border: "none",
  background: "none",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.primary, textDecoration: "underline" }
  }
})

// The log: a summary, the activity, then cards for output and next steps.
export const log = style({ display: "flex", flexDirection: "column", gap: "1.25rem" })

export const subtitle = style({ display: "flex", alignItems: "center", gap: "0.625rem" })

export const summary = style({
  ...typeScale.control,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.75rem 0.875rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary
})

// The model the turn ran on, as its ID.
export const model = style({ fontFamily: monoFamily })

export const activity = style({
  display: "flex",
  flexDirection: "column",
  gap: "1.125rem",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

// A dot, the title and its time, and a line under the title.
export const item = style({
  display: "grid",
  gridTemplateColumns: "0.75rem minmax(0, 1fr) auto",
  columnGap: "0.5rem",
  rowGap: "0.25rem",
  alignItems: "baseline"
})

export const dot = style({
  width: "0.3125rem",
  height: "0.3125rem",
  borderRadius: "50%",
  backgroundColor: vars.color.text.muted,
  alignSelf: "center"
})

export const itemTitle = style({
  ...typeScale.control,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const itemTime = style({ ...typeScale.meta, color: vars.color.text.secondary })

export const itemText = style({
  ...typeScale.control,
  gridColumn: "2 / -1",
  color: vars.color.text.secondary,
  overflowWrap: "anywhere"
})

// A bordered card for output and next steps; caution for what needs fixing.
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  padding: "0.75rem 0.875rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel
})

export const cautionCard = style([
  card,
  {
    borderColor: vars.color.status.caution.border,
    backgroundColor: vars.color.status.caution.surface
  }
])

export const cardHead = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem"
})

export const cardTitle = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const cardLabel = style({ ...typeScale.meta, color: vars.color.text.secondary })

export const cardText = style({
  ...typeScale.body,
  color: vars.color.text.primary
})

export const cardNote = style({
  ...typeScale.hint,
  margin: 0,
  color: vars.color.text.secondary,
  // On the caution fill, secondary text falls short of contrast.
  selectors: { [`${cautionCard} &`]: { color: vars.color.text.primary } }
})

// What follows the log at its foot: live, paused with new activity, reconnecting, or a next step.
export const footer = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: "2.25rem",
  color: vars.color.text.secondary
})

export const footerIcon = style({ width: "0.875rem", height: "0.875rem", flex: "none" })

export const jump = style({ width: "100%", justifyContent: "center" })

export const loading = style({ ...typeScale.control, color: vars.color.text.secondary })
