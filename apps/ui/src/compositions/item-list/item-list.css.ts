import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

const rowSeam = `color-mix(in oklch, ${colorVars.line.seam} 40%, ${colorVars.surface.canvas})`;
export const root = style({
  containerType: "inline-size",
  margin: 0,
  padding: 0,
  listStyle: "none",
  minWidth: 0,
});
export const variants = styleVariants({
  plain: {},
  outline: {
    border: `1px dashed ${colorVars.line.control}`,
    borderRadius: "0.875rem",
  },
});
export const item = style({ minWidth: 0 });
const rowLayout = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "0.875rem",
  rowGap: "0.375rem",
  minWidth: 0,
  boxSizing: "border-box",
  borderBottom: `1px dashed ${rowSeam}`,
  overflowWrap: "anywhere",
  selectors: {
    "&:has(> [data-item-list-leading])": {
      gridTemplateColumns: "auto minmax(0, 1fr) auto",
    },
  },
} as const;
export const link = style([
  focusVisible,
  rowLayout,
  {
    width: "calc(100% + 1rem)",
    marginInline: "-0.5rem",
    padding: "0.875rem 0.5rem",
    borderRadius: "0.5rem",
    color: colorVars.text.primary,
    textDecoration: "none",
    textAlign: "start",
    backgroundColor: "transparent",
    selectors: {
      '&[aria-current="page"]': { backgroundColor: colorVars.action.selected },
      "&:hover": { backgroundColor: colorVars.action.hover },
      "&:active": { backgroundColor: colorVars.action.pressed },
      [`${variants.outline} &`]: {
        width: "100%",
        minHeight: "3.75rem",
        marginInline: 0,
        padding: "0.75rem 0.875rem",
        borderBottom: 0,
        borderRadius: "0.875rem",
      },
    },
  },
]);
export const row = style([
  rowLayout,
  {
    width: "100%",
    padding: "0.8125rem 0",
    textAlign: "start",
    selectors: {
      [`${variants.outline} &`]: { padding: "0.75rem 0.875rem", borderBottom: 0 },
    },
  },
]);
export const leading = style({ gridColumn: 1, gridRow: 1, display: "inline-flex", minWidth: 0 });
export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.1875rem",
  gridColumn: 1,
  minWidth: 0,
  selectors: {
    [`${link}:has(> [data-item-list-leading]) > &`]: { gridColumn: 2 },
    [`${row}:has(> [data-item-list-leading]) > &`]: { gridColumn: 2 },
  },
});
export const title = style({
  fontSize: "0.90625rem",
  fontWeight: 600,
  lineHeight: 1.35,
  minWidth: 0,
});
export const description = style({
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.5,
  color: colorVars.text.secondary,
  minWidth: 0,
});
const trailing = {
  gridColumn: 2,
  gridRow: 1,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.25rem 0.875rem",
  minWidth: 0,
  selectors: {
    [`${link}:has(> [data-item-list-leading]) > &`]: { gridColumn: 3 },
    [`${row}:has(> [data-item-list-leading]) > &`]: { gridColumn: 3 },
  },
  "@container": {
    "(max-width: 32rem)": {
      gridColumn: "1 / -1",
      gridRow: 2,
      justifyContent: "flex-start",
      selectors: {
        [`${link}:has(> [data-item-list-leading]) > &`]: { gridColumn: "2 / -1" },
        [`${row}:has(> [data-item-list-leading]) > &`]: { gridColumn: "2 / -1" },
      },
    },
  },
} as const;
export const meta = style([
  trailing,
  { fontFamily: fontFamilies.mono, fontSize: "0.6875rem", color: colorVars.text.secondary },
]);
export const actions = style(trailing);
