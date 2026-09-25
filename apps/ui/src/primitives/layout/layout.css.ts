import { style } from "@vanilla-extract/css";

// Local layout values, set on each component so nested layouts are independent.
export const properties = {
  gap: "--amends-ui-layout-gap",
  align: "--amends-ui-layout-align",
  justify: "--amends-ui-layout-justify",
  wrap: "--amends-ui-layout-wrap",
  gutter: "--amends-ui-layout-gutter",
  maxWidth: "--amends-ui-layout-max-width",
  track: "--amends-ui-layout-track",
} as const;
const base = style({ boxSizing: "border-box", minWidth: 0 });
export const container = style([
  base,
  {
    width: "100%",
    maxWidth: `var(${properties.maxWidth})`,
    marginInline: "auto",
    paddingInline: `var(${properties.gutter})`,
    selectors: { '&[data-align="start"]': { marginInline: 0 } },
  },
]);
const flex = style([
  base,
  {
    display: "flex",
    gap: `var(${properties.gap})`,
    alignItems: `var(${properties.align})`,
    justifyContent: `var(${properties.justify})`,
  },
]);
export const row = style([flex, { flexDirection: "row", flexWrap: `var(${properties.wrap})` }]);
export const column = style([flex, { flexDirection: "column" }]);
export const grid = style([
  base,
  {
    display: "grid",
    gap: `var(${properties.gap})`,
    alignItems: `var(${properties.align})`,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, var(${properties.track})), 1fr))`,
  },
]);
export const item = style([base]);
export const full = style({ gridColumn: "1 / -1" });
