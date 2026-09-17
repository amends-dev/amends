import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({ display: "grid", gap: 10, minWidth: 0 });
export const list = style({ listStyle: "none", margin: 0, padding: 0 });
export const row = style({
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  minHeight: 42,
  paddingBlock: 9,
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
});
export const number = style({
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.muted,
});
export const command = style({
  fontFamily: vars.font.mono,
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
});
export const add = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
});
