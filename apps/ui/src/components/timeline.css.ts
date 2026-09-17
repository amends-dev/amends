import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({ listStyle: "none", margin: 0, padding: 0 });
export const item = style({ minWidth: 0 });
export const event = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: "12px 0",
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.6,
  color: vars.color.text.muted,
});
export const seam = style({
  flex: 1,
  minWidth: 20,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
