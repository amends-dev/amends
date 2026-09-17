import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({ listStyle: "none", margin: "12px 0", padding: 0 });
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "5px 12px",
  padding: "8px 0",
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  color: vars.color.text.muted,
});
export const operation = style({
  flex: "1 1 140px",
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.primary,
  overflowWrap: "anywhere",
});
export const outcome = style({
  selectors: {
    '&[data-tone="danger"]': { color: vars.color.status.danger.text },
    '&[data-tone="success"]': { color: vars.color.status.success.text },
  },
});
