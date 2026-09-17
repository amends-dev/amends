import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";
export const root = style({
  margin: 0,
  padding: 0,
  border: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  minWidth: 0,
});
export const chip = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 14px",
  minHeight: 44,
  borderRadius: vars.radius.pill,
  border: `1.3px dashed ${vars.color.line.control}`,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  cursor: "pointer",
  selectors: {
    '&[data-appearance="solid"]': { padding: "7px 11px" },
    '&[data-appearance="solid"]:has(input:checked)': {
      background: vars.color.action.fill,
      color: vars.color.action.onFill,
      borderColor: vars.color.text.primary,
    },
    "&:has(input:checked)": {
      background: vars.color.action.selected,
      borderColor: vars.color.line.strong,
    },
    "&:has(input:focus-visible)": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
    "&:has(input:disabled)": { opacity: 0.5, cursor: "not-allowed" },
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
