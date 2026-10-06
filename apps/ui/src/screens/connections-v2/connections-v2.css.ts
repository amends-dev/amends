import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { knockoutVar } from "../../components/status-mark/status-mark.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export const pane = style({ containerType: "inline-size" });

export const visuallyHidden = style({
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
});

// The header's Add connection reads "Add" on phones.
export const wideOnly = style({ "@media": { [media.mobile]: { display: "none" } } });
export const phoneOnly = style({
  display: "none",
  "@media": { [media.mobile]: { display: "inline" } },
});

// Columns: a 32px tile, marked when the connection cannot be used, the connection, and how it
// authenticates in a 140px column. Phones leave out the authentication.
const columns = {
  gridTemplateColumns: "2rem minmax(0, 1fr) 8.75rem",
  columnGap: "0.75rem",
  "@media": { [media.mobile]: { gridTemplateColumns: "2rem minmax(0, 1fr)" } },
} as const;

export const search = style({
  width: "20rem",
  "@media": { [media.mobile]: { flex: "1 1 0", width: "auto", minWidth: 0 } },
});

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
  "@media": { ...columns["@media"], [media.mobile]: { display: "none" } },
});

export const headingConnection = style({ gridColumn: "1 / 3" });

export const headingsStitch = style({
  gridColumn: "1 / -1",
  marginInline: "-0.75rem",
  marginBlockStart: "0.75rem",
});

// The list starts 12px under the headings' stitch.
export const listing = style({
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  paddingBlockStart: "0.75rem",
  "@media": { [media.mobile]: { paddingBlockStart: "0.5rem" } },
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

// An 80px row: the name and its integration beside the tile; authentication after.
export const row = style({
  ...columns,
  position: "relative",
  display: "grid",
  alignItems: "start",
  boxSizing: "border-box",
  minHeight: "5rem",
  padding: "0.875rem 0.75rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surface.hover,
      vars: { [knockoutVar]: vars.color.surface.hover },
    },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
  "@media": {
    ...columns["@media"],
    [media.mobile]: { ...columns["@media"][media.mobile], minHeight: 0 },
  },
});

export const tile = style({
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.primary,
});

export const rowTile = style([tile, { marginBlockStart: "0.25rem" }]);

// A status patch over the tile's bottom-right corner, as on an avatar.
export const tileStatus = style({
  position: "absolute",
  insetInlineEnd: "-0.25rem",
  insetBlockEnd: "-0.25rem",
});

export const tileIcon = style({ width: "1.125rem", height: "1.125rem" });

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const rowName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const rowIntegration = style({
  ...typeScale.control,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
});

export const rowAuth = style({
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  minHeight: "1.5rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "none" } },
});

export const empty = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "1.5rem 0.75rem",
  "@media": { [media.mobile]: { paddingInline: 0 } },
});

export const emptyText = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary,
});

// Loading keeps the header and shows quiet rows in place of the list.
const pulse = keyframes({ "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.55 } });

export const placeholder = style({
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr)",
  columnGap: "0.75rem",
  alignItems: "start",
  minHeight: "5rem",
  boxSizing: "border-box",
  padding: "1.125rem 0.75rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  "@media": {
    "(prefers-reduced-motion: no-preference)": { animation: `${pulse} 1.6s ease-in-out infinite` },
    [media.mobile]: { paddingInline: 0 },
  },
});

export const placeholderTile = style({
  width: "2rem",
  height: "2rem",
  backgroundColor: vars.color.surface.subtle,
});

export const placeholderLines = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  paddingBlockStart: "0.25rem",
});

export const placeholderLine = style({
  width: "min(16rem, 60%)",
  height: "0.75rem",
  backgroundColor: vars.color.surface.subtle,
});

export const placeholderShort = style([placeholderLine, { width: "min(9rem, 35%)" }]);

// Alerts with a Refresh beside them.
export const alert = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
});

globalStyle(`${alert} > p`, { flex: 1 });

export const alertAction = style({ flex: "none", marginBlockStart: "-0.375rem" });

export const note = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

export const form = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

export const start = style({ alignSelf: "flex-start" });

export const section = style({ display: "flex", flexDirection: "column", gap: "0.75rem" });

export const heading = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: "2rem",
});

export const headingText = style({
  ...typeScale.item,
  margin: 0,
  flex: "none",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const headingStitch = style({ flex: 1, minWidth: "1.5rem" });

// Details: a label over each value.
export const detailList = style({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: 0,
});

export const detail = style({ display: "flex", flexDirection: "column", gap: "0.25rem" });

export const detailName = style({ ...typeScale.hint, color: vars.color.text.secondary });

export const detailValue = style({ ...typeScale.item, margin: 0, color: vars.color.text.primary });

export const link = style({
  color: "inherit",
  textUnderlineOffset: "0.1875rem",
  selectors: { "&:hover": { color: vars.color.text.primary } },
});

export const lines = style({ display: "flex", flexDirection: "column", gap: "0.4375rem" });

export const title = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  marginBlockStart: "0.5rem",
});

// A check's result: its mark beside what it found.
export const health = style({
  display: "grid",
  gridTemplateColumns: "0.625rem minmax(0, 1fr)",
  columnGap: "0.75rem",
  alignItems: "baseline",
});

export const healthMark = style({ alignSelf: "center" });

export const healthLine = style([note, { gridColumn: "2" }]);

// Dialogs.
export const stack = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

export const intro = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

// The integrations to choose from: a row each, divided, under the search.
export const integrations = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
  borderBlockStart: `1px solid ${vars.color.border.divider}`,
});

export const integration = style({
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr)",
  alignItems: "center",
  columnGap: "0.75rem",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "3.75rem",
  padding: "0.625rem 0.75rem",
  border: "none",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  background: "none",
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
});

export const integrationText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const integrationName = style({
  ...typeScale.item,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const integrationDetail = style({
  ...typeScale.hint,
  ...ellipsis,
  marginBlockStart: "0.125rem",
  color: vars.color.text.muted,
});

// The search spans the dialog, as the list under it does.
export const chooseSearch = style({ flex: "1 1 0", minWidth: 0 });

// Back and Cancel sit at the start; the primary action at the end.
export const leading = style({
  minWidth: "8.125rem",
  marginInlineEnd: "auto",
  "@media": { [media.mobile]: { minWidth: 0, marginInlineEnd: 0 } },
});

export const primary = style({
  minWidth: "10.75rem",
  "@media": { [media.mobile]: { minWidth: 0 } },
});

export const confirm = style({ ...typeScale.body, margin: 0, color: vars.color.text.primary });
