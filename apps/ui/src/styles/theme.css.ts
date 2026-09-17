import { createGlobalTheme, globalStyle } from "@vanilla-extract/css";
import { cotton, soot, inverse, shadow } from "../tokens/index.ts";
import { foundationValues, foundationVars, themeVars } from "./contract.css.ts";

createGlobalTheme(":root", foundationVars, foundationValues);
createGlobalTheme(':root, [data-theme="cotton"]', themeVars, {
  color: cotton,
  shadow: shadow.cotton,
});
createGlobalTheme('[data-theme="soot"]', themeVars, { color: soot, shadow: shadow.soot });
createGlobalTheme('[data-surface="inverse"]', themeVars, { color: inverse, shadow: shadow.soot });

globalStyle(':root, [data-theme="cotton"]', { colorScheme: "light" });
globalStyle('[data-theme="soot"], [data-surface="inverse"]', { colorScheme: "dark" });
