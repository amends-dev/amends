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

// The header's Add agent reads "Add" on phones.
export const wideOnly = style({ "@media": { [media.mobile]: { display: "none" } } });
export const phoneOnly = style({
  display: "none",
  "@media": { [media.mobile]: { display: "inline" } },
});

// Columns: a 32px avatar, the agent, its harness in a 160px column, and its model in a 192px one.
// Phones keep the avatar and the agent, with the harness and model under its name.
const columns = {
  gridTemplateColumns: "2rem minmax(0, 1fr) 10rem 12rem",
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

export const headingAgent = style({ gridColumn: "1 / 3" });

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

// An 80px row: the name beside the avatar, then the harness and the model, each over its detail.
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

export const rowAvatar = style({ marginBlockStart: "0.25rem" });

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const rowName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// The harness and model under the name, on phones only.
export const rowUnder = style({
  ...typeScale.control,
  ...ellipsis,
  display: "none",
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "block" } },
});

export const rowColumn = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
  paddingBlockStart: "0.125rem",
  "@media": { [media.mobile]: { display: "none" } },
});

export const rowValue = style({
  ...typeScale.control,
  ...ellipsis,
  color: vars.color.text.primary,
});

export const rowDetail = style({
  ...typeScale.hint,
  ...ellipsis,
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
  minHeight: "5rem",
  boxSizing: "border-box",
  padding: "1.125rem 0.75rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  "@media": {
    "(prefers-reduced-motion: no-preference)": { animation: `${pulse} 1.6s ease-in-out infinite` },
    [media.mobile]: { paddingInline: 0 },
  },
});

export const placeholderAvatar = style({
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

// What keeps an agent from running, one line each, inside its notice.
export const issues = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  margin: 0,
  paddingInlineStart: "1.125rem",
});

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

export const actions = style({ display: "flex", alignItems: "center", gap: "0.75rem" });

// Dialogs.
export const stack = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

// Cancel sits at the start; the primary action at the end.
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
