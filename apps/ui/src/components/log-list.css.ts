import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const list = style({
  listStyle: "none",
  padding: 0,
  margin: 0,
  containerType: "inline-size",
});
export const row = style({
  display: "grid",
  gridTemplateColumns: "64px minmax(0,1fr)",
  gap: 12,
  paddingBlock: 14,
  "@container": { "(max-width: 480px)": { gridTemplateColumns: "48px minmax(0,1fr)", gap: 8 } },
});
export const time = style({
  paddingTop: 4,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  color: vars.color.text.muted,
});
export const content = style({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  fontFamily: vars.font.mono,
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  overflowWrap: "anywhere",
  selectors: {
    '&[data-narration="true"]': {
      fontFamily: vars.font.sans,
      fontSize: "0.9375rem",
      lineHeight: 1.65,
    },
  },
});
export const detail = style({
  display: "block",
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.7,
  color: vars.color.text.muted,
  selectors: { '&[data-failed="true"]': { color: vars.color.status.danger.text } },
});
export const disclosure = style({ minWidth: 0 });
export const trigger = style({
  width: "100%",
  border: 0,
  padding: 0,
  background: "none",
  color: vars.color.text.primary,
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  textAlign: "left",
  fontFamily: vars.font.mono,
  fontSize: "0.8125rem",
  cursor: "pointer",
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 4 },
});
export const summary = style({ flex: 1, minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.7 });
export const target = style({ color: vars.color.text.secondary });
export const expanded = style({
  padding: "14px 0 0",
  selectors: { "&:not([hidden])": { display: "grid", gap: 12 } },
});
