import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const bar = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px 14px",
  padding: "12px 16px",
  borderRadius: 14,
  background: vars.color.surface.panel,
  boxShadow: vars.shadow.overlay,
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.primary,
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  marginLeft: "auto",
});
