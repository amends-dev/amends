import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  minHeight: 12,
});
export const slot = style({
  width: 34,
  height: 8,
  borderRadius: 4,
  border: `1px dashed ${vars.color.line.control}`,
  selectors: {
    '&[data-filled="true"]': {
      background: vars.color.text.secondary,
      borderColor: vars.color.text.secondary,
      borderStyle: "solid",
    },
  },
  "@media": { "(max-width: 600px)": { width: 26 } },
});
export const more = style({
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.muted,
});
