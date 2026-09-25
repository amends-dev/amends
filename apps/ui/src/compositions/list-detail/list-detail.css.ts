import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";

export const root = style({ containerType: "inline-size", minWidth: 0 });
export const grid = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  minWidth: 0,
  gap: 0,
  "@container": {
    "(min-width: 42rem)": {
      selectors: {
        [`${root}[data-selected="true"] &`]: {
          gridTemplateColumns: "minmax(0, 1fr) 19.375rem",
          gap: "2.125rem",
        },
      },
    },
  },
  selectors: {
    [`${root}[data-selected="true"][data-narrow="true"] &`]: {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: 0,
    },
  },
});
export const list = style({
  minWidth: 0,
  "@container": {
    "(min-width: 42rem)": {
      selectors: { [`${root}[data-selected="true"] &`]: { display: "block" } },
    },
  },
  selectors: {
    [`${root}[data-selected="true"] &`]: { display: "none" },
    [`${root}[data-selected="true"][data-narrow="true"] &`]: { display: "none" },
  },
});
export const detail = style({ minWidth: 0 });
export const back = style([
  focusVisible,
  {
    color: colorVars.text.secondary,
    textUnderlineOffset: "0.2em",
    display: "inline-flex",
    alignItems: "center",
    minHeight: "2.75rem",
    "@container": { "(min-width: 42rem)": { display: "none" } },
    selectors: { [`${root}[data-narrow="true"] &`]: { display: "inline-flex" } },
  },
]);
