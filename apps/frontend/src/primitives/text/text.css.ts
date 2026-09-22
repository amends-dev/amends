import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";

export const root = style({ margin: 0 });
export const tones = styleVariants({
  inherit: { color: "inherit" },
  primary: { color: colorVars.text.primary },
  secondary: { color: colorVars.text.secondary },
});
