import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
export const content = style([
  typographyStyles.body,
  {
    zIndex: 30,
    width: "max-content",
    maxWidth: "min(20rem, calc(100vw - 1rem))",
    boxSizing: "border-box",
    padding: `${space[2]} ${space[3]}`,
    borderRadius: radius.medium,
    border: `1px solid ${colorVars.line.control}`,
    backgroundColor: colorVars.surface.panel,
    color: colorVars.text.primary,
    overflowWrap: "anywhere",
    "@media": { "(forced-colors: active)": { borderColor: "CanvasText" } },
  },
]);
