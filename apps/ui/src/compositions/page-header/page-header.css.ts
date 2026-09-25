import { globalStyle, style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  minWidth: 0,
});
export const crumbs = style({
  display: "flex",
  alignItems: "center",
  gap: "0.875rem",
  minHeight: "1.125rem",
  fontFamily: fontFamilies.mono,
  fontSize: "0.71875rem",
  lineHeight: 1.5,
  color: colorVars.text.secondary,
});
export const heading = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.75rem 1rem",
  minWidth: 0,
});
export const title = style({
  flex: "1 1 auto",
  minWidth: 0,
  margin: 0,
  fontFamily: fontFamilies.serif,
  fontSize: "2.125rem",
  fontWeight: 400,
  lineHeight: 1.12,
  color: colorVars.text.primary,
  "@media": { "screen and (max-width: 47.999rem)": { fontSize: "1.625rem" } },
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.625rem",
  minWidth: 0,
});
export const meta = style({
  margin: 0,
  fontFamily: fontFamilies.mono,
  fontSize: "0.71875rem",
  lineHeight: 1.5,
  color: colorVars.text.secondary,
});
export const navigation = style({
  display: "none",
  "@media": { "screen and (max-width: 47.999rem)": { display: "flex" } },
});
globalStyle(`${navigation} button`, {
  border: `1.3px dashed ${colorVars.line.control}`,
  borderRadius: radius.pill,
});
