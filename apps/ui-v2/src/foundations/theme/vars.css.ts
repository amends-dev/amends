import { createGlobalThemeContract, createTheme } from "@vanilla-extract/css";
import { colorModes, light, type ColorMode } from "../color/tokens.ts";
import { elevation } from "../elevation/tokens.ts";

// Global names stay distinct from @amends/ui so both can load while apps migrate.
export const vars = createGlobalThemeContract(
  { color: light, shadow: elevation.light },
  (_value, path) => `amends-v2-${path.join("-")}`,
);

export const modeThemes: Readonly<Record<ColorMode, string>> = {
  light: createTheme(vars, { color: colorModes.light, shadow: elevation.light }),
  dark: createTheme(vars, { color: colorModes.dark, shadow: elevation.dark }),
};
