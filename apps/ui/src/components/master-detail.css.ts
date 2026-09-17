import { style } from "@vanilla-extract/css";
export const root = style({
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(240px,320px)",
  gap: 30,
  alignItems: "start",
  selectors: { '&[data-narrow="true"]': { gridTemplateColumns: "minmax(0,1fr)" } },
});
export const primary = style({
  minWidth: 0,
  selectors: { [`${root}[data-narrow="true"] > &[data-selected="true"]`]: { display: "none" } },
});
export const detail = style({
  outline: "none",
  minWidth: 0,
  selectors: { [`${root}[data-narrow="true"] > &[data-hidden="true"]`]: { display: "none" } },
});
export const back = style({
  marginBottom: 24,
  selectors: { [`${root}[data-narrow="false"] &`]: { display: "none" } },
});
