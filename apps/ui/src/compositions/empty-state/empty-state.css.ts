import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1.125rem",
  minWidth: 0,
  textAlign: "center",
});
export const text = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.4375rem",
  maxWidth: "18.75rem",
  minWidth: 0,
});
export const title = style({
  margin: 0,
  fontFamily: fontFamilies.serif,
  fontSize: "1.4375rem",
  fontWeight: 400,
  lineHeight: 1.2,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
});
export const description = style({
  margin: 0,
  fontSize: "0.84375rem",
  lineHeight: 1.6,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.5625rem",
});
