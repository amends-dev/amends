import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const content = style([
  focusVisible,
  {
    zIndex: 20,
    boxSizing: "border-box",
    width: "16.375rem",
    maxWidth: "min(calc(100vw - 1rem), var(--kb-popper-content-available-width, 100vw))",
    maxHeight: "var(--kb-popper-content-available-height, calc(100dvh - 1rem))",
    overflowY: "auto",
    overscrollBehavior: "contain",
    overflowWrap: "anywhere",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "1rem",
    border: 0,
    borderRadius: "0.75rem",
    backgroundColor: colorVars.surface.panel,
    color: colorVars.text.primary,
    fontFamily: fontFamilies.sans,
    boxShadow: "0 2px 4px oklch(0.24 0.014 84 / 0.06), 0 10px 28px oklch(0.24 0.014 84 / 0.1)",
    outline: "none",
    "@media": {
      "(forced-colors: active)": {
        backgroundColor: "Canvas",
        color: "CanvasText",
        border: "1px solid CanvasText",
        boxShadow: "none",
        selectors: { "&:focus-visible": { outlineColor: "Highlight" } },
      },
    },
  },
]);

export const title = style({
  margin: 0,
  minWidth: 0,
  fontFamily: fontFamilies.sans,
  fontSize: "0.90625rem",
  fontWeight: 600,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
});

export const description = style({
  margin: 0,
  fontFamily: fontFamilies.sans,
  fontSize: "0.8125rem",
  lineHeight: 1.55,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
