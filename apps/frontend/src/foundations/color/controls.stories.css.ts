import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/frontend/foundations/color/styles";
import { space } from "@amends/frontend/foundations/spacing";
import { radius } from "@amends/frontend/foundations/radius";

// Static color specimens. Border geometry and dimensions are workshop scaffolding.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
});
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[4],
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const surface = style({ padding: space[4], minWidth: 0 });
export const cases = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))",
  gap: space[5],
});
export const figure = style({ margin: 0, minWidth: 0, alignContent: "start" });
export const sample = style({
  boxSizing: "border-box",
  border: "1px dashed",
  borderRadius: radius.pill,
  padding: `${space[2]} ${space[4]}`,
  textAlign: "center",
  color: colorVars.text.primary,
});
