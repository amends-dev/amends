import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  margin: 0,
  padding: "12px 0",
  overflow: "auto",
  minHeight: 360,
  maxHeight: "65vh",
  borderRadius: 10,
  background: vars.color.surface.recessed,
  fontFamily: vars.font.mono,
  fontSize: 12,
  lineHeight: 1.6,
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}` },
});
export const line = style({
  display: "flex",
  minWidth: "max-content",
  paddingRight: 12,
  selectors: {
    '&[data-kind="added"]': { background: vars.color.status.success.soft },
    '&[data-kind="removed"]': { background: vars.color.status.danger.soft },
  },
});
export const number = style({
  display: "inline-block",
  width: 36,
  textAlign: "right",
  flexShrink: 0,
  paddingRight: 8,
  userSelect: "none",
  color: vars.color.text.muted,
});
export const mark = style({ width: 20, flexShrink: 0 });
