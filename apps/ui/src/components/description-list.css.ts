import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  margin: 0,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.6,
});
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: "3px 16px",
  padding: "10px 0",
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
});
export const label = style({ color: vars.color.text.muted });
export const value = style({ margin: 0, overflowWrap: "anywhere", maxWidth: "100%" });
