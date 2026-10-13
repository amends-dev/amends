import { globalStyle, style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const

export const loading = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary
})

export const section = style({ display: "flex", flexDirection: "column", gap: "1.125rem" })

export const form = style({ display: "flex", flexDirection: "column", gap: "1.25rem" })

// A section heading: its name, an optional count, a stitch, and an optional action.
export const heading = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: "2rem"
})

export const headingText = style({
  ...typeScale.item,
  margin: 0,
  flex: "none",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const headingStitch = style({ flex: 1, minWidth: "1.5rem" })

export const note = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary })

export const person = style({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  columnGap: "1rem"
})

export const personText = style({ display: "flex", flexDirection: "column", minWidth: 0 })

export const personName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const personDetail = style({
  ...typeScale.hint,
  ...ellipsis,
  color: vars.color.text.secondary
})

export const start = style({ alignSelf: "flex-start" })

// Phones give the ownership action the full width.
export const phoneWide = style({
  alignSelf: "flex-start",
  "@media": { [media.mobile]: { alignSelf: "stretch" } }
})

export const details = style({ display: "flex", flexDirection: "column", gap: "1.25rem" })

export const detail = style({ display: "flex", flexDirection: "column", gap: "0.5rem" })

export const detailLabel = style({ ...typeScale.hint, color: vars.color.text.secondary })

export const detailRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  minHeight: "2rem",
  marginBlock: "-0.25rem"
})

export const detailValue = style({
  ...typeScale.item,
  ...ellipsis,
  color: vars.color.text.primary,
  fontVariantNumeric: "tabular-nums"
})

export const creator = style({ display: "flex", alignItems: "center", gap: "0.75rem" })

export const creatorName = style({
  ...typeScale.item,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

// Alerts with a Refresh beside them.
export const alert = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem"
})

globalStyle(`${alert} > p`, { flex: 1 })

export const alertAction = style({ flex: "none", marginBlockStart: "-0.375rem" })

// Members: the roster and pending invitations. Columns: avatar, name | role | status.
const roster = {
  gridTemplateColumns: "2rem minmax(0, 1fr) 10rem 6rem",
  columnGap: "0.75rem",
  "@media": {
    [media.mobile]: { gridTemplateColumns: "2rem minmax(0, 1fr) 1rem" }
  }
} as const

// Phones keep the search and filter on one row.
export const search = style({ "@media": { [media.mobile]: { flex: "1 1 0", minWidth: 0 } } })

export const headings = style({
  ...roster,
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
  "@media": { ...roster["@media"], [media.mobile]: { display: "none" } }
})

export const headingMember = style({ gridColumn: "1 / 3" })

export const headingsStitch = style({
  gridColumn: "1 / -1",
  marginInline: "-0.75rem",
  marginBlockStart: "0.75rem"
})

export const members = style({
  display: "flex",
  flexDirection: "column",
  gap: "2.625rem",
  "@media": { [media.mobile]: { gap: "2.5rem", paddingBlockStart: "0.5rem" } }
})

export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

export const row = style({
  ...roster,
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
    ...roster["@media"],
    [media.mobile]: { ...roster["@media"][media.mobile], paddingInline: 0 }
  }
})

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 })

export const rowName = style({
  ...typeScale.item,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

// Under the name: "Agent" on wider layouts; the role and kind on phones.
export const rowKind = style({ ...typeScale.meta, ...ellipsis, color: vars.color.text.secondary })

export const rowRole = style({
  ...typeScale.hint,
  ...ellipsis,
  display: "none",
  marginBlockStart: "0.25rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "block" } }
})

export const desktopOnly = style({ "@media": { [media.mobile]: { display: "none" } } })

export const role = style([desktopOnly, { ...typeScale.control, ...ellipsis }])

export const status = style([desktopOnly, { ...typeScale.hint }])

export const open = style({
  display: "none",
  width: "1rem",
  height: "1rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "block" } }
})

export const empty = style({
  ...typeScale.control,
  margin: 0,
  padding: "1.5rem 0.75rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { paddingInline: 0 } }
})

// Pending invitations: 64px rows with a mail tile and Revoke at the end.
export const invitations = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  "@media": { [media.mobile]: { display: "none" } }
})

export const invitation = style({
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "0.75rem",
  boxSizing: "border-box",
  minHeight: "4rem",
  paddingInline: "0.75rem",
  selectors: { "&[data-highlight]": { backgroundColor: vars.color.surface.selected } }
})

globalStyle(`${invitation}[data-highlight] button`, {
  backgroundColor: vars.color.surface.raised,
  boxShadow: `inset 0 0 0 1px ${vars.color.border.default}`
})

export const tile = style({
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary
})

export const tileIcon = style({ width: "1rem", height: "1rem" })

export const invitationText = style({ display: "flex", flexDirection: "column", gap: "0.3125rem" })

export const invitationDetail = style({
  ...typeScale.hint,
  ...ellipsis,
  color: vars.color.text.secondary
})

// Phones show the invitations as one card that opens their history.
export const invitationsCard = style({
  display: "none",
  flexDirection: "column",
  gap: "0.5rem",
  "@media": { [media.mobile]: { display: "flex" } }
})

export const card = style({
  display: "grid",
  gridTemplateColumns: "1.25rem minmax(0, 1fr) 1rem",
  alignItems: "center",
  columnGap: "0.75rem",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "4rem",
  padding: "0 0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  background: vars.color.surface.raised,
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" }
  }
})

export const cardIcon = style({ width: "1.25rem", height: "1.25rem" })

export const cardText = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0
})

// Member details: who they are, their role, access, and membership.
export const member = style({ display: "flex", flexDirection: "column", gap: "2.25rem" })

export const identity = style({ display: "flex", flexDirection: "column", gap: "1.75rem" })

export const identityName = style({
  ...typeScale.title,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const identityDetail = style({
  ...typeScale.hint,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary
})

export const access = style({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: 0,
  padding: 0,
  listStyle: "none"
})

export const accessName = style({
  ...typeScale.item,
  display: "block",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const accessDetail = style({
  ...typeScale.hint,
  display: "block",
  marginBlockStart: "0.4375rem",
  color: vars.color.text.secondary
})

// Invitation history: the address and its role on the left, status then Revoke on the right.
export const historyHeadings = style({
  ...typeScale.meta,
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  marginBlockEnd: "0.75rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium
})

export const historyHeadingRow = style({ display: "flex", justifyContent: "space-between" })

export const historyHeading = style({ textTransform: "uppercase" })

export const historyTotal = style({ ...typeScale.hint, fontWeight: fontWeight.regular })

export const history = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 5.5rem 4.75rem",
  gridTemplateRows: "auto auto",
  columnGap: "1rem",
  rowGap: "0.4375rem",
  alignItems: "start",
  paddingBlock: "0.625rem 1rem",
  "@media": {
    [media.mobile]: { gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "0.75rem" }
  }
})

export const historyAddress = style({
  ...typeScale.item,
  ...ellipsis,
  gridColumn: 1,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium
})

export const historyDetail = style({
  ...typeScale.hint,
  ...ellipsis,
  gridColumn: 1,
  color: vars.color.text.secondary
})

export const historyStatus = style({
  ...typeScale.hint,
  gridColumn: 2,
  gridRow: 1,
  marginBlockStart: "0.125rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  "@media": { [media.mobile]: { textAlign: "end" } }
})

export const historyRevoke = style({
  gridColumn: 3,
  gridRow: "1 / 3",
  alignSelf: "end",
  justifySelf: "end",
  marginBlockEnd: "-0.625rem",
  "@media": { [media.mobile]: { gridColumn: 2, gridRow: 2, marginBlockEnd: 0 } }
})

// The history's Invite people sits at the start of the actions.
export const leading = style({
  marginInlineEnd: "auto",
  "@media": { [media.mobile]: { marginInlineEnd: 0 } }
})

export const phoneHidden = style({ "@media": { [media.mobile]: { display: "none" } } })

export const confirm = style({
  ...typeScale.body,
  margin: 0,
  color: vars.color.text.primary
})

export const stack = style({ display: "flex", flexDirection: "column", gap: "1.25rem" })
