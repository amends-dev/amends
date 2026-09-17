import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint } from "../tokens/index.ts";
const mobile = `(max-width: ${breakpoint.navigation - 1}px)`;
export const list = style({ listStyle: "none", margin: 0, padding: 0 });
export const row = style({
  display: "grid",
  gridTemplateColumns: "7px 44px 124px minmax(0,1fr) 100px",
  gap: "5px 12px",
  alignItems: "baseline",
  padding: "11px 2px",
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.5,
  color: vars.color.text.muted,
  "@media": { [mobile]: { gridTemplateColumns: "7px auto auto minmax(0,1fr)", columnGap: 10 } },
});
export const indicator = style({ gridColumn: 1, gridRow: 1, alignSelf: "center" });
export const time = style({ gridColumn: 2, gridRow: 1, "@media": { [mobile]: { gridRow: 2 } } });
export const event = style({
  gridColumn: 3,
  gridRow: 1,
  color: vars.color.text.secondary,
  "@media": { [mobile]: { gridRow: 2 } },
});
export const subject = style({
  gridColumn: 4,
  gridRow: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontFamily: vars.font.sans,
  fontSize: "0.8125rem",
  color: vars.color.text.secondary,
  "@media": { [mobile]: { gridColumn: "2 / -1" } },
});
export const actor = style({
  gridColumn: 5,
  gridRow: 1,
  textAlign: "right",
  overflowWrap: "anywhere",
  "@media": { [mobile]: { gridColumn: 4, gridRow: 2, textAlign: "left" } },
});
