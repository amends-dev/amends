import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
export const root = style([
  focusVisible,
  {
    appearance: "none",
    display: "inline-grid",
    placeItems: "center",
    boxSizing: "border-box",
    margin: 0,
    width: "1.5rem",
    height: "1.5rem",
    flexShrink: 0,
    verticalAlign: "middle",
    border: `1.4px dashed ${colorVars.line.control}`,
    // Checkbox-owned corners preserve the 5px design reference and scale with the control.
    borderRadius: "0.3125rem",
    backgroundColor: "transparent",
    color: colorVars.text.primary,
    cursor: "pointer",
    selectors: {
      "&::before": {
        content: '""',
        boxSizing: "border-box",
        width: "0.375rem",
        height: "0.75rem",
        borderRight: "0.125rem solid currentColor",
        borderBottom: "0.125rem solid currentColor",
        transform: "translateY(-0.0625rem) rotate(45deg)",
        opacity: 0,
      },
      "&:checked, &:indeterminate": {
        backgroundColor: colorVars.action.fill,
        borderColor: colorVars.action.fill,
        borderStyle: "solid",
        color: colorVars.action.onFill,
      },
      "&:checked::before, &:indeterminate::before": { opacity: 1 },
      "&:indeterminate::before": { width: "0.75rem", height: 0, borderRight: 0, transform: "none" },
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
        appearance: "auto",
        border: "revert",
        selectors: { "&::before": { display: "none" } },
      },
    },
  },
]);
