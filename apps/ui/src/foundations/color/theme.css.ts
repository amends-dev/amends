import { createGlobalThemeContract, createTheme, style } from "@vanilla-extract/css";
import { cotton, soot } from "./tokens.ts";

// Stable names keep existing consumers valid when roles are inserted or reordered.
// Only the names are global; values are still assigned by the scoped theme classes below.
export const colorVars = createGlobalThemeContract(
  cotton,
  (_value, path) => `amends-ui-color-${path.join("-")}`,
);

const canvas = style({
  backgroundColor: colorVars.surface.canvas,
  color: colorVars.text.primary,
});

/** Apply one class to a container. Values inherit; a nested scope can select its own theme. */
export const colorThemes = {
  cotton: style([createTheme(colorVars, cotton), canvas, { colorScheme: "light" }]),
  soot: style([createTheme(colorVars, soot), canvas, { colorScheme: "dark" }]),
} as const;
