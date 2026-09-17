import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
export const group = style({ margin: 0, padding: 0, border: 0, minWidth: 0 });
export const legend = style([
  type.label,
  { color: vars.color.text.muted, padding: 0, marginBottom: vars.space[3] },
]);
export const options = style({
  display: "flex",
  gap: vars.space[2],
  flexWrap: "wrap",
  selectors: { '&[data-stacked="true"]': { flexDirection: "column" } },
});
export const cardHeading = style({ display: "flex", justifyContent: "space-between", gap: 12 });
export const radio = style({ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0 });
export const card = style([
  type.caption,
  {
    position: "relative",
    flex: "1 1 4rem",
    minWidth: 0,
    display: "grid",
    gap: vars.space[2],
    padding: "0.5625rem",
    border: `1.3px dashed ${vars.color.line.control}`,
    borderRadius: 12,
    cursor: "pointer",
    selectors: {
      '&[data-compact="true"]': {
        flex: "0 1 auto",
        gap: 3,
        fontSize: "0.71875rem",
        minHeight: 44,
        maxWidth: "100%",
        overflowWrap: "anywhere",
      },
      "&:has(input:checked)": {
        background: vars.color.action.selected,
        borderColor: vars.color.line.strong,
      },
      "&:has(input:focus-visible)": {
        outline: `2px solid ${vars.color.focus.ring}`,
        outlineOffset: 2,
      },
      "&:has(input:disabled)": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
  },
]);

export const description = style({
  fontFamily: vars.font.mono,
  fontSize: "0.625rem",
  color: vars.color.text.muted,
});
