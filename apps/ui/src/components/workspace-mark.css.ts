import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  selectors: { '&[data-size="large"]': { width: 56, height: 56, fontSize: 28 } },
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: "8px",
  background: vars.color.brand.fill,
  color: vars.color.brand.onFill,
  fontFamily: vars.font.serif,
  fontSize: 19,
});
