import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style([
  focusVisible,
  {
    appearance: "none",
    boxSizing: "border-box",
    width: "1.5rem",
    height: "1.5rem",
    flexShrink: 0,
    margin: 0,
    verticalAlign: "middle",
    border: `1.4px dashed ${colorVars.line.control}`,
    borderRadius: radius.pill,
    color: colorVars.text.primary,
    backgroundColor: "transparent",
    cursor: "pointer",
    selectors: {
      "&:checked": {
        backgroundImage: "radial-gradient(circle, currentColor 0 0.3125rem, transparent 0.3125rem)",
      },
      "&:checked:enabled": { borderColor: colorVars.line.strong },
      "&:hover:enabled": {
        backgroundColor: colorVars.action.hover,
        borderColor: colorVars.line.strong,
      },
      "&:active:enabled": {
        backgroundColor: colorVars.action.pressed,
        borderColor: colorVars.line.strong,
      },
      "&:disabled": {
        color: colorVars.text.disabled,
        backgroundColor: colorVars.action.disabled,
        cursor: "not-allowed",
        opacity: 1,
      },
    },
    // Native drawing preserves the checked indicator when forced colors remove CSS images.
    "@media": {
      "(forced-colors: active)": {
        appearance: "auto",
        backgroundImage: "none",
        border: "revert",
        accentColor: "auto",
        selectors: { "&:checked": { backgroundImage: "none" } },
      },
    },
  },
]);
