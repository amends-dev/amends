import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

// Tooltip-owned dimensions match the Primitives v2 compact label; rem units retain text scaling.
export const content = style({
  zIndex: 30,
  width: "max-content",
  maxWidth: "min(20rem, calc(100vw - 1rem), var(--kb-popper-content-available-width, 100vw))",
  boxSizing: "border-box",
  fontFamily: fontFamilies.mono,
  fontSize: "0.71875rem",
  fontWeight: 400,
  lineHeight: 15 / 11.5,
  letterSpacing: "0em",
  padding: "0.375rem 0.6875rem",
  borderRadius: "0.4375rem",
  border: 0,
  backgroundColor: colorVars.surface.tooltip,
  color: colorVars.text.onTooltip,
  boxShadow: "0 2px 4px oklch(0.24 0.014 84 / 0.1)",
  overflowWrap: "anywhere",
  "@media": {
    "(forced-colors: active)": {
      backgroundColor: "Canvas",
      color: "CanvasText",
      border: "1px solid CanvasText",
      boxShadow: "none",
    },
  },
});
