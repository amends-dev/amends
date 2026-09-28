import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

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

// Columns: a 32px provider tile, the connection, and its setup in a 140px column. Phones move the
// setup under the connection.
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

// The list starts 12px under the headings' stitch, so a selected first row leaves it showing.
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

// A 100px row: the name, provider, and endpoint beside the tile; setup and authentication after.
export const row = style({
  ...columns,
  position: "relative",
  display: "grid",
  alignItems: "start",
  boxSizing: "border-box",
  minHeight: "6.25rem",
  padding: "0.875rem 0.75rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
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
      backgroundColor: vars.color.action.indicator,
    },
  },
  "@media": {
    ...columns["@media"],
    [media.mobile]: { ...columns["@media"][media.mobile], minHeight: 0 },
  },
});

export const tile = style({
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  marginBlockStart: "0.25rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.primary,
});

export const tileIcon = style({ width: "1.125rem", height: "1.125rem" });

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const rowName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const rowProvider = style({
  ...typeScale.control,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
});

export const rowEndpoint = style({
  ...typeScale.hint,
  ...ellipsis,
  marginBlockStart: "0.125rem",
  color: vars.color.text.muted,
});

export const rowSetup = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.625rem",
  "@media": { [media.mobile]: { gridColumn: 2, marginBlockStart: "0.5rem" } },
});

export const rowMethod = style({
  ...typeScale.hint,
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "none" } },
});

// Setup: a 14px icon and a medium label, in the caution color unless configured.
export const setup = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4375rem",
  minHeight: "1.5rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: { "&:not([data-setup=configured])": { color: vars.color.text.caution } },
});

export const setupIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const footnote = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary,
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
  minHeight: "6.25rem",
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

// Details: who provides it and its setup, then its name, settings, and key as separate saves.
export const details = style({ display: "flex", flexDirection: "column", gap: "2rem" });

export const identity = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

export const identityRow = style({
  display: "grid",
  gridTemplateColumns: "2.5rem minmax(0, 1fr)",
  alignItems: "start",
  columnGap: "1rem",
});

export const identityTile = style([
  tile,
  { width: "2.5rem", height: "2.5rem", marginBlockStart: 0 },
]);

export const identityIcon = style({ width: "1.5rem", height: "1.5rem" });

export const identityText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const identityName = style({
  ...typeScale.titleTouch,
  ...ellipsis,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const identityDetail = style({
  ...typeScale.control,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
});

export const status = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.75rem",
});

export const note = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

export const form = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

// Save buttons sit at the end, just under the field they save.
export const end = style({ alignSelf: "flex-end", marginBlockStart: "-0.5rem" });

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

export const credential = style({ display: "flex", flexDirection: "column", gap: "0.4375rem" });

export const credentialTitle = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const credentialActions = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  marginBlockStart: "0.5rem",
});

// Removing the connection stays at the bottom of the panel, apart from its setup.
export const danger = style({
  flex: "none",
  display: "flex",
  padding: "1.375rem 1.5rem",
  boxShadow: `inset 0 1px 0 ${vars.color.border.divider}`,
  "@media": {
    [media.mobile]: {
      padding: "0.75rem 1rem",
      paddingBlockEnd: "max(0.75rem, env(safe-area-inset-bottom))",
    },
  },
});

// Dialogs.
export const stack = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

export const intro = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

export const keyForm = style([form, { gap: "1.5rem" }]);

export const providers = style({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const provider = style({
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr) 1rem",
  alignItems: "start",
  columnGap: "0.75rem",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "6.75rem",
  padding: "0.9375rem 0.875rem 1rem 1rem",
  border: `1px solid ${vars.color.border.default}`,
  background: vars.color.surface.raised,
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:hover": { borderColor: vars.color.border.strong },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});

export const providerText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const providerName = style({
  ...typeScale.item,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const providerDescription = style({
  ...typeScale.control,
  marginBlockStart: "0.5625rem",
  color: vars.color.text.secondary,
});

export const providerMethods = style({
  ...typeScale.hint,
  marginBlockStart: "0.75rem",
  color: vars.color.text.muted,
});

export const providerArrow = style({
  width: "1rem",
  height: "1rem",
  marginBlockStart: "0.1875rem",
  color: vars.color.text.secondary,
});

// Back, Cancel, and Finish later sit at the start; the primary action at the end.
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
