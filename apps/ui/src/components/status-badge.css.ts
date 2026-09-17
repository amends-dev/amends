import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 14px",
  borderRadius: vars.radius.pill,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  lineHeight: 1.4,
  color: vars.color.text.secondary,
  background: vars.color.action.selected,
  whiteSpace: "nowrap",
  selectors: {
    '&[data-tone="danger"]': {
      background: vars.color.status.danger.soft,
      color: vars.color.status.danger.text,
    },
    '&[data-tone="pending"]': {
      background: vars.color.status.pending.soft,
      color: vars.color.status.pending.text,
    },
    '&[data-tone="success"]': {
      background: vars.color.status.success.soft,
      color: vars.color.status.success.text,
    },
  },
});
