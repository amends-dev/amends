import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "1.75rem",
  height: "1.75rem",
  boxSizing: "border-box",
  overflow: "hidden",
  borderRadius: radius.pill,
  verticalAlign: "middle",
  fontFamily: fontFamilies.sans,
  fontSize: "0.6875rem",
  fontWeight: 400,
  lineHeight: 1,
  fontStyle: "normal",
  letterSpacing: "normal",
  textTransform: "none",
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { "(forced-colors: active)": { border: "1px solid CanvasText" } },
});
export const kinds = styleVariants({
  human: {
    backgroundColor: colorVars.avatar.human.surface,
    color: colorVars.avatar.human.text,
    fontWeight: 600,
  },
  agent: {
    backgroundColor: "transparent",
    color: colorVars.text.secondary,
    border: `1.4px dashed ${colorVars.line.control}`,
    fontFamily: fontFamilies.mono,
    "@media": { "(forced-colors: active)": { border: "1.4px dashed CanvasText" } },
  },
  contact: {
    backgroundColor: colorVars.avatar.contact.surface,
    color: colorVars.avatar.contact.text,
    borderRadius: "0.4375rem",
  },
  system: {
    backgroundColor: colorVars.avatar.system.surface,
    color: colorVars.avatar.system.text,
    fontFamily: fontFamilies.mono,
    fontSize: "0.75rem",
    "@media": {
      "(forced-colors: active)": {
        backgroundColor: "CanvasText",
        color: "Canvas",
        forcedColorAdjust: "none",
      },
    },
  },
});
export const fallback = style({
  display: "block",
  maxWidth: "100%",
  overflow: "hidden",
  whiteSpace: "nowrap",
  lineHeight: "inherit",
});
