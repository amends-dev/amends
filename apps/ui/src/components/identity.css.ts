import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";

export const root = style({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  maxWidth: "100%",
  verticalAlign: "middle",
});
export const name = style({
  minWidth: 0,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  textTransform: "none",
});
export const compact = style({
  display: "inline-flex",
  flexShrink: 0,
  verticalAlign: "middle",
  borderRadius: "50%",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 3 },
  },
});
export const badge = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  boxSizing: "border-box",
  flexShrink: 0,
  borderRadius: "50%",
  background: vars.color.action.fill,
  color: vars.color.action.onFill,
  fontFamily: vars.font.sans,
  fontSize: "0.8125rem",
  fontWeight: 600,
  lineHeight: 1,
  selectors: {
    '&[data-size="compact"]': { width: 18, height: 18, fontSize: 9 },
    '&[data-size="small"]': { width: 28, height: 28, fontSize: 10 },
    '&[data-size="medium"]': { width: 32, height: 32, fontSize: 11 },
    '&[data-kind="agent"]': {
      border: `1.4px dashed ${vars.color.line.control}`,
      background: "transparent",
      color: vars.color.text.primary,
    },
    '&[data-kind="contact"]': {
      border: `1.4px solid ${vars.color.line.control}`,
      background: "transparent",
      color: vars.color.text.primary,
    },
    '&[data-kind="system"]': {
      border: `1.4px dotted ${vars.color.line.control}`,
      background: vars.color.surface.muted,
      color: vars.color.text.primary,
    },
  },
});
