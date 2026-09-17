import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 16px",
  alignItems: "center",
  color: vars.color.text.muted,
});
export const item = style({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  overflowWrap: "anywhere",
});
