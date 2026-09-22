import { style, styleVariants } from "@vanilla-extract/css";
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

export const variants = styleVariants({
  primary: {
    backgroundColor: colorVars.action.fill,
    color: colorVars.action.onFill,
    selectors: {
      "&:hover:enabled": { backgroundColor: colorVars.action.fillHover },
      "&:active:enabled": { backgroundColor: colorVars.action.fillPressed },
    },
  },
  secondary: {
    backgroundColor: "transparent",
    color: colorVars.text.primary,
    borderStyle: "dashed",
    borderColor: colorVars.line.control,
    selectors: {
      "&:hover:enabled": {
        backgroundColor: colorVars.action.hover,
        borderColor: colorVars.line.strong,
      },
      // Keyboard presses also need the strong border, even without hover.
      "&:active:enabled": {
        backgroundColor: colorVars.action.pressed,
        borderColor: colorVars.line.strong,
      },
    },
  },
});
