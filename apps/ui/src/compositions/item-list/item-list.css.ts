import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";

export const root = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
  minWidth: 0,
  borderRadius: radius.medium,
});
export const variants = styleVariants({
  panel: { background: colorVars.surface.panel },
  outline: { border: `1px dashed ${colorVars.line.control}` },
});
export const item = style({
  minWidth: 0,
  selectors: { "& + &": { borderTop: `1px dashed ${colorVars.line.seam}` } },
});
export const link = style([
  focusVisible,
  {
    display: "flex",
    alignItems: "center",
    gap: space[4],
    padding: space[4],
    minHeight: "4rem",
    boxSizing: "border-box",
    width: "100%",
    borderRadius: radius.medium,
    color: colorVars.text.primary,
    textDecoration: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&:hover": { background: colorVars.action.hover },
      "&:active": { background: colorVars.action.pressed },
    },
  },
]);
export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: space[1],
  flex: 1,
  minWidth: 0,
});
export const title = style([typographyStyles.body, { fontWeight: 600 }]);
export const description = style([typographyStyles.mono, { color: colorVars.text.secondary }]);
