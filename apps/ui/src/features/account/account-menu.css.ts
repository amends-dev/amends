import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
export const action = style([
  typographyStyles.body,
  {
    width: "100%",
    textAlign: "start",
    borderRadius: radius.medium,
    padding: space[2],
    minHeight: "2.75rem",
    boxSizing: "border-box",
    overflowWrap: "anywhere",
  },
]);
export const link = style([
  action,
  focusVisible,
  {
    display: "flex",
    alignItems: "center",
    gap: space[3],
    textDecoration: "none",
    color: colorVars.text.primary,
    selectors: {
      "&:hover": { backgroundColor: colorVars.action.hover },
      "&:active": { backgroundColor: colorVars.action.pressed },
      "&[hidden]": { display: "none" },
    },
  },
]);
/** A menu button set like the links beside it. */
export const item = style([
  link,
  {
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    selectors: { "&:disabled": { cursor: "default", color: colorVars.text.secondary } },
  },
]);
/** The identity someone signs in as, under their name. */
export const identifier = style([
  typographyStyles.mono,
  { color: colorVars.text.secondary, overflowWrap: "anywhere" },
]);
