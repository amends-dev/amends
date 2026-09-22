import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import type { ActionToneColors } from "../../foundations/color/tokens.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";

export const root = style([
  typographyStyles.mono,
  focusVisible,
  {
    appearance: "none",
    position: "relative",
    display: "inline-block",
    boxSizing: "border-box",
    verticalAlign: "middle",
    minWidth: 0,
    maxWidth: "100%",
    // Button-owned dimensions: one regular size, scaling with the reader's root text size.
    minHeight: "2.5rem",
    padding: `${space[2]} ${space[5]}`,
    border: "1px solid transparent",
    borderRadius: radius.pill,
    textAlign: "center",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    cursor: "pointer",
    selectors: {
      '&[data-pending="true"]:enabled': { cursor: "progress" },
      "&:disabled": {
        backgroundColor: colorVars.action.disabled,
        color: colorVars.text.disabled,
        borderColor: "transparent",
        cursor: "not-allowed",
        opacity: 1,
      },
    },
    "@media": {
      "(any-pointer: coarse)": { minHeight: "2.75rem", minWidth: "2.75rem" },
    },
  },
]);

function createVariants(action: ActionToneColors) {
  return styleVariants({
    primary: {
      backgroundColor: action.fill,
      color: action.onFill,
      selectors: {
        '&:hover:enabled:not([data-pending="true"])': { backgroundColor: action.fillHover },
        '&:active:enabled:not([data-pending="true"])': {
          backgroundColor: action.fillPressed,
        },
      },
    },
    secondary: {
      backgroundColor: "transparent",
      color: action.text,
      borderStyle: "dashed",
      borderColor: action.border,
      selectors: {
        '&:hover:enabled:not([data-pending="true"])': {
          backgroundColor: action.hover,
          borderColor: action.borderStrong,
        },
        // Keyboard presses also need the strong border, even without hover.
        '&:active:enabled:not([data-pending="true"])': {
          backgroundColor: action.pressed,
          borderColor: action.borderStrong,
        },
      },
    },
    ghost: {
      backgroundColor: "transparent",
      color: action.text,
      selectors: {
        '&:hover:enabled:not([data-pending="true"])': { backgroundColor: action.hover },
        '&:active:enabled:not([data-pending="true"])': { backgroundColor: action.pressed },
      },
    },
  });
}

export const variants = {
  neutral: createVariants({
    fill: colorVars.action.fill,
    fillHover: colorVars.action.fillHover,
    fillPressed: colorVars.action.fillPressed,
    onFill: colorVars.action.onFill,
    text: colorVars.text.primary,
    border: colorVars.line.control,
    borderStrong: colorVars.line.strong,
    hover: colorVars.action.hover,
    pressed: colorVars.action.pressed,
  }),
  danger: createVariants(colorVars.action.danger),
};

// Button-owned running stitch, matching the existing UI without importing its motion catalog.
const travel = keyframes({ to: { strokeDashoffset: -26 } });
export const pendingIndicator = style({
  position: "absolute",
  inset: 4,
  width: "calc(100% - 8px)",
  height: "calc(100% - 8px)",
  overflow: "visible",
  pointerEvents: "none",
});
export const pendingPath = style({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeDasharray: "7 6",
  animation: `${travel} 2600ms linear infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } },
});
