import { style } from "@vanilla-extract/css";

export const root = style({ containerType: "inline-size", minWidth: 0 });
export const grid = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "2.125rem",
  alignItems: "start",
  minWidth: 0,
  "@container": {
    "(min-width: 42rem)": {
      gridTemplateColumns: "minmax(0, 1fr) 19.375rem",
    },
  },
  "@media": {
    "screen and (max-width: 63.999rem)": {
      selectors: { "&&": { gridTemplateColumns: "minmax(0, 1fr)" } },
    },
  },
});
export const primary = style({ minWidth: 0 });
export const aside = style({ minWidth: 0 });
