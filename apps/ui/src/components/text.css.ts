import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";

export const root = style({
  margin: 0,
  selectors: {
    "strong&": { fontWeight: 600 },
    "em&": { fontStyle: "italic" },
  },
});
export const inherit = style({ font: "inherit", letterSpacing: "inherit" });
export const tone = styleVariants({
  inherit: {},
  primary: { color: vars.color.text.primary },
  secondary: { color: vars.color.text.secondary },
  muted: { color: vars.color.text.muted },
  danger: { color: vars.color.status.danger.text },
  success: { color: vars.color.status.success.text },
  pending: { color: vars.color.status.pending.text },
});
