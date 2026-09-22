import { createTheme, createThemeContract, style } from "@vanilla-extract/css";
import { cotton, soot } from "./tokens.ts";

export const colorVars = createThemeContract(cotton);

const canvas = style({
  backgroundColor: colorVars.surface.canvas,
  color: colorVars.text.primary,
});

/** Apply one class to a container. Values inherit; a nested scope can select its own theme. */
export const colorThemes = {
  cotton: style([createTheme(colorVars, cotton), canvas, { colorScheme: "light" }]),
  soot: style([createTheme(colorVars, soot), canvas, { colorScheme: "dark" }]),
} as const;
