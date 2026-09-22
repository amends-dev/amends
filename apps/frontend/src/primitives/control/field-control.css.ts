import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const fieldControl = style([
  focusVisible,
  {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    minHeight: "2.75rem",
    fontFamily: fontFamilies.sans,
    fontSize: "1rem",
    fontWeight: 400,
    lineHeight: 1.5,
    color: colorVars.text.primary,
    padding: `${space[2]} ${space[3]}`,
    backgroundColor: "transparent",
    border: `1.4px dashed ${colorVars.line.control}`,
    borderRadius: radius.medium,
    selectors: {
      "&:focus:enabled": { borderColor: colorVars.line.strong },
      '&[aria-invalid]:not([aria-invalid="false"]):enabled': {
        borderColor: colorVars.line.invalid,
      },
      "&:disabled": {
        cursor: "not-allowed",
        backgroundColor: colorVars.action.disabled,
        color: colorVars.text.disabled,
        opacity: 1,
      },
    },
  },
]);
