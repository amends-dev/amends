import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  gap: vars.space[2],
});
export const header = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space[3],
  minWidth: 0,
});
export const mode = style({ marginLeft: "auto", minWidth: 0, maxWidth: "100%" });
export const enclosure = style({
  display: "grid",
  minWidth: 0,
  gap: vars.space[2],
  padding: vars.space[3],
  borderRadius: vars.radius.medium,
  border: `1px dashed ${vars.color.line.control}`,
  selectors: {
    "&:has(textarea:focus-visible)": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
    '&[data-invalid="true"]': { borderColor: vars.color.status.danger.indicator },
    '&[data-disabled="true"]': { background: vars.color.action.disabled },
  },
});
export const input = style({
  border: 0,
  borderRadius: 0,
  padding: 0,
  minHeight: "4.5rem",
  maxHeight: "min(18rem, 35dvh)",
  selectors: {
    "&:focus-visible": { outline: "none" },
    "&:read-only:not(:disabled)": { cursor: "progress" },
  },
});
export const footer = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space[3],
});
export const submit = style({ marginLeft: "auto", flexShrink: 0 });
