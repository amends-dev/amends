import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";

export const root = style({ margin: 0 });
export const tones = styleVariants({
  inherit: { color: "inherit" },
  primary: { color: colorVars.text.primary },
  secondary: { color: colorVars.text.secondary },
  success: { color: colorVars.status.success.text },
  warning: { color: colorVars.status.warning.text },
  danger: { color: colorVars.status.danger.text },
  pending: { color: colorVars.status.pending.text },
});
