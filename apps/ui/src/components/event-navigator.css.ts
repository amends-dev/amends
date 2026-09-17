import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({ display: "flex", flexWrap: "wrap", gap: 8, paddingBlock: 12 });
export const item = style({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 40,
  padding: "8px 14px",
  borderRadius: 999,
  border: `1px dashed ${vars.color.line.control}`,
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  cursor: "pointer",
  selectors: {
    '&[aria-current="step"]': { background: vars.color.surface.muted },
    "&:hover": { background: vars.color.action.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 2 },
  },
});
