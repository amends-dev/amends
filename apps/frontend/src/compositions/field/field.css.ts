import { style } from "@vanilla-extract/css";
import { space } from "../../foundations/spacing/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";

export const root = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[2],
  minWidth: 0,
  overflowWrap: "anywhere",
});
export const label = style([typographyStyles.body, { color: colorVars.text.primary }]);
export const error = style({ color: colorVars.text.invalid });
