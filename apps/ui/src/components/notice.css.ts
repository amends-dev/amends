import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  selectors: {
    '&[data-tone="danger"]': {
      background: vars.color.status.danger.soft,
      alignItems: "flex-start",
    },
  },
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: 20,
  borderRadius: 12,
  background: vars.color.action.selected,
  color: vars.color.text.secondary,
  fontFamily: vars.font.sans,
  fontSize: "0.875rem",
  lineHeight: 1.6,
});
export const indicator = style({ display: "flex", flexShrink: 0 });
