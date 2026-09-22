import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/frontend/foundations/color/styles";
import { space } from "@amends/frontend/foundations/spacing";

// Workshop controls and layout, not a production Button implementation.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
});
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[4],
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const surface = style({ padding: space[4], minWidth: 0 });
export const samples = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 8rem), 1fr))",
  gap: space[4],
});
export const sample = style({
  appearance: "none",
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  border: "none",
  padding: `${space[3]} ${space[4]}`,
  backgroundColor: colorVars.action.fill,
  color: colorVars.action.onFill,
});
export const disabled = style({
  opacity: 1,
  color: colorVars.text.disabled,
  backgroundColor: colorVars.action.disabled,
});
export const swatch = style({
  display: "inline-block",
  width: "1em",
  height: "1em",
  marginRight: space[2],
  verticalAlign: "middle",
  backgroundColor: colorVars.focus.ring,
});
