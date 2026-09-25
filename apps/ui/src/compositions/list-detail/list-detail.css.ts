import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
export const root = style({ containerType: "inline-size", minWidth: 0 });
export const grid = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[6],
  "@container": {
    "(min-width: 48rem)": {
      selectors: {
        [`${root}[data-selected="true"] &`]: {
          gridTemplateColumns: "minmax(0, 1fr) minmax(18rem, 1fr)",
        },
      },
    },
  },
});
export const list = style({
  minWidth: 0,
  selectors: { [`${root}[data-selected="true"] &`]: { display: "none" } },
  "@container": {
    "(min-width: 48rem)": {
      selectors: { [`${root}[data-selected="true"] &`]: { display: "block" } },
    },
  },
});
export const detail = style({
  minWidth: 0,
  borderTop: `1px dashed ${colorVars.line.seam}`,
  paddingTop: space[5],
  "@container": {
    "(min-width: 48rem)": {
      borderTop: 0,
      paddingTop: 0,
      borderInlineStart: `1px dashed ${colorVars.line.seam}`,
      paddingInlineStart: space[6],
    },
  },
});
export const back = style([
  focusVisible,
  {
    color: colorVars.text.secondary,
    textUnderlineOffset: "0.2em",
    display: "inline-flex",
    alignItems: "center",
    minHeight: "2.75rem",
  },
]);
