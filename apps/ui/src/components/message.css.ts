import { type } from "../styles/type.css.ts";
import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  padding: "16px 0",
  minWidth: 0,
  scrollMarginTop: 16,
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 2 },
  },
});
export const content = style({ minWidth: 0, flex: 1 });
export const header = style([
  type.caption,
  {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    color: vars.color.text.muted,
  },
]);
export const body = style({
  marginInlineStart: 34,
  paddingTop: 5,
  maxWidth: "75ch",
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
});
export const footer = style({ marginInlineStart: 34 });
