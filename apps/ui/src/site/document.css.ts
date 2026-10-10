import { assignVars, globalStyle } from "@vanilla-extract/css";
import { dark, light } from "../foundations/color/tokens.ts";
import { elevation } from "../foundations/elevation/tokens.ts";
import { vars } from "../foundations/theme/vars.css.ts";
import { fontFamily } from "../foundations/typography/tokens.ts";

// The site's pages set their mode on the document, as Starlight does: `data-theme` on <html>, from
// the reader's choice or their system's. The app's Theme sets it on an element instead.
globalStyle(":root", {
  vars: assignVars(vars, { color: light, shadow: elevation.light }),
  colorScheme: "light",
});

globalStyle(":root[data-theme='dark']", {
  vars: assignVars(vars, { color: dark, shadow: elevation.dark }),
  colorScheme: "dark",
});

globalStyle("body", {
  margin: 0,
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.primary,
  fontFamily,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
});
