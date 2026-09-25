import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { fieldControl } from "../control/field-control.css.ts";
import * as popup from "../select/select.css.ts";
export const root = style({ position: "relative", minWidth: 0 });
export const control = style({ minWidth: 0 });
export const input = style([
  fieldControl,
  {
    fontSize: "0.9375rem",
    selectors: { "&::placeholder": { color: colorVars.text.secondary, opacity: 1 } },
  },
]);
export const listbox = style([popup.listbox, { display: "flex", flexDirection: "column", gap: 1 }]);
export const item = style([
  popup.item,
  {
    minHeight: "2.375rem",
    gap: "0.625rem",
    fontSize: "0.875rem",
    padding: "0.5rem 0.75rem",
    selectors: { "&[data-selected]:not([data-highlighted])": { backgroundColor: "transparent" } },
    "@media": { "(any-pointer: coarse)": { minHeight: "2.75rem" } },
  },
]);
export const description = style({
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const mark = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  width: "1.375rem",
  height: "1.375rem",
  flexShrink: 0,
  borderRadius: radius.pill,
  border: `1.3px solid ${colorVars.line.control}`,
  color: colorVars.text.secondary,
  fontFamily: fontFamilies.mono,
  fontSize: "0.625rem",
  lineHeight: 1,
  selectors: { '&[data-ring="dashed"]': { borderStyle: "dashed" } },
});
export const empty = style({
  padding: "0.625rem 0.75rem",
  fontFamily: fontFamilies.mono,
  fontSize: "0.75rem",
  color: colorVars.text.secondary,
});
