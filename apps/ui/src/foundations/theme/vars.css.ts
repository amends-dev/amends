import { createGlobalThemeContract, createTheme } from "@vanilla-extract/css"
import { colorPalettes, type ColorPalette } from "../color/palettes.ts"
import { light, type ColorMode } from "../color/tokens.ts"
import { elevation } from "../elevation/tokens.ts"

// Global names, so the variables read plainly in developer tools.
export const vars = createGlobalThemeContract(
  { color: light, shadow: elevation.light },
  (_value, path) => `amends-${path.join("-")}`
)

export const paletteThemes = Object.fromEntries(
  Object.entries(colorPalettes).map(([palette, colors]) => [
    palette,
    {
      light: createTheme(vars, { color: colors.light, shadow: elevation.light }),
      dark: createTheme(vars, { color: colors.dark, shadow: elevation.dark })
    }
  ])
) as Readonly<Record<ColorPalette, Record<ColorMode, string>>>
