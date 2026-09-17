import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint, focus } from "../tokens/index.ts";

export const group = style({
  margin: 0,
  padding: 3,
  border: `1.3px dashed ${vars.color.line.control}`,
  borderRadius: vars.radius.pill,
  minWidth: 0,
  maxWidth: "100%",
  width: "fit-content",
});
export const options = style({ display: "flex", gap: 2, overflowX: "auto" });
export const fullLabel = style({
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { display: "none" } },
});
export const compactLabel = style({
  display: "none",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { display: "inline" } },
});
export const option = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  flexShrink: 0,
  minHeight: 34,
  padding: "7px 14px",
  borderRadius: vars.radius.pill,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  lineHeight: 1.5,
  color: vars.color.text.secondary,
  cursor: "pointer",
  whiteSpace: "nowrap",
  selectors: {
    "&:has(input:checked)": {
      background: vars.color.action.selected,
      color: vars.color.text.primary,
    },
    "&:hover:not(:has(input:disabled, input:checked))": { background: vars.color.action.hover },
    "&:has(input:focus-visible)": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: -2,
    },
    "&:has(input:disabled)": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
  "@media": {
    [`(max-width: ${breakpoint.sidebar - 1}px), (any-pointer: coarse)`]: {
      minHeight: vars.control.touch,
    },
  },
});
export const input = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "inherit",
});
