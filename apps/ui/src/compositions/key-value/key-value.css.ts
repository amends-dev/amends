import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
export const root = style({ margin: 0, minWidth: 0 });
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  gap: `${space[2]} ${space[5]}`,
  paddingBlock: space[3],
  borderBottom: `1px dashed ${colorVars.line.seam}`,
  minWidth: 0,
});
export const label = style([
  typographyStyles.mono,
  { color: colorVars.text.secondary, flex: "0 1 10rem", overflowWrap: "anywhere" },
]);
export const value = style([
  typographyStyles.body,
  { flex: "1 1 14rem", minWidth: 0, margin: 0, overflowWrap: "anywhere" },
]);
