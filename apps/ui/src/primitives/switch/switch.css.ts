import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
export const root = style([
  focusVisible,
  {
    appearance: "none",
    position: "relative",
    boxSizing: "border-box",
    margin: 0,
    width: "2.75rem",
    height: "1.5rem",
    flexShrink: 0,
    verticalAlign: "middle",
    border: `1.4px dashed ${colorVars.line.control}`,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    color: colorVars.text.primary,
    cursor: "pointer",
    selectors: {
      "&::before": {
        content: '""',
        position: "absolute",
        insetInlineStart: "0.1875rem",
        top: "50%",
        transform: "translateY(-50%)",
        width: "1rem",
        height: "1rem",
        borderRadius: radius.pill,
        backgroundColor: "currentColor",
      },
      "&:checked": {
        backgroundColor: colorVars.action.fill,
        borderColor: colorVars.action.fill,
        borderStyle: "solid",
        color: colorVars.action.onFill,
      },
      "&:checked::before": { insetInlineStart: "calc(100% - 1.1875rem)" },
      "&:hover:enabled": { borderColor: colorVars.line.strong },
      "&:disabled": {
        color: colorVars.text.disabled,
        backgroundColor: colorVars.action.disabled,
        borderColor: colorVars.line.control,
        cursor: "not-allowed",
        opacity: 1,
      },
    },
    "@media": {
      "(forced-colors: active)": {
        forcedColorAdjust: "none",
        selectors: {
          "&:enabled, &:hover:enabled": {
            backgroundColor: "Canvas",
            borderColor: "ButtonText",
            color: "ButtonText",
          },
          "&:checked:enabled, &:checked:hover:enabled": {
            backgroundColor: "Highlight",
            borderColor: "Highlight",
            color: "HighlightText",
          },
          "&:disabled": { backgroundColor: "Canvas", borderColor: "GrayText", color: "GrayText" },
          "&:focus-visible": { outlineColor: "Highlight" },
        },
      },
    },
  },
]);
