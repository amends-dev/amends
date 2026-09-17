import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { focus, stroke } from "../tokens/index.ts";

export const field = style({ display: "grid", gap: vars.space[2], minWidth: 0 });
export const description = style({ margin: 0, color: vars.color.text.muted });
export const error = style({ margin: 0, color: vars.color.status.danger.text });
export const input = style({
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  minHeight: vars.control.touch,
  fontFamily: vars.font.sans,
  fontSize: "1rem",
  lineHeight: 1.5,
  color: vars.color.text.primary,
  padding: `${vars.space[2]} ${vars.space[3]}`,
  background: "transparent",
  border: `${stroke.fine}px dashed ${vars.color.line.control}`,
  borderRadius: vars.radius.medium,
  selectors: {
    "&:focus": { borderColor: vars.color.line.strong },
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
    '&[aria-invalid="true"]': { borderColor: vars.color.status.danger.indicator },
    "&:disabled": {
      cursor: "not-allowed",
      background: vars.color.action.disabled,
      color: vars.color.text.disabled,
    },
    "&::placeholder": { color: vars.color.text.muted, opacity: 1 },
  },
});
export const textarea = style({ resize: "vertical", minHeight: "6rem" });
export const checkboxLabel = style([
  type.bodySmall,
  {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space[3],
    minHeight: vars.control.touch,
    paddingBlock: vars.space[2],
    cursor: "pointer",
    selectors: {
      "&:has(input:disabled)": { cursor: "not-allowed", color: vars.color.text.disabled },
    },
  },
]);
export const checkbox = style({
  width: 20,
  height: 20,
  flexShrink: 0,
  margin: 0,
  marginTop: 1,
  accentColor: vars.color.action.fill,
  cursor: "inherit",
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
export const checkboxText = style({ display: "grid", gap: vars.space[1] });
