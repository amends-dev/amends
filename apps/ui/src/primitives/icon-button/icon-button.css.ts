import { style, styleVariants } from "@vanilla-extract/css";
import { radius } from "../../foundations/radius/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
export const root = style({
  selectors: {
    "&&": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      padding: 0,
    },
    "&[hidden]": { display: "none" },
  },
});
export const shapes = styleVariants({
  square: { selectors: { "&&": { borderRadius: radius.medium } } },
  circle: { selectors: { "&&": { borderRadius: radius.pill } } },
});
export const sizes = styleVariants({
  regular: {
    selectors: {
      "&&": {
        width: "2.75rem",
        height: "2.75rem",
        minWidth: "2.75rem",
        minHeight: "2.75rem",
      },
    },
  },
  compact: {
    selectors: {
      "&&": {
        width: "2.125rem",
        height: "2.125rem",
        minWidth: "2.125rem",
        minHeight: "2.125rem",
      },
    },
    "@media": {
      "(any-pointer: coarse)": {
        selectors: {
          "&&": {
            width: "2.75rem",
            height: "2.75rem",
            minWidth: "2.75rem",
            minHeight: "2.75rem",
          },
        },
      },
    },
  },
});
export const soft = styleVariants({
  neutral: {
    selectors: {
      "&&": { backgroundColor: colorVars.action.hover },
      "&&:hover:enabled": { backgroundColor: colorVars.action.pressed },
      "&&:active:enabled": { backgroundColor: colorVars.action.pressed },
      "&&:disabled": { backgroundColor: colorVars.action.disabled },
    },
  },
  danger: {
    selectors: {
      "&&": { backgroundColor: colorVars.action.danger.hover },
      "&&:hover:enabled": { backgroundColor: colorVars.action.danger.pressed },
      "&&:active:enabled": { backgroundColor: colorVars.action.danger.pressed },
      "&&:disabled": { backgroundColor: colorVars.action.disabled },
    },
  },
});
export const glyph = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  fontFamily: fontFamilies.mono,
  fontSize: "0.8125rem",
  lineHeight: 1,
});
