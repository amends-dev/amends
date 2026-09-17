import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const list = style({ listStyle: "none", padding: 0, margin: 0 });
export const item = style({
  padding: "10px 0",
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
});
export const trigger = style({
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  width: "100%",
  padding: "4px 0",
  border: 0,
  background: "none",
  color: vars.color.text.primary,
  textAlign: "left",
  cursor: "pointer",
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 3 },
});
export const dot = style({
  width: 6,
  height: 6,
  flexShrink: 0,
  border: `1px dashed ${vars.color.line.control}`,
  borderRadius: "50%",
  selectors: {
    '&[data-matched="true"]': {
      background: vars.color.status.success.text,
      borderColor: vars.color.status.success.text,
    },
  },
});
export const index = style({
  fontFamily: vars.font.mono,
  fontSize: "0.625rem",
  color: vars.color.text.muted,
  whiteSpace: "nowrap",
});
export const title = style({ flex: 1, fontFamily: vars.font.sans, fontSize: "0.75rem" });
export const result = style({
  fontFamily: vars.font.mono,
  fontSize: "0.625rem",
  color: vars.color.text.muted,
});
