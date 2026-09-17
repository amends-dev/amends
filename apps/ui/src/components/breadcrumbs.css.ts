import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
export const root = style([type.caption, { minWidth: 0, color: vars.color.text.secondary }]);
export const list = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: `${vars.space[1]} ${vars.space[2]}`,
  listStyle: "none",
  padding: 0,
  margin: 0,
});
export const item = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  minWidth: 0,
  maxWidth: "100%",
});
export const separator = style({ color: vars.color.text.muted, flexShrink: 0 });
export const link = style({
  color: "inherit",
  textDecoration: "underline dashed",
  textUnderlineOffset: 4,
  overflowWrap: "anywhere",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 3 },
  },
});
export const current = style({ color: vars.color.text.primary, overflowWrap: "anywhere" });
export const parents = style({ listStyle: "none", margin: 0, padding: vars.space[2] });
export const parent = style([
  link,
  {
    display: "flex",
    alignItems: "center",
    minHeight: vars.control.touch,
    padding: vars.space[2],
    borderRadius: vars.radius.small,
    selectors: { "&:hover": { background: vars.color.action.hover } },
  },
]);
