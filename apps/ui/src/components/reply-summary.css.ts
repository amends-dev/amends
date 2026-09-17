import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  border: 0,
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  padding: "6px 0",
  cursor: "pointer",
  textAlign: "left",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 3 },
  },
});
export const note = style({ color: vars.color.text.muted });
