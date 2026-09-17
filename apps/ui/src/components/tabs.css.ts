import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";
export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minHeight: 0,
  minWidth: 0,
  selectors: {
    '&[data-split="true"]': {
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) minmax(220px,280px)",
      gap: 30,
      height: "100%",
    },
  },
});
export const list = style({
  alignSelf: "flex-end",
  flexShrink: 0,
  display: "flex",
  width: "fit-content",
  maxWidth: "100%",
  overflowX: "auto",
  gap: 2,
  padding: 3,
  border: `1.3px dashed ${vars.color.line.control}`,
  borderRadius: vars.radius.pill,
  selectors: { [`${root}[data-split="true"] > &`]: { display: "none" } },
});
export const trigger = style({
  border: 0,
  background: "none",
  borderRadius: vars.radius.pill,
  padding: "7px 14px",
  minHeight: 44,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: {
    "&[data-selected]": { background: vars.color.action.selected, color: vars.color.text.primary },
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: -2,
    },
  },
});
export const panel = style({
  minWidth: 0,
  minHeight: 0,
  selectors: {
    "&:not([data-selected])": { display: "none" },
    [`${root}[data-split="true"] > &`]: { display: "block", overflowY: "auto" },
  },
});
