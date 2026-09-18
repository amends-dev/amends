import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { focus, stroke } from "../tokens/index.ts";

export const field = style({ display: "grid", gap: vars.space[2], minWidth: 0 });
/* One real input drives presentational boxes; the box at the caret is inked. */
export const boxes = style({
  position: "relative",
  display: "flex",
  gap: vars.space[2],
  borderRadius: vars.radius.medium,
  selectors: {
    "&:focus-within": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
export const box = style([
  type.mono,
  {
    flex: 1,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3125rem",
    border: `${stroke.fine}px dashed ${vars.color.line.seam}`,
    borderRadius: vars.radius.medium,
    color: vars.color.text.primary,
    selectors: {
      '&[data-filled="true"]': { background: vars.color.surface.panel },
      '&[data-caret="true"]': { borderColor: vars.color.line.strong },
      '&[data-invalid="true"]': { borderColor: vars.color.status.danger.indicator },
    },
  },
]);
export const input = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  border: "none",
  background: "transparent",
  cursor: "text",
  selectors: { "&:disabled": { cursor: "not-allowed" } },
});
export const error = style({ margin: 0, color: vars.color.status.danger.text });
export const description = style({ margin: 0, color: vars.color.text.muted });
