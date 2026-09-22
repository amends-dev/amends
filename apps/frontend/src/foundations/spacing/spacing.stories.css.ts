import { style } from "@vanilla-extract/css";
import { space } from "@amends/frontend/foundations/spacing";
import { colorVars } from "@amends/frontend/foundations/color/styles";

// Specimen layout and measuring diagrams only; no layout components are exported.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const stack = style({ display: "grid", gap: space[6] });
export const group = style({ display: "grid", gap: space[3] });
export const scale = style({
  listStyle: "none",
  padding: space[0],
  margin: space[0],
  display: "grid",
  gap: space[4],
});
export const label = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space[2],
  alignItems: "baseline",
});
export const track = style({
  width: "6rem",
  maxWidth: "100%",
  height: space[3],
  backgroundColor: colorVars.surface.panel,
});
export const measure = style({ height: "100%", backgroundColor: colorVars.text.primary });
export const padding = style({ backgroundColor: colorVars.surface.panel });
export const content = style({ backgroundColor: colorVars.surface.canvas, padding: space[2] });
export const horizontal = style({
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
});
export const vertical = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});
export const block = style({
  backgroundColor: colorVars.surface.panel,
  padding: space[2],
  flexShrink: 0,
});
