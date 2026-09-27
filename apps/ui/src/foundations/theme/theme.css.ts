import { style } from "@vanilla-extract/css";
import { fontFamily, typeScale } from "../typography/tokens.ts";
import { vars } from "./vars.css.ts";

export const root = style({
  backgroundColor: vars.color.surface.canvas,
  color: vars.color.text.primary,
  fontFamily,
  fontWeight: 400,
  ...typeScale.body,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
});

export const light = style({ colorScheme: "light" });
export const dark = style({ colorScheme: "dark" });
