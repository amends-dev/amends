import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const list = style({
  listStyle: "none",
  margin: 0,
  padding: "8px 0 0 18px",
  display: "grid",
  gap: 12,
});
export const row = style({
  display: "grid",
  gridTemplateColumns: "12px 50px minmax(0,1fr)",
  gap: 8,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.6,
  overflowWrap: "anywhere",
});
export const observed = style({ color: vars.color.text.muted });
