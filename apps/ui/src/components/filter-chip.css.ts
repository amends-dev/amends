import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint, focus } from "../tokens/index.ts";

export const group = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 });
export const chip = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space[2],
  minHeight: 34,
  padding: "7px 14px",
  border: `1.3px dashed ${vars.color.line.subtle}`,
  borderRadius: vars.radius.pill,
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  lineHeight: 1.5,
  cursor: "pointer",
  selectors: {
    '&[aria-pressed="true"]': {
      background: vars.color.action.selected,
      color: vars.color.text.primary,
      borderColor: vars.color.line.strong,
    },
    '&[aria-pressed="true"][data-appearance="solid"]': {
      background: vars.color.action.fill,
      color: vars.color.action.onFill,
      borderColor: vars.color.action.fill,
    },
    '&:hover:not(:disabled):not([aria-pressed="true"])': { background: vars.color.action.hover },
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
    "&:disabled": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
  "@media": {
    [`(max-width: ${breakpoint.sidebar - 1}px), (any-pointer: coarse)`]: {
      minHeight: vars.control.touch,
    },
  },
});
