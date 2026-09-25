import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
export const root = style([
  focusVisible,
  {
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    minWidth: 0,
    maxWidth: "100%",
    minHeight: "2rem",
    padding: "0.4375rem 0.875rem",
    border: `1.3px dashed ${colorVars.line.control}`,
    borderRadius: radius.pill,
    background: "transparent",
    color: colorVars.text.secondary,
    fontFamily: fontFamilies.mono,
    fontSize: "0.75rem",
    lineHeight: 1.25,
    fontWeight: 400,
    overflowWrap: "anywhere",
    cursor: "pointer",
    selectors: {
      '&[aria-pressed="true"]': {
        background: colorVars.action.selected,
        color: colorVars.text.primary,
        borderColor: colorVars.line.strong,
      },
      '&:hover:enabled[aria-pressed="false"]': {
        background: colorVars.action.hover,
        borderColor: colorVars.line.strong,
      },
      "&:active:enabled": { background: colorVars.action.pressed },
      "&:disabled": { color: colorVars.text.disabled, cursor: "not-allowed" },
    },
    "@media": {
      "(any-pointer: coarse)": { minHeight: "2.75rem", minWidth: "2.75rem" },
      "(forced-colors: active)": {
        selectors: {
          '&[aria-pressed="true"]': {
            background: "Highlight",
            color: "HighlightText",
            borderColor: "Highlight",
            forcedColorAdjust: "none",
          },
          "&:disabled": { color: "GrayText" },
        },
      },
    },
  },
]);
