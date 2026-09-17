import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  gap: 14,
  alignItems: "center",
  paddingBlock: 16,
  color: vars.color.text.muted,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
});
export const line = style({ flex: 1, borderTop: `1px dashed ${vars.color.line.subtle}` });
