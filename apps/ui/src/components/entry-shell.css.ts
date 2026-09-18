import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint, focus, stroke } from "../tokens/index.ts";

const compact = `(max-width: ${breakpoint.navigation - 1}px)`;

/* The one product surface with no workspace behind it: no rail, no persimmon in the chrome. */
export const shell = style({
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
});
export const chrome = style({
  flex: "none",
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  padding: `${vars.space[5]} ${vars.space[6]}`,
  "@media": { [compact]: { padding: vars.space[4] } },
});
export const home = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  flex: 1,
  minWidth: 0,
  color: "inherit",
  textDecoration: "none",
  borderBottom: "none",
  borderRadius: vars.radius.small,
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
export const account = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  flex: "none",
  minWidth: 0,
});
export const accountName = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "40vw",
});
export const body = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: `${vars.space[8]} ${vars.space[6]} ${vars.space[12]}`,
  selectors: { '&[data-align="start"]': { justifyContent: "flex-start" } },
  "@media": { [compact]: { padding: `${vars.space[5]} ${vars.space[4]} ${vars.space[8]}` } },
});
export const column = style({
  width: "100%",
  maxWidth: 420,
  display: "flex",
  flexDirection: "column",
  gap: vars.space[6],
  selectors: { '&[data-width="wide"]': { maxWidth: 560 } },
});
export const intro = style({ display: "flex", flexDirection: "column", gap: vars.space[2] });
export const foot = style({
  flex: "none",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: `${vars.space[2]} ${vars.space[4]}`,
  padding: `${vars.space[5]} ${vars.space[6]}`,
  borderTop: `${stroke.hairline}px dashed ${vars.color.line.subtle}`,
  "@media": { [compact]: { padding: vars.space[4] } },
});
export const note = style({ flex: 1, minWidth: 120 });
