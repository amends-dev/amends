import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const list = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  borderRadius: 10,
  overflow: "hidden",
});
export const item = style({
  display: "flex",
  gap: 11,
  padding: "9px 13px",
  fontSize: 13,
  lineHeight: 1.5,
  background: vars.color.surface.muted,
  selectors: {
    '&[data-kind="added"]': { background: vars.color.status.success.soft },
    '&[data-kind="removed"]': { background: vars.color.status.danger.soft },
    '&[data-kind="changed"], &[data-kind="moved"]': { background: vars.color.status.pending.soft },
  },
});
export const mark = style({ fontFamily: vars.font.mono, flexShrink: 0, width: 12 });
