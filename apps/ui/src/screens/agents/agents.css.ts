import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { knockoutVar } from "../../components/status-mark/status-mark.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, monoFamily, typeScale } from "../../foundations/typography/tokens.ts";

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/** The list lays itself out by the pane's width: columns with room, compact when narrow. */
const wide = "(min-width: 60rem)";

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

// Columns: a 32px avatar with its status patch, then the agent; with room, its model,
// environment, and activity after it.
const compactColumns = "2rem minmax(0, 1fr)";
const wideColumns = "2rem minmax(0, 0.8fr) minmax(0, 1.4fr) minmax(0, 0.95fr) minmax(0, 1fr)";

export const search = style({
  width: "20rem",
  "@media": { [media.mobile]: { flex: "1 1 0", width: "auto", minWidth: 0 } },
});

export const headings = style({
  ...typeScale.meta,
  display: "grid",
  gridTemplateColumns: compactColumns,
  columnGap: "0.75rem",
  flex: "none",
  alignItems: "start",
  boxSizing: "border-box",
  height: "2.5rem",
  margin: "0.75rem 1.5rem 0",
  padding: "0.1875rem 0.75rem 0",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  "@container": { [wide]: { gridTemplateColumns: wideColumns } },
  "@media": { [media.mobile]: { display: "none" } },
});

export const headingAgent = style({ gridColumn: "1 / 3" });

export const wideColumn = style({
  display: "none",
  "@container": { [wide]: { display: "block" } },
});

export const headingsStitch = style({
  gridColumn: "1 / -1",
  marginInline: "-0.75rem",
  marginBlockStart: "0.75rem",
});

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

// A row; compact rows add the model and environment under the name.
export const row = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: compactColumns,
  columnGap: "0.75rem",
  alignItems: "start",
  boxSizing: "border-box",
  minHeight: "5rem",
  padding: "0.8125rem 0.75rem",
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
  "@container": { [wide]: { gridTemplateColumns: wideColumns, alignItems: "center" } },
  "@media": {
    [media.mobile]: { gridTemplateColumns: "2rem minmax(0, 1fr)", minHeight: 0 },
  },
});

export const avatar = style({
  marginBlockStart: "0.1875rem",
  "@container": { [wide]: { marginBlockStart: 0 } },
});

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const rowName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// Under the name when there is no room for columns: the model, then the environment.
export const rowLine = style({
  ...typeScale.control,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
  "@container": { [wide]: { display: "none" } },
  "@media": { [media.mobile]: { whiteSpace: "normal" } },
});

export const rowColumn = style([
  wideColumn,
  { ...typeScale.control, ...ellipsis, color: vars.color.text.secondary },
]);

// Where it is at work: the turn state, then the thread; blank while it is idle.
export const rowActivity = style([
  wideColumn,
  { ...typeScale.control, minWidth: 0, color: vars.color.text.secondary },
]);

export const activityWhere = style({
  ...typeScale.hint,
  ...ellipsis,
  display: "block",
  marginBlockStart: "0.25rem",
  color: vars.color.text.secondary,
});

// A state beside its field: its mark, then its words in the mark's tone.
export const readiness = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4375rem",
  minHeight: "1.5rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: {
    "&[data-mark=attention]": { color: vars.color.status.caution.text },
    "&[data-mark=blocked]": { color: vars.color.status.danger.text },
  },
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
  alignItems: "center",
  minHeight: "5rem",
  boxSizing: "border-box",
  padding: "0 0.75rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  "@media": {
    "(prefers-reduced-motion: no-preference)": { animation: `${pulse} 1.6s ease-in-out infinite` },
  },
});

export const placeholderTile = style({
  width: "2rem",
  height: "2rem",
  backgroundColor: vars.color.surface.subtle,
});

export const placeholderLine = style({
  width: "min(16rem, 60%)",
  height: "0.75rem",
  backgroundColor: vars.color.surface.subtle,
});

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

// A model ID, typed exactly, in the monospace.
export const modelNote = style([note, { fontFamily: monoFamily }]);

export const form = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

// The configuration's fields sit further apart than a form's.
export const fields = style({ display: "flex", flexDirection: "column", gap: "1.75rem" });

export const start = style({ alignSelf: "flex-start" });

export const section = style({ display: "flex", flexDirection: "column", gap: "0.75rem" });

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

// Its turns in progress, each opening its log beside the page.
export const turns = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.25rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const turn = style({
  ...typeScale.item,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  marginInline: "-0.375rem",
  padding: "0.125rem 0.375rem",
  border: "none",
  background: "none",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
});

export const turnWhere = style({ fontWeight: fontWeight.medium });

// The saved configuration: the connection, the model standing out, then the environment.
export const summary = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

export const summaryModel = style({
  ...typeScale.item,
  ...ellipsis,
  margin: 0,
  color: vars.color.text.primary,
  fontFamily: monoFamily,
  fontWeight: fontWeight.medium,
});

export const nameValue = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// A field's state under it: Works, Needs setup, or Can’t run, then what it means.
export const fieldState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.25rem",
  marginBlockStart: "-0.25rem",
});

export const field = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

// Name beside the role; phones stack them.
export const pair = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 7.5rem",
  alignItems: "start",
  gap: "0.625rem",
  "@media": { [media.mobile]: { gridTemplateColumns: "minmax(0, 1fr)", gap: "1.25rem" } },
});

// A member's view of the instructions: the text on a quiet surface.
export const instructions = style({
  ...typeScale.item,
  minHeight: "7rem",
  margin: 0,
  padding: "0.625rem 0.75rem",
  boxSizing: "border-box",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.primary,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

export const factLabel = style({
  ...typeScale.item,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// A saved reasoning level the harness no longer takes, with the way back to the default.
export const repair = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.75rem",
  padding: "1rem",
  backgroundColor: vars.color.status.caution.surface,
  border: `1px solid ${vars.color.status.caution.border}`,
});

export const repairTitle = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// Dialogs.
export const stack = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

export const confirm = style({ ...typeScale.body, margin: 0, color: vars.color.text.primary });

// Back and Cancel sit at the start; the primary action at the end.
export const leading = style({
  minWidth: "7rem",
  marginInlineEnd: "auto",
  "@media": { [media.mobile]: { minWidth: 0, marginInlineEnd: 0 } },
});

export const primary = style({
  minWidth: "10.75rem",
  "@media": { [media.mobile]: { minWidth: 0 } },
});
