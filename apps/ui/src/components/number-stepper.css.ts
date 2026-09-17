import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  border: `1.3px dashed ${vars.color.line.control}`,
  borderRadius: vars.radius.pill,
  padding: 3,
});
export const button = style({
  width: 36,
  minHeight: 38,
  border: 0,
  borderRadius: "50%",
  background: "transparent",
  color: vars.color.text.primary,
  cursor: "pointer",
  fontFamily: vars.font.mono,
  ":hover": { background: vars.color.action.hover },
  ":disabled": { opacity: 0.4, cursor: "default" },
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}` },
});
export const input = style({
  width: 48,
  minHeight: 38,
  textAlign: "center",
  border: 0,
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: vars.font.mono,
  fontSize: "0.875rem",
  appearance: "textfield",
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, borderRadius: 4 },
});
globalStyle(`${input}::-webkit-inner-spin-button, ${input}::-webkit-outer-spin-button`, {
  appearance: "none",
  margin: 0,
});
