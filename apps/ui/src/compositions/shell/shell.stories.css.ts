import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
export const brand = style([
  typographyStyles.heading,
  {
    width: "2.75rem",
    height: "2.75rem",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.medium,
    backgroundColor: colorVars.action.fill,
    color: colorVars.action.onFill,
  },
]);
export const card = style({
  padding: space[4],
  backgroundColor: colorVars.surface.panel,
  borderRadius: radius.medium,
  minWidth: 0,
  overflowWrap: "anywhere",
});
export const note = style({ padding: space[1], minWidth: 0 });
export const entry = style({
  paddingBlock: space[4],
  borderBottom: `1px dashed ${colorVars.line.seam}`,
});
