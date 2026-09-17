import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";

export const root = style({
  display: "grid",
  gap: vars.space[3],
  paddingBlockStart: vars.space[4],
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  minWidth: 0,
});
export const description = style({ color: vars.color.text.secondary, margin: 0 });
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: vars.space[2],
});
