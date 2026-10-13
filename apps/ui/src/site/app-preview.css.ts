import { style } from "@vanilla-extract/css"
import { media } from "../foundations/layout/tokens.ts"
import { vars } from "../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../foundations/typography/tokens.ts"

export const window = style({
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.canvas,
  boxShadow: "0 28px 48px rgb(0 0 0 / 0.12)",
  textAlign: "start",
  vars: { "--amends-logo-knockout": vars.color.surface.canvas },
  "@media": { [media.desktop]: { height: "42.5rem" } }
})

export const titleBar = style({
  ...typeScale.meta,
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  minHeight: "1.875rem",
  paddingInline: "0.875rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium
})

export const dots = style({ display: "flex", gap: "0.375rem" })

export const dot = style({
  width: "0.625rem",
  height: "0.625rem",
  borderRadius: "50%",
  backgroundColor: vars.color.surface.railSelected
})

// Phones show the open thread alone; tablets add the group beside it; desktops add navigation.
export const body = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "0.5rem",
  minHeight: 0,
  padding: "0 0.5rem 0.5rem",
  "@media": {
    [media.tablet]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 20rem)" },
    [media.desktop]: {
      gridTemplateColumns: "3rem 13.5rem minmax(0, 1fr) minmax(0, 21.5rem)",
      paddingInlineStart: 0
    }
  }
})

export const rail = style({
  display: "none",
  "@media": {
    [media.desktop]: {
      display: "grid",
      alignContent: "start",
      justifyItems: "center",
      gap: "1.25rem",
      paddingBlockStart: "0.75rem",
      color: vars.color.text.muted
    }
  }
})

export const railIcon = style({ width: "1rem", height: "1rem" })

export const sidebar = style({
  display: "none",
  "@media": {
    [media.desktop]: {
      display: "grid",
      alignContent: "start",
      gap: "0.125rem",
      paddingBlockStart: "0.5rem",
      minWidth: 0
    }
  }
})

export const workspace = style({
  ...typeScale.item,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  paddingInline: "0.5rem",
  marginBlockEnd: "0.75rem",
  fontWeight: fontWeight.semibold
})

export const search = style({
  ...typeScale.control,
  padding: "0.3125rem 0.625rem",
  marginBlockEnd: "0.75rem",
  backgroundColor: vars.color.surface.search,
  color: vars.color.text.muted
})

export const item = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: "1.75rem",
  paddingInline: "0.5rem",
  color: vars.color.text.secondary,
  whiteSpace: "nowrap"
})

export const itemSelected = style({
  backgroundColor: vars.color.surface.selected,
  boxShadow: `inset 2px 0 ${vars.color.action.indicator}`,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const itemNested = style({ paddingInlineStart: "1.75rem" })

export const itemIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" })

export const itemLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis"
})

export const sectionLabel = style({
  ...typeScale.meta,
  paddingInline: "0.5rem",
  marginBlockStart: "0.875rem",
  marginBlockEnd: "0.25rem",
  fontWeight: fontWeight.semibold,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: vars.color.text.muted
})

export const pane = style({
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  minWidth: 0,
  minHeight: 0,
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  overflow: "hidden"
})

export const groupPane = style([pane, { display: "none", "@media": { [media.tablet]: { display: "grid" } } }])

export const paneHeader = style({
  display: "grid",
  gap: "0.125rem",
  padding: "0.875rem 1.25rem 0",
  borderBottom: `1px solid ${vars.color.border.divider}`
})

export const paneTitle = style({
  ...typeScale.title,
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  margin: 0,
  fontWeight: fontWeight.semibold
})

export const paneSubtitle = style({
  ...typeScale.control,
  margin: 0,
  paddingBlockEnd: "0.875rem",
  color: vars.color.text.secondary
})

export const tabs = style({ display: "flex", gap: "1.25rem", paddingBlockStart: "0.5rem" })

export const tab = style({
  ...typeScale.control,
  display: "flex",
  gap: "0.375rem",
  paddingBlock: "0.375rem 0.5rem",
  color: vars.color.text.secondary
})

export const tabCurrent = style({
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  boxShadow: `inset 0 -2px ${vars.color.action.indicator}`
})

export const timeline = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  alignContent: "start",
  gap: "1.5rem",
  padding: "1rem 1.25rem",
  overflow: "hidden"
})

export const mention = style({
  paddingInline: "0.125rem",
  backgroundColor: vars.color.surface.mention,
  fontWeight: fontWeight.medium
})

export const composer = style({
  ...typeScale.control,
  minHeight: "3.5rem",
  margin: "0 0.75rem 0.75rem",
  padding: "0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.muted
})
