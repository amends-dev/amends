import { createThemeContract } from "@vanilla-extract/css";
import { cotton, shadow, space, radius, control, duration, easing, font } from "../tokens/index.ts";

const mapValues = <T extends Record<string, number>>(values: T, unit: (n: number) => string) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, unit(value)])) as {
    [K in keyof T]: string;
  };

export const foundationValues = {
  space: mapValues(space, (n) => `${n / 16}rem`),
  radius: mapValues(radius, (n) => `${n}px`),
  control: mapValues(control, (n) => `${n / 16}rem`),
  duration: mapValues(duration, (n) => `${n}ms`),
  easing,
  font,
};

export const foundationVars = createThemeContract(foundationValues);
export const themeVars = createThemeContract({ color: cotton, shadow: shadow.cotton });
/** Importing the contract emits no theme values. The application must also import @amends/ui/styles. */
export const vars = { ...foundationVars, ...themeVars };
