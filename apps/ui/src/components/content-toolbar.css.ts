import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";

export const root = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space[3],
  minWidth: 0,
});
export const filters = style({ minWidth: 0, maxWidth: "100%" });
export const view = style({
  display: "flex",
  justifyContent: "flex-end",
  marginInlineStart: "auto",
  minWidth: 0,
  maxWidth: "100%",
});
