import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
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

// The header's Add environment reads "Add" on phones.
export const wideOnly = style({ "@media": { [media.mobile]: { display: "none" } } });
export const phoneOnly = style({
  display: "none",
  "@media": { [media.mobile]: { display: "inline" } },
});

// Columns: a 32px tile, the environment, and setup; with room, harness and sandbox between.
const compactColumns = "2rem minmax(0, 1fr) 8.75rem";
const wideColumns = "2rem minmax(0, 1fr) 9.5rem 11.625rem 10rem";

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

export const headingEnvironment = style({ gridColumn: "1 / 3" });

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

// An 80px row; compact rows add the harness and sandbox under the name.
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
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
  "@container": { [wide]: { gridTemplateColumns: wideColumns, alignItems: "center" } },
  "@media": {
    [media.mobile]: { gridTemplateColumns: "2rem minmax(0, 1fr)", minHeight: 0 },
  },
});

export const tile = style({
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  marginBlockStart: "0.1875rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.primary,
  "@container": { [wide]: { marginBlockStart: 0 } },
});

export const tileIcon = style({ width: "1.125rem", height: "1.125rem" });

export const rowText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const rowName = style({
  ...typeScale.body,
  ...ellipsis,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const rowRuntime = style({
  ...typeScale.control,
  ...ellipsis,
  marginBlockStart: "0.375rem",
  color: vars.color.text.secondary,
  "@container": { [wide]: { display: "none" } },
});

export const rowColumn = style([
  wideColumn,
  { ...typeScale.control, ...ellipsis, color: vars.color.text.secondary },
]);

export const rowSetup = style({
  display: "flex",
  alignItems: "center",
  minHeight: "1.5rem",
  "@media": { [media.mobile]: { gridColumn: 2, marginBlockStart: "0.5rem" } },
});

// Readiness: Ready with a check, or an issue in the caution color, and how many more follow.
export const readiness = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4375rem",
  minHeight: "1.5rem",
  color: vars.color.text.caution,
  fontWeight: fontWeight.medium,
  selectors: { "&[data-ready]": { color: vars.color.text.secondary } },
});

export const readinessIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const more = style({ color: vars.color.text.secondary, fontWeight: fontWeight.regular });

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

export const alertMessages = style({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: "0.5rem",
});

export const alertAction = style({ flex: "none", marginBlockStart: "-0.375rem" });

export const status = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.75rem",
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

export const runtime = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  margin: 0,
});

export const runtimeRow = style({
  display: "grid",
  gridTemplateColumns: "5.625rem minmax(0, 1fr)",
  columnGap: "1rem",
  alignItems: "baseline",
});

export const runtimeLabel = style({ ...typeScale.hint, color: vars.color.text.secondary });

export const runtimeValue = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// Sandbox settings: the account and template, then variables, commands, and retention.
export const sandboxFields = style({ display: "flex", flexDirection: "column", gap: "1.75rem" });

export const field = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

export const label = style({
  ...typeScale.item,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// A label with an action at its end, such as Create connection.
export const labelRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  marginBlock: "-0.375rem",
});

// A select's error, which sits under it rather than inside its field.
export const fieldAlert = style({ marginBlockStart: "-1rem" });

export const labelAction = style({ ...typeScale.control, fontWeight: fontWeight.medium });

export const emptyAccounts = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.75rem 0.5rem 0.5rem",
  backgroundColor: vars.color.surface.subtle,
  border: `1px solid ${vars.color.border.default}`,
});

export const emptyAccountsTitle = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const variables = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

// A key beside its value and a remove button; phones stack the key over the value.
export const variable = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 0.89fr) minmax(0, 1fr) 2rem",
  alignItems: "start",
  columnGap: "0.5rem",
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "minmax(0, 1fr) 2.75rem",
      rowGap: "0.5rem",
    },
  },
});

export const variableKey = style({ gap: "0.25rem" });

// Variables are typed exactly, so their names and values are set in the monospace.
export const variableName = style({ fontFamily: monoFamily });

export const variableValue = style({
  fontFamily: monoFamily,
  "@media": { [media.mobile]: { gridColumn: 1, gridRow: 2 } },
});

export const variableRemove = style({
  marginBlockStart: "0.375rem",
  "@media": { [media.mobile]: { gridColumn: 2, gridRow: 1 } },
});

export const commands = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

// A numbered command: its index, a two-line field, and a menu to move or remove it.
export const command = style({
  display: "grid",
  gridTemplateColumns: "1.5rem minmax(0, 1fr) 2rem",
  alignItems: "center",
  columnGap: "0.5rem",
});

export const commandIndex = style({
  ...typeScale.hint,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textAlign: "center",
});

export const commandInput = style({
  ...typeScale.item,
  boxSizing: "border-box",
  width: "100%",
  minHeight: "4rem",
  margin: 0,
  padding: "0.625rem 0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  borderRadius: 0,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.primary,
  fontFamily: monoFamily,
  resize: "none",
  selectors: {
    "&:focus": { borderColor: vars.color.border.strong, outline: "none" },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&:disabled": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.disabled },
  },
  "@media": { [media.mobile]: typeScale.bodyTouch },
});

export const commandMenu = style({
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  padding: 0,
  border: "none",
  background: "none",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": { [media.touch]: { width: "2.75rem", height: "2.75rem" } },
});

export const commandMenuIcon = style({ width: "1.125rem", height: "1.125rem" });

// The retention choices sit under their section heading, which names them.
export const hiddenLegend = style({});
globalStyle(`${hiddenLegend} > legend`, {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
});

// A member's read-only view of the sandbox settings.
export const facts = style({ display: "flex", flexDirection: "column", gap: "1.25rem", margin: 0 });

export const fact = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

export const factLabel = style({
  ...typeScale.item,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const factValue = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary,
});

export const readVariables = style({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: 0,
});

export const readVariable = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 0.45fr) minmax(0, 1fr)",
  columnGap: "1rem",
});

export const readKey = style({
  ...typeScale.control,
  ...ellipsis,
  color: vars.color.text.primary,
  fontFamily: monoFamily,
  fontWeight: fontWeight.medium,
});

export const readValue = style({
  ...typeScale.hint,
  ...ellipsis,
  margin: 0,
  color: vars.color.text.secondary,
  fontFamily: monoFamily,
});

export const readCommand = style({
  ...typeScale.control,
  display: "block",
  minHeight: "2.5rem",
  padding: "0.625rem 0.5rem",
  boxSizing: "border-box",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.primary,
  fontFamily: monoFamily,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
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
