import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
export const root = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space[1],
  padding: space[1],
  border: `1px dashed ${colorVars.line.control}`,
  borderRadius: radius.medium,
  width: "fit-content",
  maxWidth: "100%",
  boxSizing: "border-box",
});
export const link = style([
  typographyStyles.mono,
  focusVisible,
  {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "2.75rem",
    paddingInline: space[4],
    color: colorVars.text.secondary,
    textDecoration: "none",
    borderRadius: radius.pill,
    boxSizing: "border-box",
    overflowWrap: "anywhere",
    selectors: {
      '&[aria-current="page"]': {
        background: colorVars.text.primary,
        color: colorVars.surface.canvas,
      },
      '&:not([aria-current="page"]):hover': {
        background: colorVars.action.hover,
        color: colorVars.text.primary,
      },
    },
  },
]);
